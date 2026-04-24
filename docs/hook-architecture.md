# Hook Architecture — ido4dev

**Status:** Active (Phase 3 Stages 1–7 shipped; Stages 8–9 in progress)
**Scope:** the plugin's hook layer — `hooks/hooks.json`, `hooks/scripts/`, `hooks/lib/`, `hooks/rules/`
**Owner:** rule files + state-schema changes = the plugin maintainer; suite-level design principles = `~/dev-projects/ido4-suite/docs/hook-and-rule-strategy.md`
**Verification:** `tests/validate-plugin.sh` + `tests/rule-runner-unit.test.mjs` + `tests/rule-file-integration.test.mjs`

This is the canonical plugin-side reference for ido4dev's hook architecture. It complements the suite-level `hook-and-rule-strategy.md` (which defines principles, canonical patterns, and anti-patterns across the suite) by documenting **what actually exists in this plugin, where it lives, and how to extend it**.

Read this doc to answer "where is X?" or "how do I add Y?" Read the strategy doc to answer "why is it designed this way?" or "is pattern Z a good fit for my case?"

---

## What this doc defines

The mechanical shape of ido4dev's Phase 3 hook layer:

- Directory layout and file conventions
- The rule-runner library's API + runtime
- Rule file format (schema, fields, evaluation semantics, response shapes)
- State layer (`state.json`) schema and semantics
- Testing model (unit + integration + sibling fixtures)
- How to add a new rule file (extension procedure)
- Validation surface (what `validate-plugin.sh` checks)
- Failure modes and graceful degradation

It does NOT define:

- Suite-level principles (§2 of the strategy doc) or the selection method for new patterns (§3)
- Engine-side contracts (see `mcp-runtime-contract.md`)
- Phase 4 PM-agent autonomy — that's separate; this doc only ships the escalation slot

---

## Directory layout

```
hooks/
├── hooks.json                        # Claude Code hook entries (Pre/PostToolUse/SessionStart/SessionEnd)
├── lib/
│   ├── rule-runner.js               # the runner — pure Node, zero runtime npm deps
│   ├── state.js                     # state.json read/write/coerce/update wrapper
│   └── vendored/
│       ├── yaml.js                  # js-yaml UMD bundle (MIT; version-locked)
│       ├── mustache.js              # mustache UMD bundle (MIT; version-locked)
│       ├── .yaml-version            # semver marker + .yaml-checksum
│       └── .mustache-version        # semver marker + .mustache-checksum
├── rules/
│   ├── validate-transition.rules.yaml       # PostToolUse — VT001 / VT002 / VT003
│   ├── validate-transition.test.yaml
│   ├── compliance-score.rules.yaml          # PostToolUse — CS001 / CS002 + post_evaluation.persist
│   ├── compliance-score.test.yaml
│   ├── complete-and-handoff.rules.yaml      # PostToolUse — CH001 / CH002
│   ├── complete-and-handoff.test.yaml
│   ├── assign-task.rules.yaml               # PostToolUse — AT001 + post_evaluation.persist
│   ├── assign-task.test.yaml
│   ├── pre-transition.rules.yaml            # PreToolUse — G1 skipValidation / G3 grade-low
│   ├── pre-transition.test.yaml
│   ├── pre-assign-task.rules.yaml           # PreToolUse — G5 re-assignment
│   └── pre-assign-task.test.yaml
└── scripts/
    ├── session-start-mcp.sh         # SessionStart: install @ido4/mcp, graceful-degraded
    ├── session-start-bundle.sh      # SessionStart: copy tech-spec-validator bundle
    ├── session-start-banner.js      # SessionStart: emit resume banner from state.json
    └── session-end-state.js         # SessionEnd: persist state.json atomically
```

**Principle:** rule *data* lives in `hooks/rules/`. Rule-evaluation *code* lives in `hooks/lib/`. Hook *entry-points* (the scripts `hooks.json` actually invokes) live in `hooks/scripts/`. Vendored dependencies live in `hooks/lib/vendored/`. Keep this separation strict — it's what makes rules reviewable as policy while the runner stays rarely-changed code.

---

## The rule-runner

**File:** `hooks/lib/rule-runner.js`

Pure Node, zero runtime npm dependencies. Loads YAML rule files via vendored js-yaml, renders templates via vendored Mustache, never invokes an LLM. Runs as a subprocess invoked by a Claude Code `"type": "command"` hook entry; reads the hook event JSON from stdin, writes the hook response JSON to stdout.

### Public API (exports)

| Export | Kind | Purpose |
|---|---|---|
| `evaluate({ruleFile, event, profile, profileValues, state, now})` | Pure function | Core evaluator. No I/O. Returns `{findings, escalate, stateMutations}`. This is the testable surface. |
| `runFromStdin({ruleFilePath, profilePath?, stateFilePath?, now?})` | Async I/O wrapper | Reads stdin, loads rule file + profile + state, calls evaluate, writes state + hook response. CLI entry. |
| `loadRuleFile(path)` | I/O | YAML-parse a rule file + validate its schema. Throws with a file-path-annotated error on schema violation. |
| `loadProfile(path)` | I/O | Read `.ido4/methodology-profile.json`; returns `{profile, values}`. Missing or unreadable file → `{profile: null, values: {}}`. |
| `validateRuleFile(doc, filePath)` | Pure | Schema validation; throws on violations. |
| `evalWhen(expr, ctx)` | Pure | Boolean-coerced expression evaluator used for `when:` clauses. |
| `evalExpr(expr, ctx)` | Pure | Raw-value expression evaluator used for `post_evaluation.persist`. |
| `renderString(template, ctx)` | Pure | Mustache render, error-swallowing. |
| `renderEmit(emit, ctx)` | Pure | Walk an `emit:` object and render each string field. |
| `filterByProfile(rules, profile)` | Pure | Filter rules whose `profiles:` list includes the active profile; rules without `profiles:` always apply. |
| `shouldDebounce(rule, ctx, state, now)` | Pure | Returns `{debounced, key}` based on `debounce_seconds` + `state.last_rule_fires`. |
| `formatHookResponse(event, result, ruleFile)` | Pure | Branches on `ruleFile.event` to produce the correct Claude Code hook response shape (PreToolUse permissionDecision vs. PostToolUse additionalContext). |
| `mostRestrictivePermission(decisions)` | Pure | deny > ask > allow, for multi-rule PreToolUse files. |

### CLI invocation

```
node hooks/lib/rule-runner.js --rules <path> [--profile <path>] [--state <path>]
```

Defaults:
- `--profile` — `${cwd}/.ido4/methodology-profile.json` if it exists, else null (no filter)
- `--state` — `${CLAUDE_PLUGIN_DATA}/hooks/state.json` if that env var is set

Hook entries in `hooks.json` invoke it as:

```
command -v node >/dev/null 2>&1 && node "${CLAUDE_PLUGIN_ROOT}/hooks/lib/rule-runner.js" --rules "${CLAUDE_PLUGIN_ROOT}/hooks/rules/<name>.rules.yaml" || true
```

The `|| true` ensures a missing node never breaks the session — graceful degradation per strategy §4.9.

### Trust boundary

`when:` expressions and `post_evaluation.persist` expressions run via `new Function('ctx', 'with (ctx) { return (<expr>); }')`. This is **not a generic eval surface** — rule files are authored by plugin maintainers and reviewed in-tree. Do NOT extend the runner to accept user-supplied rule files without adding a sandboxing layer.

---

## Rule file format

### Top-level schema

```yaml
version: 1                          # Required (currently always 1)
event: PreToolUse | PostToolUse     # Optional; validated. Defaults to PostToolUse semantics.
matcher: <string-or-regex>          # Documentary only; actual matching happens in hooks.json
hit_policy: first | collect | unique  # Optional; defaults to "collect"
rules: [...]                        # Required; array of rule objects
post_evaluation:                    # Optional; see §post_evaluation below
  persist:
    <state-key>: <js-expression-string>
```

### Rule object schema

```yaml
- id: <unique string>                # Required; unique within file
  when: <js-expression-string>       # Required; evaluated via with(ctx){ return (...) }
  profiles: [hydro, scrum, shapeup]  # Optional; filter by active methodology. Omit = applies to all.
  severity: info | warning | error   # Optional; defaults to "info"
  debounce_seconds: <number ≥ 0>     # Optional; suppress refire within window
  debounce_target: <template-string> # Optional; renders to a key suffix, default "*"
  escalate_to: <agent-name>          # Optional; produces advisory recommendation
  permission_decision: allow|ask|deny # Optional (PreToolUse files only)
  emit:                              # Optional; Mustache-rendered finding content
    title: <template>
    body: <template>
    cta: <template>
    <any other field>: <template-or-literal>
```

**Removed in Stage 7 (2026-04-24):** `escalate_mode`. The runner rejects rule files that still set it with an explicit error message. If Phase 4 introduces forced delegation, the re-introduction point will be a typed event envelope into a dedicated agent hook, not a mode flag on advisory rules.

### Evaluation context (the `ctx` object bound inside `when:` and persist expressions)

| Key | Source | Notes |
|---|---|---|
| `tool_input` | Event's `tool_input` | Raw client input to the tool (pre-Zod for MCP tools — unknown fields visible) |
| `tool_response` | Event's `tool_response` | PostToolUse only; empty object on PreToolUse |
| `profile` | `.ido4/methodology-profile.json` | `hydro` / `scrum` / `shapeup` / null |
| `profile_values` | Same file's `values` field | Profile-specific thresholds, limits, etc. |
| `state` | `state.json` | Read at evaluation time; see §State layer |
| `event` | Full hook event | Includes `tool_name`, `hook_event_name`, `session_id`, etc. |
| `now_ms` | Current time (ms) | Passed in via `evaluate()`; defaults to `Date.now()` |
| `now_iso` | Derived from now_ms | ISO-8601 string, useful in persist templates |

### Expression semantics

- `when:` expressions are **boolean-coerced** — any truthy value fires the rule.
- Expression errors (undefined navigation, syntax errors, thrown exceptions) are caught and logged to stderr; the rule is skipped; evaluation continues for other rules.
- `post_evaluation.persist` expressions preserve their raw return value (object/array/primitive); `undefined` is treated as no-op.
- Expressions can use modern JS features: optional chaining, nullish coalescing, array methods, etc. The runtime is Node; no polyfills needed.

### Hit policies

- `collect` (default) — every matching rule fires; findings accumulate.
- `first` — stop after the first match.
- `unique` — warn to stderr if more than one rule fires (useful for test fixtures asserting mutual exclusion).

### Debounce

`debounce_seconds: <n>` suppresses a rule from re-firing within `n` seconds of its last fire. Keyed by `<rule_id>:<debounce_target>` (target rendered per-fire via Mustache). Last-fire timestamps live in `state.last_rule_fires` and persist across sessions.

---

## Response shapes

### PostToolUse

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "<rendered findings concatenated + any escalate recommendations>"
  }
}
```

- Findings are rendered: `**<title>**\n\n<body>\n\n<cta>` joined by `\n\n---\n\n`.
- Escalation is advisory: any rule with `escalate_to:` contributes a `**Governance signal — recommend invoking \`/agents <agent>\`**` block.
- Empty response `{}` when nothing fired — Claude Code treats as allow/continue.

### PreToolUse

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "ask" | "deny" | "allow",
    "permissionDecisionReason": "<rendered findings>",
    "additionalContext": "<same rendered findings>"
  }
}
```

- `permissionDecision` comes from fired rules' `permission_decision` fields, resolved by `mostRestrictivePermission` (deny > ask > allow).
- If no fired rule declares `permission_decision`, no decision is emitted — findings go only into `additionalContext`.
- `permissionDecisionReason` is shown to Claude when denying or asking, so it can adjust its approach.

---

## State layer

**File:** `hooks/lib/state.js` (read/write wrapper) + `${CLAUDE_PLUGIN_DATA}/hooks/state.json` (on-disk schema).

### Schema

```json
{
  "version": 1,
  "updated_at": "<ISO>",
  "ended_at": "<ISO>",          // written by SessionEnd
  "last_compliance": {          // written by compliance-score.rules.yaml post_evaluation.persist
    "grade": "A"|"B"|"C"|"D"|"F",
    "score": 0-100,
    "categories": { ... },
    "timestamp_iso": "<ISO>"
  },
  "last_rule_fires": {          // merge-semantics; keyed "<rule_id>:<target>"
    "CS001_grade_drop:*": "<ISO>"
  },
  "last_assignments": {         // written by assign-task.rules.yaml post_evaluation.persist
    "<issueNumber>": "<container-name>"
  },
  "open_findings": []           // reserved for future population
}
```

### Type coercion (Stage 5 fix)

`state.coerce(raw)` preserves **all** top-level fields from the input, type-checks the critical ones (`last_compliance`, `last_rule_fires`, `open_findings`), and drops wrong-typed metadata strings. This is load-bearing for `post_evaluation.persist` rules that introduce new state fields — the old behavior (dropping unknown fields) silently erased `last_assignments` across sessions.

### Write semantics

- `last_rule_fires` — **merge semantics**: each fire appends/updates one key without affecting others.
- Other keys written by `post_evaluation.persist` — **overwrite semantics**: the new value replaces the prior snapshot.
- All writes atomic via tmp + rename.

### `post_evaluation.persist` (top-of-file)

```yaml
post_evaluation:
  persist:
    last_compliance: |
      ({
        grade: tool_response.grade,
        score: tool_response.score,
        categories: tool_response.categories,
        timestamp_iso: now_iso,
      })
```

- Runs **after** rule evaluation, regardless of which rules fired — load-bearing for baselines that must advance every call (e.g., grade-drop detection).
- Each value is a JS expression evaluated against the same context as `when:` clauses.
- Expression errors warn to stderr and skip that key; `undefined` is no-op.

Rationale for top-of-file rather than per-rule: the "advance baseline always" semantic is a property of the rule file, not of individual rules. Per-rule persist would require an always-true pseudo-rule (anti-pattern) or duplicated persist across N conditional rules.

---

## Escalation

Rules declaring `escalate_to: <agent-name>` produce an advisory recommendation in the hook response:

```
**Governance signal — recommend invoking `/agents <agent>`** to review finding `<rule_id>` with full governance context.
```

**Advisory-only.** There is no runtime mechanism in Claude Code for a command hook (our runner) to trigger a `type: "agent"` hook — agent hooks are purely declarative and experimental. The primary reasoner (Opus) sees the recommendation and decides whether to delegate. This aligns with 2025–2026 SOTA for governance-class escalation (LangGraph, CrewAI, Semantic Kernel, OpenAI Agents SDK, Azure patterns).

Current consumer: `compliance-score.rules.yaml` CS001 grade-drop is the only rule using `escalate_to` today. Phase 4 (WS3 PM autonomy) tunes which additional rules earn the slot.

---

## Testing model

### Unit tests — `tests/rule-runner-unit.test.mjs`

~80 deterministic cases covering the pure-function surface:
- Expression evaluation (boolean + raw value, null/undefined navigation, optional chaining, errors)
- Mustache rendering (simple, nested, section, missing vars, HTML-escape vs. triple-brace)
- Profile filtering
- Hit policies
- Debounce (within window, outside window, target-specific key)
- State coerce (critical-field type-check, unknown-field preservation)
- Schema validation (every rejection case)
- `post_evaluation.persist` round-trips
- PreToolUse response shape + most-restrictive-wins
- Context helpers (`now_iso`, `now_ms`)

Run: `node tests/rule-runner-unit.test.mjs` — zero network, zero LLM, milliseconds per case.

### Integration tests — `tests/rule-file-integration.test.mjs`

Walks every `hooks/rules/*.rules.yaml`, loads the sibling `*.test.yaml`, runs each case through `runner.evaluate()`, asserts:

- **`fired:`** — exact rule IDs that fired
- **`severity:`** — severity of the first finding
- **`title_contains:` / `body_contains:` / `cta_contains:`** — substring checks
- **`state_after_merge:`** — partial-match assertion after `post_evaluation.persist` applies (uses `state_before:` as the evaluation's initial state)

Also asserts: every rule in a rule file has ≥1 fixture expecting it to fire (catches rule-without-test drift).

Run: `node tests/rule-file-integration.test.mjs`.

### Fixture format

```yaml
rule_file: <sibling rules filename>
cases:
  - name: <descriptive>
    profile: hydro | scrum | shapeup
    state_before: { ... }             # optional; seeds state
    input:
      tool_name: <full MCP tool name>  # for regex-matcher rule files
      tool_input: { ... }
      tool_response: { ... }          # PostToolUse only
    expect:
      fired: [ <rule_id>, ... ]
      severity: info | warning | error
      title_contains: <substring>
      body_contains: <substring>
      state_after_merge: { ... }      # optional; partial-match against post-eval state
```

---

## How to add a new rule file

1. **Choose a matcher.** Usually one MCP tool per file, or a regex covering a tool family (e.g., `assign_task_to_(wave|sprint|cycle)`). Use `^...$` anchors for safety.
2. **Create `hooks/rules/<name>.rules.yaml`.** Declare `event:`, `matcher:`, `hit_policy:` (usually `collect`), and one or more rules.
3. **Verify the signal shape.** Before writing `when:` expressions, confirm the tool response fields actually exist in `@ido4/mcp`'s output. Four consecutive Phase 3 stages had to correct briefs that assumed non-existent fields — verification is cheap, correction is expensive.
4. **Write rules against real fields.** Keep each rule's test: "does this operationalize institutional memory, or is it noise?" (See strategy doc §2.6.) Cut rules that don't pass.
5. **Use triple-brace Mustache `{{{ ... }}}` for prose fields.** Default double-brace HTML-escapes; regression-guard test enforces this.
6. **Create sibling `hooks/rules/<name>.test.yaml`.** At least one positive case per rule, at least one negative case, at least one case per methodology where relevant.
7. **Wire into `hooks/hooks.json`** under the right event (`PreToolUse` / `PostToolUse`). Use `command -v node ... || true` pattern for graceful degradation.
8. **Update `validate-plugin.sh` MIGRATED_MATCHERS** if replacing a legacy `"type": "prompt"` hook (so the no-prompt grep check covers it).
9. **Run** `bash tests/validate-plugin.sh` + `node tests/rule-file-integration.test.mjs`. Both should be green before commit.

---

## Validation surface (what `validate-plugin.sh` checks)

Phase 3-specific sections:

- **§L Hook scripts** — every `hooks/scripts/*.{sh,js}` exists, is executable, has valid syntax, is referenced in `hooks.json`.
- **§M Hook library** — `hooks/lib/rule-runner.js` + `state.js` exist + valid Node syntax + export the expected surface.
- **§N Vendored bundles** — yaml + mustache bundles exist, have upstream banner, version marker matches regex, checksum matches bundle.
- **§O Rule files + integration tests** —
  - `hooks/rules/` exists and has ≥1 `.rules.yaml`
  - every `.rules.yaml` has a sibling `.test.yaml`
  - every `.rules.yaml` passes schema validation via `loadRuleFile`
  - integration tests pass
  - no `"type": "prompt"` for any migrated matcher (currently: `validate_transition`, `assign_task_to_`, `compute_compliance_score`, `complete_and_handoff`)
  - expected PreToolUse hooks are wired (`pre-transition`, `pre-assign-task`)
  - rule-file `event:` declarations match their wiring in `hooks.json`

Currently passing: 108/0/1 as of Stage 7.

---

## Failure modes

| Scenario | Behavior | Design rationale |
|---|---|---|
| Node not available | Hook exits 0 (via `|| true`); tool call proceeds without governance signal | Graceful degradation (strategy §4.9) |
| `state.json` missing or corrupt | `state.read()` returns empty state; evaluation continues | State is a cache, not a source of truth |
| Rule file YAML parse error | `loadRuleFile` throws with file-path annotation; runner exits 0 writing `{}` to stdout | Never block the session on plugin errors |
| `when:` expression error | Rule skipped, stderr warning, evaluation continues for other rules | One bad rule doesn't poison the file |
| Mustache render error | Template returned as-is, stderr warning | Prefer degraded output over blank |
| `post_evaluation.persist` error | Key skipped, stderr warning, other persist keys continue | Rules should not fail stateful rules |
| Stdin empty or unparseable | Runner exits 0 with `{}`; stderr warning | Hooks get called in various contexts |
| Unknown rule-schema field | Runner still accepts most unknown fields; schema validates only documented ones | Forward-compatibility with new rule fields |
| Legacy `escalate_mode` field | Rule file rejected with clear error pointing at Stage 7 | Stage 7 cleanup; enforces migration |

The overarching rule: **hooks must not break sessions**. Errors degrade silently to stderr; stdout always gets a valid JSON response.

---

## Current rule inventory

As of Stage 7 (2026-04-24):

| File | Event | Matcher | Rules | Purpose |
|---|---|---|---|---|
| `validate-transition.rules.yaml` | PostToolUse | `mcp__plugin_ido4dev_ido4__validate_transition` | VT001, VT002, VT003 | BRE block + passed-with-warnings + approved-with-suggestions |
| `compliance-score.rules.yaml` | PostToolUse | `mcp__plugin_ido4dev_ido4__compute_compliance_score` | CS001 (+escalate_to), CS002 | Grade drop + category threshold crossing. Stateful. |
| `complete-and-handoff.rules.yaml` | PostToolUse | `mcp__plugin_ido4dev_ido4__complete_and_handoff` | CH001, CH002 | Cascade unblock + strong-next-task recommendation |
| `assign-task.rules.yaml` | PostToolUse | `^mcp__plugin_ido4dev_ido4__assign_task_to_(wave\|sprint\|cycle)$` | AT001 | Integrity violation + persist `last_assignments` |
| `pre-transition.rules.yaml` | PreToolUse | `^mcp__plugin_ido4dev_ido4__(refine\|...\|return)_task$` | G1, G3 | skipValidation bypass + approve-when-compliance-low |
| `pre-assign-task.rules.yaml` | PreToolUse | `^mcp__plugin_ido4dev_ido4__assign_task_to_(wave\|sprint\|cycle)$` | G5 | Re-assignment warning |

---

## Deferred / tracked items

- **Event log promotion** (§4.7 of strategy doc, §7.7 of evolution plan) — upgrade from `state.json` to `events.ndjson` when the first rule genuinely needs cross-session event history. Five concrete pending triggers documented.
- **Memory architecture** (§7.8 of evolution plan) — cross-cutting investigation; kickoff brief at `~/dev-projects/ido4-suite/briefs/memory-architecture-investigation.md`.
- **Forced-delegation primitive** — if Phase 4 concludes we need it, re-introduce via typed event envelope into a dedicated agent hook, not via a mode flag on advisory rules.
- **Stage 3.5** — optional `@ido4/mcp` enrichment closing `mcp-runtime-contract.md:76` cascade drift; deferred indefinitely, no rule required it.

---

## Related reading

- `~/dev-projects/ido4-suite/docs/hook-and-rule-strategy.md` — suite-level principles and canonical patterns (§2 principles, §3 selection method, §4 canonical patterns, §5 anti-patterns)
- `~/dev-projects/ido4dev/docs/phase-3-brief.md` — execution spec for Phase 3, including the four research-correction status-log entries
- `~/dev-projects/ido4dev/docs/architecture-evolution-plan.md` — master plan (§3.9 product thesis, §7.7 event log, §7.8 memory, §8 WS2, §11 status log)
- `~/dev-projects/ido4dev/docs/mcp-runtime-contract.md` — adjacent contract (the MCP runtime dependency this plugin consumes)
- `~/dev-projects/ido4-suite/docs/prompt-strategy.md` — authoring patterns for skills/agents/prompts (sister reference to this doc)
