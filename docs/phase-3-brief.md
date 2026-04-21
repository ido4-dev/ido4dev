# Phase 3 Design Brief: WS2 Hooks Rebuild

**Status:** Draft — 2026-04-20. Awaiting user review before commit.
**Parent plan:** `~/dev-projects/ido4dev/docs/architecture-evolution-plan.md` §8 WS2.
**Predecessors:** `phase-2-brief.md` (closed 2026-04-20 via `reports/e2e-004-phase-2-smoke.md`).
**Successor:** `phase-4-brief.md` (WS3 PM Agent Autonomy — to be written after Phase 3 lands).

This brief turns the §8 WS2 architectural scoping into a concrete execution spec. It commits the hook-taxonomy choice, rule-file format, architectural backbone, and execution sequence. Where the design makes novel calls (things no prior art solves directly), those are named explicitly and justified.

Phase 3 rebuilds the hook layer so it is:
- **Deterministic** — no `"type": "prompt"` for interpreting structured tool responses (per §3.1).
- **Rich enough to support autonomous-PM activation** — every surface WS3 needs is in place, even if WS3's reasoning layer isn't built yet.
- **Graceful under failure** — no silent dead plugin when a SessionStart subprocess fails.
- **Profile-aware** — hook rules dispatch differently for Hydro/Scrum/Shape Up via a data-driven loader, not hardcoded branches.
- **Testable** — every rule has sibling test fixtures; no LLM in the verification path.

---

## 1. Goal (end-of-phase state)

- All `PostToolUse` hooks use `"type": "command"`, not `"type": "prompt"`. LLM exits the interpretation layer entirely.
- A rule-runner library (`hooks/lib/rule-runner.js`) evaluates YAML rule files against tool responses and emits structured findings.
- Rule files live at `hooks/rules/*.rules.yaml` — one per MCP tool matcher group.
- Every hook rule is methodology-aware via a `profiles:` list; the loader pre-filters to the active profile at evaluation time.
- PreToolUse hooks gate `validate_transition` (non-dry-run), `assign_task_to_*`, and any other risky transition with `permissionDecision: "ask"`.
- A SessionEnd / Stop hook persists session state to `${CLAUDE_PLUGIN_DATA}/session-state.json` so a future SessionStart can read it (the initiative-layer substrate that WS3 will consume).
- SessionStart has a graceful degradation path: if `@ido4/mcp` install fails, emit a user-visible warning and let the session continue with whatever surface is still usable.
- An append-only event log at `${CLAUDE_PLUGIN_DATA}/hooks/events.ndjson` records every hook invocation for cross-turn pattern detection (the reactive-layer substrate WS3 will consume).
- PM agent is *invocable from hooks* (via `"type": "agent"` or `additionalContext` delegation) — but auto-activation logic is WS3 scope, not Phase 3. Phase 3 ships the slot; Phase 4 fills it.
- `validate-plugin.sh` has new sections covering rule-runner structure, rule-file schema validity, hit-policy enforcement, and event-log rotation.
- `CLAUDE.md` documents the hook strategy so future changes stay coherent.

---

## 2. Why this design — research provenance

The architectural choices in this brief are grounded in a prior-art survey run 2026-04-20 (see `reports/` if archived; otherwise summarized inline here). Key findings:

**From Claude Code's own docs (authoritative):**
- 26 hook events are available (SessionStart, PostToolUse, PreToolUse, Stop, UserPromptSubmit, Notification, SubagentStart/Stop, TaskCreated/Completed, PreCompact/PostCompact, etc.).
- `"type": "prompt"` hooks are explicitly reserved for "decisions requiring judgment" — *not* for processing structured tool results. The current hooks violate this.
- Hooks communicate via exit codes + structured JSON (stdout). Most-restrictive wins across multiple matching hooks.
- Three hook types: `command` (subprocess), `prompt` (LLM, single-turn), `agent` (multi-turn LLM with tool access). The `agent` type is load-bearing for WS3 — it's the clean primitive for PM activation.
- SessionStart failures don't kill the session unless the hook `exit 2`s; `exit 0` on error allows graceful degradation.
- Skill-scoped hooks are not first-class; workaround via the `if:` field (v2.1.85+).
- Stop hook fires per-turn (not session-end); has `stop_hook_active` flag to prevent infinite loops. Session-end uses the distinct `SessionEnd` event.
- Hook configuration merges across plugin/user/project; it does NOT override.

**From state-of-the-art agent frameworks:**
- **LangGraph / Semantic Kernel / OpenAI Agents SDK** all converge on `before / after / around` middleware vocabulary and on "cheap deterministic check first; escalate to LLM only when the check genuinely requires judgment" (OpenAI calls this tripwires; Semantic Kernel calls it filters).
- **CrewAI** uses typed event classes (100+) over string matchers — more expressive and IDE-friendly.
- **Claude Code hooks, Cursor hooks, Cline hooks** converge on the same shape (config JSON + lifecycle events + exit-code semantics + decision JSON) — we're on the de-facto standard substrate.
- **Cline's `contextModification` field** explicitly frames post-hoc feedback as *context injected into the agent's next turn* — the right mental model for our insight surfacing.
- **Claude Code hooks are stateless per-invocation.** That's the gap: cross-turn temporal pattern detection ("3 edits in 90 seconds", "same dependency blocking 2+ tasks across this session") needs state somewhere. We close this gap with an append-only event log, borrowing from **event sourcing / CQRS**.
- **Behavior Trees** (game AI) contribute the `Condition / Decorator / Selector` vocabulary. Conditions are pure predicates; Decorators handle cooldowns and rate-limiting; Selectors implement fallback chains (cheap check → expensive check → LLM judgment). We borrow this vocabulary for the rule language, not the runtime.
- **RxJS operator vocabulary** (`filter`, `debounce`, `buffer`, `combineLatest`) is the cleanest language-design substrate for temporal patterns. We borrow operator *names* and *semantics*; we don't import a runtime.

**From non-AI rule engines:**
- **Prometheus alerting rules** are the closest prior-art match to our specific shape: watch structured event → deterministic rule → templated message. YAML files with `expr` / `for` / `labels` / `annotations` using Go `text/template`. We adopt this shape.
- **Multi-match behavior vocabulary** (first / collect / unique) from DMN hit policies. We adopt the behavior names; we don't adopt DMN itself.
- **Mustache** for templated output across n8n, Prometheus, EventBridge. We adopt it for `emit:` templates.
- **Pre-filtered rule lists for scoping** (OPA's constraint-template pattern, simplified) — the model for methodology-awareness, collapsed to a `profiles:` list field on each rule.

**Deliberately rejected despite research convergence (with rationale):**
- **JSON Logic** for the `when:` condition language. Research converged on it, but fit-testing against our actual needs: we're Node-only (portability doesn't pay), operator-in-key-position syntax (`{"==": [...]}`) is harder to read than equivalent JS expressions, and the safety argument (no-eval for declarative) doesn't apply to rule files we author ourselves. We use **inline JS expressions** instead — clearer, more expressive, equally LLM-reviewable. See §4.1.
- **Full event-sourcing log** as Phase 3 backbone. Research flagged the cross-turn statelessness gap, but fit-testing against Phase 3's actual rule set: compliance delta + debounce + WS3 initiative layer can all be served by a small state file + in-session buffer. The full event log is a real architectural pattern but YAGNI for current scope. We ship the simpler layer with a documented upgrade trigger. See §4.2.

The rejections above are examples of the selection method we follow throughout: adopt when a pattern fits a real need, reject when adoption would be ceremony without payoff, document the rationale either way. See the suite-level reference `~/dev-projects/ido4-suite/docs/hook-and-rule-strategy.md` for the selection method itself.

**Honest gaps in prior art (where we're in novel territory):**
- Cross-turn temporal pattern detection on an AI-agent tool-call stream at scale: no published precedent. Every surveyed coding-agent hook system is stateless. Our event-log backbone is a genuine contribution.
- Methodology-aware governance rules (epic integrity, dependency coherence, ceremony sequencing): no prior art in OPA/Guardrails/Aembit style systems. Rule *content* is uniquely ido4.
- Declarative "this condition → template; that condition → LLM sub-agent" routing as a first-class primitive: not surfaced anywhere. Our `emit:` + `escalate_to:` fields are new.
- "Silent observer that surfaces on pattern" as a documented design for coding agents: not published. We should write this up once it works (not in scope for the brief; noted for later).

---

## 3. Architecture overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Claude Code runtime                                                          │
│                                                                               │
│  MCP tool call                                                                │
│     │                                                                         │
│     │  (Claude Code dispatches hook events before/after/around tool calls)    │
│     ▼                                                                         │
│  hooks/hooks.json ──► matcher ──► command | agent | prompt                    │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘
                          │
                          │ (subprocess with stdin = hook event JSON)
                          ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  hooks/lib/rule-runner.js (Node, zero external deps)                          │
│                                                                               │
│  1. Read event JSON from stdin                                                │
│  2. Determine active methodology profile (from .ido4/methodology-profile.json)│
│  3. Load rule file for this event (hooks/rules/<event>.rules.yaml)            │
│  4. Filter rules by `profiles:` field                                         │
│  5. Evaluate each rule's `when:` (inline JS expression) against event         │
│     Context: { tool_input, tool_response, profile, profile_values, state }    │
│  6. Apply hit policy (first / collect / unique)                               │
│  7. Render `emit:` fields via Mustache against the event + rule context       │
│  8. Update hooks/state.json if the rule records state, and fire-timestamps    │
│     in the in-session buffer (for debounce)                                   │
│  9. Emit structured JSON response (findings + permission decision)            │
└──────────────────────────────────────────────────────────────────────────────┘
                          │
                          │ (stdout = JSON matching Claude Code's hook schema)
                          ▼
                     Claude Code merges results across matching hooks,
                     picks most-restrictive decision, injects findings
                     as `additionalContext` or surfaces to user per schema.
```

Two architectural layers, separated cleanly:

1. **The rule-runner library** — pure code, no domain knowledge. Loads rules, evaluates conditions, renders templates, writes to the event log. One file, ~300 LOC target. Testable in isolation.
2. **The rule files** — pure data, no code. Each file is scoped to one matcher group (one MCP tool or tool family). Written by humans, reviewed by humans + LLM reviewers, tested by sibling `*.test.yaml` fixtures.

The split is deliberate: rules are where the methodology expertise lives; the runner is mechanical. Codex reviewing the runner reviews code; Codex reviewing rules reviews policy. Different review shapes, different cadences.

---

## 4. Committed design decisions

### 4.1 Rule file format

YAML file, one per matcher group. Example (`hooks/rules/validate-transition.rules.yaml`):

```yaml
version: 1
event: PostToolUse
matcher: mcp__plugin_ido4dev_ido4__validate_transition
hit_policy: collect
rules:
  - id: VT001_blocked_by_bre
    when: "tool_response.canProceed === false"
    profiles: [hydro, scrum, shapeup]
    severity: warning
    emit:
      title: "BRE blocked: {{ tool_input.transition }} on #{{ tool_input.issueNumber }}"
      body: |
        {{ tool_response.reason }}

        {{#tool_response.details}}
        - [{{ severity }}] {{ stepName }}: {{ message }}
        {{/tool_response.details}}
      cta: "Review suggestions[] or run /mcp__plugin_ido4dev_ido4__compliance for governance context."

  - id: VT002_passed_with_warnings
    when: "tool_response.canProceed === true && tool_response.details.some(d => d.severity === 'warning')"
    profiles: [hydro, scrum, shapeup]
    severity: info
    emit:
      title: "Transition permitted with warnings: {{ tool_input.transition }} on #{{ tool_input.issueNumber }}"
      body: "BRE approved with {{ tool_response.metadata.warnedSteps }} warning(s). Review details[] for specifics."
```

_Note: earlier drafts of this section included a `VT002_cascade_unblock` example referencing `tool_response.metadata.unblockedCount` — fields that don't exist on `ValidationResult`. The 2026-04-21 research pass corrected this (see §10). Cascade rules belong on matchers that actually produce cascade data (`complete_and_handoff` returns `newlyUnblocked[]`); see §5 Stage 4._


**Rationale:**
- YAML is reviewable, diffable, and universally understood. JSON alternative was rejected because multi-line template strings (Mustache) are painful in JSON.
- **Inline JS expressions in `when:`** — evaluated against a sandboxed `{ tool_input, tool_response, profile, profile_values, state }` context. Reviewable by any engineer and by LLM code reviewers; more expressive than JSON Logic (optional chaining, nullish coalescing, array methods) and clearer to read. Runner uses `new Function('ctx', 'with(ctx) return (' + expr + ')')` wrapped in a try/catch — no unlimited `eval` surface; expression scope is the context object.
- Mustache in `emit:` fields is the convention across n8n, Prometheus, EventBridge. Plain Mustache (not Handlebars — no helpers) keeps it deterministic.
- `severity` maps to Claude Code's hook decision semantics — `info` → advisory additionalContext; `warning` → additionalContext + PM flag; `error` → may upgrade to a decision.block.
- `debounce_seconds` is a Decorator-inspired rate-limit primitive — prevent rule re-fire within a window, checked against the in-session fire-timestamp buffer.
- `profiles:` list is a scoping filter. Loader filters rules before evaluation, so rule bodies never need `if profile == hydro` branches. (If the suite grows to ~20 methodology variants we may want an `exclude_profiles:` shortcut; until then the include-list is simpler.)

### 4.2 Session state layer (minimal, not a full event log)

**Phase 3 scope does not need a full append-only event log.** The actual rules in Phase 3 need three things from a state layer: (a) last-known values for drift detection (compliance grade), (b) fire timestamps for debounce, (c) cross-session persistence for WS3's initiative layer. All three are served by a small state file + in-session memory.

**On-disk state file:**

```
${CLAUDE_PLUGIN_DATA}/hooks/state.json
```

Small JSON file written by SessionEnd, read by SessionStart. Schema:

```json
{
  "version": 1,
  "session_id": "...",
  "updated_at": "2026-04-21T14:32:10.422Z",
  "last_compliance": {
    "grade": "B",
    "score": 82,
    "timestamp": "2026-04-21T14:30:00.000Z"
  },
  "last_rule_fires": {
    "VT001_blocked_by_bre:42": "2026-04-21T14:30:15.000Z",
    "CS001_grade_drop:project": "2026-04-21T14:00:00.000Z"
  },
  "open_findings": [
    {
      "rule_id": "CS001_grade_drop_to_D",
      "first_seen": "2026-04-21T13:00:00.000Z",
      "title": "...",
      "resolved": false
    }
  ]
}
```

**In-session buffer:**

An in-process object (single-file runner process, no persistence) the runner maintains for the current session — the same shape as `last_rule_fires` but written only while the session is live. Flushed to `state.json` on SessionEnd. Purely for within-session debounce/rate-limiting.

**What this enables (actual Phase 3 needs):**

- Compliance grade drift detection — `last_compliance.grade` compared to current grade at PostToolUse on `compute_compliance_score`. Simple read + compare.
- Rule debounce — `last_rule_fires[ruleId:target]` timestamp compared against current time. Simple read + compare.
- WS3 initiative layer (consumed in Phase 4) — `open_findings[]` lists anything still unresolved at session end; SessionStart surfaces as resume banner.

**What this deliberately does NOT do:**

- Store every hook invocation (that's a full event log — YAGNI for current rules)
- Support replay for rule development (no historical event stream)
- Support "X happened N events ago" style queries (no event history)
- Provide an audit trail (audit trail lives in the MCP server's own audit domain; hooks don't need to duplicate it)

**Documented upgrade trigger to a full event log:**

Promote from `state.json` to an append-only `events.ndjson` when the first rule legitimately requires cross-session event history — for example, a rule like "same dependency has blocked 2+ tasks over the last 7 days, across sessions." When that trigger fires:

1. Extend `hooks/lib/rule-runner.js` to append structured events to `events.ndjson` alongside the state.json update
2. Add rotation (10 MB or 30 days, keep 3 rotated files gzipped — total bounded at ~40 MB)
3. Add a query API the runner exposes to rules (e.g., `state.query_events({since, matching})` callable from rule `when:` expressions)
4. Document the upgrade in the suite-level `hook-and-rule-strategy.md`

The state file and event log are not either/or — they're layered. `state.json` stays as the fast-access summary; `events.ndjson` becomes the raw history when history is actually needed. For Phase 3, we ship only the former.

**Why this is the right starting point, not a capitulation:**

The full event log is architecturally correct but behaviorally over-engineered for Phase 3's rule set. Shipping rotation logic, schema versioning, and replay tooling for a use case no current rule needs is exactly the "adoption for adoption's sake" pattern this design is rejecting. When we need cross-session history, we add it — with working rules and concrete queries driving the design, not speculation about what rules might want.

### 4.3 Hook taxonomy — which of Claude Code's 26 events Phase 3 uses

| Event | Current state | Phase 3 action |
|---|---|---|
| **SessionStart** (matcher: `startup`) | 2 command hooks (npm install, bundle copy) | Keep both; add graceful-degradation wrapper. Add third hook: read `state.json` (if present), emit user-visible "resuming — last compliance B, N open findings" banner. Substrate for WS3 initiative layer. |
| **SessionEnd** | Not used | New. Persist session state to `state.json` — last-seen compliance grade, last-rule-fires snapshot, open findings. Consumed by next SessionStart. |
| **Stop** (per-turn) | Not used | Not used in Phase 3 (no per-turn logic needs it; session-end use goes to `SessionEnd`). Reserved for WS3. |
| **PreToolUse** on `validate_transition` | Not used | New. Rule file `pre-validate-transition.rules.yaml`. If `tool_input.dryRun !== true` AND the transition is in a risky set (e.g., `approve` without preceding `review`), return `permissionDecision: "ask"` with a templated confirmation message. |
| **PreToolUse** on `assign_task_to_*` | Not used | New. Rule file `pre-assign-task.rules.yaml`. Deterministically detect obvious integrity violations (same-epic tasks in the proposed container's siblings — requires event-log query) and surface `ask` if found. |
| **PostToolUse** on `validate_transition` | `"type": "prompt"` — violates §3.1 | **Rewrite.** Rule file `validate-transition.rules.yaml`. Templated findings: BRE blocked, cascade unblock, milestone completion. No LLM. |
| **PostToolUse** on `assign_task_to_(wave\|sprint\|cycle)` | `"type": "prompt"` — violates §3.1 | **Rewrite.** Rule file `assign-task.rules.yaml`. Templated findings: integrity violation, forward dependency. No LLM. |
| **PostToolUse** on `compute_compliance_score` | Not used | New. Rule file `compliance-score.rules.yaml`. Detect grade drop vs. last-seen-in-log; surface "Compliance dropped from B to C this session" with templated per-category breakdown. This is exactly where WS3's reactive PM-activation hook will hang. |
| **UserPromptSubmit** | Not used | Not used in Phase 3. (Reserved for later consideration — could inject governance context before every prompt, but too aggressive to ship without user feedback.) |
| **PostCompact** | Not used | New. Reseed PM context from `session-state.json` after context compaction, so the agent doesn't lose its governance situational awareness. Lightweight: one command hook that prints the state summary as additionalContext. |
| **SubagentStart / SubagentStop** | Not used | Not used in Phase 3. Reserved for Phase 4 WS3 instrumentation (which subagents does the PM spawn, etc.). |
| **TaskCreated / TaskCompleted** | Not used | Not used in Phase 3. Observability-only; no governance consequence. |
| **Notification / PermissionRequest / PermissionDenied** | Not used | Not used in Phase 3. Not governance-relevant. |
| **InstructionsLoaded / ConfigChange / CwdChanged / FileChanged / Worktree* / Elicitation** | Not used | Not used in Phase 3. No near-term governance value. |

**Rationale for the taxonomy:**
- Use every event that closes a §4.2 debt item or enables WS3; skip events that don't have clear governance value.
- Don't invent uses for events to show breadth; silence is a feature.
- `SessionEnd` + `PostCompact` + `SessionStart` together form the initiative-layer substrate WS3 needs. They're Phase 3 work because the infrastructure must exist before Phase 4 can consume it.

### 4.4 PM agent activation mechanism

Phase 3 ships the *slot* for PM activation from hooks; Phase 4 (WS3) fills it with the actual pattern-recognition logic.

**The slot:** any rule in any rule file can have an `escalate_to:` field:

```yaml
rules:
  - id: CS001_grade_drop_to_D
    when:
      and:
        - "==": [{ var: "tool_response.grade" }, "D"]
        - "in":  [{ var: "tool_response.metadata.previous_grade" }, ["A", "B"]]
    profiles: [hydro, scrum, shapeup]
    severity: error
    emit:
      title: "Compliance dropped sharply: previous {{ tool_response.metadata.previous_grade }} → current {{ tool_response.grade }}"
    escalate_to: project-manager   # <<<<< the slot
```

When the rule runner sees `escalate_to:`, it returns a hook response including:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "<templated finding>\n\nRecommend: /agents project-manager"
  }
}
```

Or, if the rule has `escalate_mode: direct`, the runner invokes the agent directly via `"type": "agent"`:

```yaml
    escalate_to: project-manager
    escalate_mode: direct    # invoke via type:agent hook
```

In that case, Claude Code's `"type": "agent"` primitive takes over — multi-turn, with tool access — and the PM agent reasons on the signal without user intermediation.

**Why both modes:** `additionalContext` is non-intrusive — the agent's next turn sees the signal and decides whether to delegate; cheap and reversible. `direct` is for signals where delay is itself a failure (e.g., a compliance cliff). Phase 3 wires both but uses only `additionalContext` by default; Phase 4 tunes which rules get `direct`.

### 4.5 Profile-aware rule dispatch

```
.ido4/methodology-profile.json   ← read by rule-runner at startup
hooks/rules/*.rules.yaml         ← each rule has profiles: [...] field
hooks/rules/profile-values/
  hydro.yaml                     ← profile-specific thresholds/labels
  scrum.yaml
  shapeup.yaml
```

Rule-runner pseudocode:

```
function run(event):
  profile = read_active_profile()                            # hydro | scrum | shapeup
  values  = load_profile_values(profile)                     # wip_limit, etc.
  rules   = load_rules_for_event(event).filter(
    rule => profile in rule.profiles
  )
  for rule in rules:
    ctx = { ...event, profile: profile, profile_values: values }
    if jsonLogic.apply(rule.when, ctx):
      finding = renderMustache(rule.emit, ctx)
      output.findings.push(finding)
      if rule.escalate_to: output.escalate.push(rule.escalate_to)
  applyHitPolicy(rules.hit_policy, output)
  appendToEventLog(event, output)
  return output
```

A rule that needs profile-specific values (WIP limit, sprint length, cycle appetite) dereferences them via `{{ profile_values.wip_limit }}`. A rule that applies only to one methodology lists just that profile in `profiles:`. No `if profile == hydro` branches in rule bodies — the loader pre-filters.

This design inherits OPA's constraint-template pattern (one template + per-environment parameter files) without OPA's complexity or a separate policy language.

### 4.6 Testability model

Every rule file has a sibling `*.test.yaml`:

```yaml
rule_file: validate-transition.rules.yaml
cases:
  - name: "hydro: BRE block on non-dryrun fires VT001"
    profile: hydro
    input:
      tool_input: { dryRun: false, transition: "approve", issue: 42 }
      tool_response:
        canProceed: false
        reason: "Task not in review state"
        details:
          - { stepName: "StateGate", message: "Expected IN_REVIEW, got IN_PROGRESS", severity: "error" }
    expect:
      fired: [VT001_blocked_by_bre]
      severity: warning
      title_contains: "Transition blocked"

  - name: "scrum: same rule fires with scrum-specific terminology"
    profile: scrum
    input:
      tool_input: { dryRun: false, transition: "approve", issue: 42 }
      tool_response: { canProceed: false, reason: "...", details: [] }
    expect:
      fired: [VT001_blocked_by_bre]
```

A single test runner (`tests/rule-runner.test.mjs`) walks every `.test.yaml`, loads its rule file, runs each case through the rule-runner, asserts fired rule IDs and field patterns. Because there's no LLM in the path, tests are:
- **Deterministic** — same input → same output, always.
- **Fast** — milliseconds per case, hundreds per second.
- **CI-friendly** — exit code 0/1, integrates with `validate-plugin.sh`.

The rule-runner itself has `tests/rule-runner-unit.test.mjs` for:
- JSON Logic evaluation edge cases (null, undefined, nested paths)
- Hit policy semantics (first, collect, unique)
- Profile filtering
- Mustache rendering with missing vars
- Event log append atomicity (concurrent runs)

---

## 5. Execution sequence

Each stage is a single commit (or a coherent pair of commits). Commits land on `main` directly — no Phase 3 branch, same discipline as Phase 2 Stage 4. Each stage leaves the plugin in a working state per `validate-plugin.sh`.

### Stage 1: SessionStart hardening + graceful degradation

- Add a third SessionStart hook that reads the active profile and emits a startup summary (e.g., "ido4dev ready — methodology: Hydro, MCP server: 0.8.0").
- Wrap the existing two SessionStart hooks in a graceful-degradation pattern: if `npm install` fails, emit a user-visible stderr warning, exit 0, and the session continues with whatever surface is still usable.
- Add a SessionEnd hook that writes `session-state.json` — cursor into events.ndjson, last-seen compliance grade, active container, issues touched this session.
- Update `validate-plugin.sh` to check SessionStart/SessionEnd wiring.

*Goal of this stage:* prove the SessionStart/End pair works end-to-end before anything else depends on the state file.

### Stage 2: Rule-runner library + state layer

- Create `hooks/lib/rule-runner.js` — pure Node, zero external deps. Implements: YAML rule file loading, profile filtering, inline JS expression evaluation (sandboxed via `new Function` scoped to the context object), hit-policy application, Mustache rendering, debounce via in-session buffer.
- Vendor a tiny Mustache implementation (janl/mustache.js is MIT, ~200 LOC; vendor the file).
- Create `hooks/lib/state.js` — tiny read/write wrapper for `state.json`. Read on SessionStart, write on SessionEnd. In-memory during session. No rotation (single file, bounded size).
- Write `tests/rule-runner-unit.test.mjs` with coverage of: JS expression evaluation edge cases (null, undefined, nested paths, optional chaining), hit policies (first/collect/unique), profile filtering, Mustache rendering with missing vars, state read/write atomicity.
- Update `validate-plugin.sh` to exercise the rule-runner library against fixture cases.

*Goal of this stage:* the runtime substrate exists and is tested. Nothing consumes it yet.

### Stage 3: First PostToolUse rewrite — `validate_transition`

- Create `hooks/rules/validate-transition.rules.yaml` with 2–3 rules grounded in the actual `ValidationResult` shape (`canProceed`, `details[].severity`, `suggestions[]`, `metadata.warnedSteps`): VT001 BRE block, VT002 passed-with-warnings, optionally VT003 approved-with-suggestions.
- Create sibling `hooks/rules/validate-transition.test.yaml` with ≥2 cases per rule per profile + negative cases (≥18 cases total).
- Create the test-file walker `tests/rule-file-integration.test.mjs` per §4.6 (runs all `*.test.yaml` through `runner.evaluate()`).
- Update `hooks/hooks.json` to call the rule-runner for this matcher instead of the current `"type": "prompt"`.
- Fix the latent bug in the current prompt hook: `validate_transition` has no `dryRun` parameter (Zod strips it silently) and no `dryRun` field on the response — the existing dry-run branch is dead code. Our rules don't reference `dryRun` at all; validate_transition always fully validates.
- Run `validate-plugin.sh` + rule-runner tests; verify in a live session (invoke `validate_transition`, observe templated findings in the conversation).

*Goal of this stage:* one end-to-end path is live on real fields. Cascade/milestone/blocked-repeat rules (that brief §4.1 first hypothesized belonged on this matcher) are deliberately NOT in this stage — the engine's `ValidationResult` doesn't carry cascade or milestone data; those signals live in adjacent tools and get rule files in Stage 4.

### Stage 4: Remaining PostToolUse rewrites

- `complete_and_handoff` → `hooks/rules/complete-and-handoff.rules.yaml` + tests. This is where cascade detection belongs: the tool returns `newlyUnblocked[]` with per-task reasoning, so rules can deterministically surface "#X completion unblocks Y downstream." Replaces what the brief originally imagined as a `validate_transition` cascade rule.
- `assign_task_to_*` → `hooks/rules/assign-task.rules.yaml` + tests. Integrity + forward-dependency rules as originally planned.
- `compute_compliance_score` → `hooks/rules/compliance-score.rules.yaml` + tests. Grade-drop detection (compares current grade to `state.last_compliance.grade`). Load-bearing for WS3 reactive layer.
- Optional: `get_task_execution_data` → `hooks/rules/task-execution.rules.yaml` + tests. Surfaces downstream intelligence from `executionIntelligence.downstreamSignals[]` and `criticalPath`. Low-cost addition; high governance value.
- Optional: `validate_wave_completion` → `hooks/rules/wave-completion.rules.yaml` + tests. Milestone-completion rules using the container-service result.
- Update `hooks.json` accordingly.
- Remove all remaining `"type": "prompt"` entries. Verify none remain via a grep check in `validate-plugin.sh`.

*Goal of this stage:* §3.1 violation closed completely. Rules distributed to the matchers that actually produce the signals they detect — cascade rules on `complete_and_handoff`, milestone rules on `validate_wave_completion`, grade-drop rules on `compute_compliance_score`. No LLM in the hook interpretation layer.

### Stage 3.5 (optional, deferred — named but not committed)

If deeper research in Stage 4 surfaces a concrete rule that would benefit from cascade info *on the `validate_transition` response itself* (rather than waiting for the separate `complete_and_handoff` call), the closure is a small cross-repo beat: extend `@ido4/mcp`'s `validate_transition` handler (~5 LOC at `packages/mcp/src/tools/task-tools.ts:106-113`) with a `computeCascadeInfo()` wrapper populating `metadata.cascadeInfo`. Non-breaking per the additive-fields rule in `mcp-runtime-contract.md:84`, and already named as a contract invariant at `mcp-runtime-contract.md:76` ("no longer returning the unblock-cascade information" flagged as a breaking change). Decide when the need surfaces; don't do speculative work.

### Stage 5: PreToolUse gates

- `hooks/rules/pre-validate-transition.rules.yaml` — gate `approve` without preceding `review`, gate non-dry-run transitions on high-severity BRE failures (via event-log lookup for the most-recent dry-run on the same issue).
- `hooks/rules/pre-assign-task.rules.yaml` — gate obvious integrity violations (same-epic-different-container) detected from the event log.
- Hook response uses `permissionDecision: "ask"` with the templated confirmation message.
- Verify in a live session that a risky transition triggers the confirmation UI.

*Goal of this stage:* user has deterministic gates on risky actions, not advisory prompts.

### Stage 6: PostCompact reseed hook

- Add PostCompact command hook that reads `session-state.json` and emits a compact summary as `additionalContext` — methodology, active container, compliance grade, any unfinished governance items. Preserves PM situational awareness across context compactions.
- Unit test the reseed summary generator (separate from rule-runner).

*Goal of this stage:* context compaction no longer erases governance state.

### Stage 7: PM agent escalation slot

- Extend rule-runner to recognize `escalate_to:` and `escalate_mode:` fields.
- Default mode (`additionalContext`) injects a "recommend: /agents project-manager" suggestion when a rule with `escalate_to:` fires.
- Direct mode (`escalate_mode: direct`) wraps the finding as a `"type": "agent"` hook invocation.
- No rules use `direct` mode yet in Phase 3 — Phase 4 tunes per rule. This stage just wires the slot.
- Verify in a live session: trigger a grade-drop rule with `escalate_to: project-manager`, observe the suggestion lands in the next-turn context.

*Goal of this stage:* WS3 has its activation slot ready. Phase 4 can start writing PM-activation rules without any hook-layer code changes.

### Stage 8: Documentation + validate-plugin coverage

- Update `CLAUDE.md` with a "Hook Architecture" section documenting the rule-runner, rule file format, hit policies, escalation slots, event log.
- Update `architecture-evolution-plan.md` §11 status log.
- Update `docs/hook-architecture.md` (new) — canonical reference, mirrors `mcp-runtime-contract.md`'s style.
- Add `validate-plugin.sh` sections:
  - Rule-file schema validation (each `*.rules.yaml` parses + has required fields)
  - Rule-file has sibling `*.test.yaml`
  - No `"type": "prompt"` in `hooks.json` (grep check)
  - Event log rotation works (exercises the rotation code with a fixture log)

*Goal of this stage:* future maintainers find the hook story in one place.

### Stage 9: Phase 3 closing smoke test

Focused smoke test modeled on Phase 2's — not a full E2E, targets only new code paths. Run in a live Claude Code session:

1. Confirm SessionStart hardening: kill MCP server install, verify graceful degradation message.
2. Trigger `validate_transition` with a known-blocking state; verify templated finding appears without LLM interpretation latency.
3. Trigger `compute_compliance_score` with a grade-drop fixture; verify `escalate_to: project-manager` suggestion appears.
4. Trigger a PreToolUse gate; verify confirmation UI.
5. Run a turn, SessionEnd, restart, verify SessionStart reads `session-state.json` and emits resume banner.
6. Run context compaction; verify PostCompact reseed.

Produces `reports/e2e-005-phase-3-smoke.md`.

---

## 6. Verification

After every stage:

1. `bash tests/validate-plugin.sh` — structural green. Must stay at `0 failed`.
2. `node tests/rule-runner-unit.test.mjs` — runner passes all unit tests.
3. `node tests/rule-file-integration.test.mjs` — walks every `*.test.yaml`, runs cases, asserts.
4. `node tests/compatibility.mjs` — MCP tool surface unchanged.
5. Live test in fresh Claude Code session for the stage's new code path.

Post-phase: Stage 9 smoke test + final audit via `bash ~/dev-projects/ido4-suite/scripts/audit-suite.sh`.

---

## 7. Coordination points

- **PM agent (`agents/project-manager/AGENT.md`)** — not modified in Phase 3. WS3 (Phase 4) handles the profile-aware identity refactor and rule-tuning for `escalate_mode: direct`. This brief only ships the hook-side slot. The agent will *read* the event log in Phase 4; we must not break its future consumers.
- **`@ido4/core` / `@ido4/mcp`** — no changes. Phase 3 is 100% plugin-side.
- **Suite docs** — `ido4-suite/docs/prompt-strategy.md` references skill-scoped hooks; our approach via `if:` conditions is compatible. No suite-level docs need editing.
- **Interface contracts** — Phase 3 does not change contract #5 (MCP runtime) or #6 (tech-spec format). No contract churn.
- **Phase 4 dependencies** — every piece of infrastructure Phase 4 (WS3 PM Autonomy) needs is either already present or ships in Phase 3: event log, SessionEnd state file, escalation slot in rules, profile-aware dispatch. Phase 4 is reasoning layer only — no new hook-layer plumbing.

---

## 8. Open decisions to resolve during execution

These are flagged here so they get resolved in the right stage, not swept:

1. **Vendor Mustache, or add as npm dep?** Proposed: vendor. ~200 LOC MIT-licensed; bringing in `npm install` adds a SessionStart failure mode we just worked to harden. (JSON Logic question removed — we use inline JS expressions, no library needed for conditions.)
2. **`escalate_mode: direct` scope** — should it be allowed in Phase 3 at all, or strictly Phase 4? Proposed: wire the code path, don't use it in any Phase 3 rule. Phase 4 enables per-rule.
3. **Skill-scoped hooks via `if:`** — is this a Phase 3 or Phase 4 concern? Proposed: Phase 3 only adds one skill-scoped hook (Stop on `ingest-spec` verifying ingest succeeded). Broader use is Phase 4.
4. **UserPromptSubmit governance-context injection** — tempting for surfacing "X active issues, Y blocked" on every prompt. Too aggressive without user feedback. Proposed: not in Phase 3; consider in Phase 4 or later after Phase 3 is live for a while.
5. **Upgrade trigger from state file to event log** — what concrete rule first needs cross-session event history? Proposed: none in Phase 3; the first rule in Phase 4 or later that genuinely requires it triggers the upgrade work. Don't anticipate; respond to real use case.

Each will get resolved in its natural stage with a short status-log entry.

---

## 9. End-of-Phase checklist

- [ ] `hooks/lib/rule-runner.js` exists, ≤400 LOC, zero npm deps
- [ ] `hooks/lib/state.js` exists with read/write for `state.json`
- [ ] All `*.rules.yaml` files have sibling `*.test.yaml` files with ≥2 cases per rule per applicable profile
- [ ] `hooks/hooks.json` contains no `"type": "prompt"` entries
- [ ] SessionStart has graceful degradation (verified live)
- [ ] SessionEnd persists `state.json`; SessionStart reads it on resume
- [ ] PostCompact reseeds PM context from `state.json`
- [ ] PreToolUse gates risky transitions with `permissionDecision: "ask"`
- [ ] `escalate_to:` + `escalate_mode:` fields work; default `additionalContext` mode verified live
- [ ] `validate-plugin.sh` has new sections for rule-runner, rule-file schema, no-prompt check, state-file schema
- [ ] `CLAUDE.md` §Hook Architecture section exists, pointing at the suite strategy doc
- [ ] `docs/hook-architecture.md` exists as ido4dev-specific canonical reference (suite-level strategy lives in `ido4-suite/docs/hook-and-rule-strategy.md`)
- [ ] `architecture-evolution-plan.md` §11 status log has Phase 3 completion entry
- [ ] `reports/e2e-005-phase-3-smoke.md` captures closing smoke test
- [ ] Upgrade trigger from state file to event log documented in the suite strategy doc (no implementation; recorded so future maintainer has the path)

---

## 10. Status Log

| Date | Update |
|---|---|
| 2026-04-20 | Brief drafted from 4-stream research pass (internal survey + Claude Code hook API + state-of-the-art agent frameworks + structured-data rule engines). Initial draft adopted YAML + JSON Logic + Mustache + DMN hit policies + event-log backbone. 9-stage execution sequence. Presented for user review. |
| 2026-04-21 | User pushed back on whether adoptions were fit-for-purpose vs research-driven inertia. Audit produced two revisions: (1) JSON Logic replaced with inline JS expressions — clearer, more expressive, Node-only so portability argument didn't apply; (2) full event-log backbone replaced with minimal `state.json` + in-session buffer, with documented upgrade trigger when a rule legitimately needs cross-session event history. Everything else in the design survived the audit — every other pattern serves a current, concrete need. Suite-level `hook-and-rule-strategy.md` written as the standing reference; this brief is its first concrete application. Awaiting commit. |
| 2026-04-21 | Stage 1 shipped (commit 263f1d0): SessionStart hardening + SessionEnd state persistence. Stage 2 shipped (commit 0ee9662): rule-runner library + vendored js-yaml/mustache bundles + `hooks/lib/state.js` + 52 unit tests. Stage 2 added YAML vendoring (not in original brief; §4.1 silent on parser) mirroring the tech-spec-validator pattern; all other Stage 2 decisions match the brief. |
| 2026-04-21 | **Stage 3 research correction.** Pre-implementation investigation found the §4.1 example rule `VT002_cascade_unblock` referenced fields that don't exist on `ValidationResult` (`metadata.unblockedCount`, `metadata.unblockedRefs`). The engine intentionally keeps BRE validation-only; cascade/downstream impact lives in adjacent tools (`complete_and_handoff.newlyUnblocked[]`, `get_task_execution_data.executionIntelligence`, `get_next_task.scoreBreakdown.cascadeValue`). Similarly, milestone signals live in `validate_wave_completion` and `get_project_status`, not `validate_transition`. Corrections adopted (Option D): (a) §4.1 example rewritten with VT001 + VT002 on real fields; (b) §5 Stage 3 scope revised to 2-3 rules on real `ValidationResult` fields; (c) §5 Stage 4 expanded to include `complete_and_handoff`, optionally `get_task_execution_data` + `validate_wave_completion` — rules now distributed to the matchers that actually produce the signals; (d) new §5 Stage 3.5 named but deferred — the mcp-runtime-contract.md:76 drift (cascade info on `validate_transition`) can be closed with a 5-LOC enrichment in `@ido4/mcp`'s handler if a concrete Stage 4 rule surfaces the need. Side-finding: existing `"type": "prompt"` hook's dry-run check is dead code (Zod strips the unknown `dryRun` field; `ValidationResult` doesn't echo it); Stage 3 rules don't reference `dryRun`. |

---

## Appendix A: Research provenance

The design decisions in this brief are grounded in four parallel research streams run 2026-04-20:

**Stream 1 — Internal survey** (Explore agent): mapped current hooks.json, design principles §3.1/3.4/3.6/3.7, WS2/WS3 scoping from §8, tool response shapes (`ValidationResult`, container assignment, `ComplianceScore`), PM agent proactive-behavior prose, prompt-strategy.md guidance on rules vs principles + human checkpoint enforcement.

**Stream 2 — Claude Code hook API** (claude-code-guide agent): authoritative answers on the 26 hook events, `"type": "command"` vs `"type": "prompt"` vs `"type": "agent"`, permission decision schemas, matcher semantics for MCP tools, SessionStart failure handling, skill-scoped hooks via `if:`, multi-hook resolution via most-restrictive-wins.

**Stream 3 — State-of-the-art agent frameworks** (general-purpose agent with WebSearch): LangGraph middleware, CrewAI event bus, Semantic Kernel filters, Cursor/Cline/Continue hooks convergence, OpenAI Agents SDK tripwires, AutoGen register_reply, Behavior Trees (Condition/Decorator/Selector), RxJS operator vocabulary, Event Sourcing as backbone, Agent-as-a-Judge paper. Convergences + honest gaps.

**Stream 4 — Structured-data rule engines** (general-purpose agent with WebSearch): Drools DRL / DMN hit policies, Prometheus alerting rules, AWS EventBridge, GitHub Actions `if:`, OPA/Rego, Elasticsearch Watcher, JSON Logic, n8n/Zapier, Postgres triggers, GitLab CI rules. Concrete recommendation converged on Prometheus-shape YAML + JSON Logic + Mustache + DMN hit policies.

Each stream returned ~800–2000 words. The full findings aren't reproduced here; this brief distills the load-bearing conclusions and cites them inline where they drove a design decision.
