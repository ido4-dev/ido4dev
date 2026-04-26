# Phase 5 Design Brief: Production-Ready Release

**Status:** Draft — 2026-04-26. Awaiting user review before commit.
**Parent plan:** `~/dev-projects/ido4dev/docs/architecture-evolution-plan.md` §7.10.
**Predecessors:** `phase-4-brief.md` (closed 2026-04-25 with substrate-ships-clean verdict + 6 findings handed off; partial smoke at `reports/e2e-006-phase-4-partial.md`).
**Successor:** none planned. Phase 5 is the last phase before v1.0 real release.

This brief turns §7.10's four-workstream scope into a concrete execution spec, expanded under a senior-architect production-ready lens. Where Phase 4 shipped substrate, Phase 5 closes the gap between "system architecturally complete" and "system safe to put in front of real users on real GitHub repos." That gap has two natures — bug/correctness (F1-F7 + sandbox + Tier B) and release-readiness (docs, error UX, platform-limit honesty, full skill suite smoke). Both are scoped here.

Phase 5 ships a system that:

- **Has correct engine semantics** — `complete_task` no longer throws on invalid transitions; transition responses carry an explicit `executed: boolean`; the audit log captures attempted transitions (not just committed); the resolved methodology profile is reachable from subagents via a tool, not just a resource.
- **Has a PM agent that doesn't break trust** — minimum-sufficient evidence per audit pattern; read-then-mutate state.json discipline; imperative advisory consumption; profile knowledge grounded in a real MCP fetch.
- **Audits AI work-product content, not just state** — Tier B metrics (PR description quality, comment-trail presence, spec-to-task lineage) ship.
- **Doesn't strand real users** — sandbox creation pre-flights external dependencies; best-effort rollback on mid-flight failure; no orphan GitHub issues.
- **Surfaces governance signals visibly** — `/ido4dev:status` skill gives the user on-demand banner content; SessionStart context-injection still feeds the AI silently.
- **Documents truth** — every doc verified true against shipped reality at phase close; platform constraints named honestly; v1.0 release-ready.

---

## 1. Goal (end-of-phase state)

**Engine (`@ido4/core` + `@ido4/mcp`):**

- `complete_task` and any other never-valid action invocation returns a clean validation-failure response, not a `Unknown status key` throw.
- All transition tool responses carry `executed: boolean` at the top level. `success: false, executed: false` is the unambiguous failed-validation shape.
- Audit log persists all attempted transitions with the new `executed` field; consumers filter `executed === true` for committed-only views.
- New `get_methodology_profile` tool returns the resolved `MethodologyProfile` (mirrors the existing `ido4://methodology/profile` resource).
- Sandbox creation pre-flights all external dependencies (GH default branch, auth, project-v2 access) before any mutation; best-effort rollback on mid-flight failure.
- `find_task_pr` response includes `pull.body`. New `get_task_comments(issueNumber)` returns governed-comment trail. Spec-to-task lineage is exposed (mechanism decided in Stage 4).
- Engine release: `@ido4/mcp@0.9.0` (minor — behavior change in audit-log).

**Plugin (`ido4dev`):**

- `agents/project-manager/AGENT.md` rebuilt with: minimum-sufficient tool sequences per audit pattern; explicit read-then-mutate state.json instruction with code-shaped example; profile-fetch via `get_methodology_profile` as the first tool call in any audit; session-signals-first audit-source guidance.
- All rule files emitting advisory escalation use imperative phrasing ("Invoke /agents project-manager now to ...") rather than "recommend invoking."
- New `skills/status/SKILL.md` — on-demand banner display, resolves OBS-01.
- `skills/sandbox/SKILL.md` rewritten with imperative entry directive (OBS-02 fix); detection logic aligned with the MCP tool's actual gate (OBS-03 fix).
- `skills/ingest-spec/SKILL.md` post-validation surface flags the three known parser silent-failure shapes (Round-4 finding) — even if the parser only emits them as warnings.
- New `validate-plugin.sh §S` — agent state.json mutation preserves unknown top-level fields under fixture-state-then-write conditions.
- Tier A metrics extended with Tier B (8-10) in agent prose; thresholds documented; privacy considerations sectioned in `docs/hook-architecture.md`.
- README has a "Known platform constraints" section: #24425 banner-display regression; `CLAUDE_PLUGIN_DATA` Bash scoping; OBS-09 project-v2 cleanup limitation; single-project scope.
- All six skills smoke-tested live (`onboard`, `guided-demo`, `sandbox`, `sandbox-explore`, `ingest-spec`, `pilot-test`).
- All docs (CLAUDE.md, README, AGENT.md, hook-architecture.md, this brief) verified true.
- Plugin release: `ido4dev@1.0.0` — real release.

**Process:**

- `architecture-evolution-plan.md §11` updated at every stage gate (Phase-5 doc-discipline rule).
- `audit-suite.sh` green at phase close.
- Routines (§7.6) — "real users arriving" trigger acknowledged; tracked as v1.1 work, not absorbed in Phase 5.

---

## 2. Why this design — research provenance

The architectural choices here are grounded in the Phase 4 partial-smoke findings ledger, the Phase 5 brief-drafting investigations (2026-04-26), and standing references.

### Findings ledger

`reports/e2e-006-phase-4-partial.md` documents F1-F6 with reproduction, severity, and proposed fixes. Phase 5 absorbs all six. F2 from Phase 4 Stage 1 verification (profile content sourcing) is renamed F7 here and elevated from watch-item to engine fix — investigation during this brief drafting confirmed it's a real grounding gap, not a phrasing concern.

### Brief-drafting investigations (2026-04-26)

Six investigations during this brief's drafting phase produced load-bearing decisions:

1. **F5 root cause traced** — `task-workflow-service.ts:165-166` falls back to `return transition;` when `getTargetStatusKey` can't resolve the destination. Then `getTargetStatus` calls `getStatusName('complete')` which throws because 'complete' isn't a status key. The throw happens at line 62, *before* the validation result check at line 64. Fix: compute toStatus only after validation passes (or have failed validations return `toStatus = fromStatus`). ~10-15 LOC.

2. **F6 schema delta scoped** — `task-service.ts:272` already maps `success: workflowResult.executed`. The fix is to make this explicit at the schema level by adding `executed: boolean` as a sibling of `success`. ~5 LOC + schema + tests.

3. **F7 — subagents cannot read MCP resources, confirmed via Anthropic primary docs** (claude-code-guide research over `code.claude.com/docs/en/mcp-servers.md`). Resources are main-conversation-only via `@server:protocol://path` mentions; subagents only call tools. The `ido4://methodology/profile` resource exists at `packages/mcp/src/resources/index.ts:101-113` but the PM agent can't reach it. Fix: add a `get_methodology_profile` tool. Without this, WS2's "ground every claim in real data" is hollow for methodology-specific reasoning — the agent currently fills profile specifics from training data, not a runtime fetch.

4. **F4 audit-log gating mechanism confirmed** — `task-service.ts:267` gates audit-log writes with `if (workflowResult.executed && !request.dryRun)`. Failed-validation transitions never reach `audit-log.jsonl`. The Phase 4 partial-smoke ledger leaned option (b) — agent prose teaches "session signals first." Senior-architect call: option (c) is sustainable longer-term — persist all transitions with the new `executed` flag (added for F6 anyway); audit consumers filter `executed === true` for committed-only. This serves §3.9 better — "agent attempted bypass 5× and was blocked all 5" is meaningful institutional memory.

5. **OBS-01 — platform regression, not a plugin bug** (claude-code-guide research over `code.claude.com/docs/en/hooks.md`). GitHub issues #24425 / #11120 / #23875 confirm SessionStart hook stdout is context-injection-only by design. No terminal-display channel exists. Plugin-side resolution: `/ido4dev:status` skill on demand. Anthropic's gap is acknowledged but not blocking — chat output IS user-visible.

6. **WS3 engine-surface gaps re-verified** — `find_task_pr` does not include `pull.body` in the response (`task-tools.ts:131-140`). `get_task_comments` doesn't exist; only `add_task_comment` writes. Spec lineage isn't structurally persisted — `MappedTask.ref` is transient at ingestion time. WS3 estimate (~6-11 days) holds.

### Standing references

- `~/dev-projects/ido4dev/docs/architecture-evolution-plan.md` — vision (§1), institutional-memory thesis (§3.9), Phase 5 scope (§7.10), Sandbox UX (§7.9), Routines (§7.6).
- `~/dev-projects/ido4-suite/docs/hook-and-rule-strategy.md` — earn-its-slot test, advisory-escalation pattern, silence-is-a-feature heuristic.
- `~/dev-projects/ido4-suite/docs/prompt-strategy.md` — language guidance for Opus 4.5/4.6 (load-bearing for WS2 prose pass).
- `~/dev-projects/ido4-suite/docs/release-architecture.md` — four-layer release pattern; relevant for cross-repo PR sequencing.

### Open observations from previous tests — disposition

| Origin | Finding | Phase 5 handling |
|---|---|---|
| e2e-006 | F1-F6 | WS1 + WS2 |
| phase-4-stage-1 F2 | Profile content sourcing | F7 in WS1 + WS2 |
| phase-4-stage-1 F3 | Advisory routing | Same as e2e-006 F3 (3rd surfacing) — WS2 |
| e2e-005 OBS-01 | Banner not visible to user terminal | WS5 `/ido4dev:status` skill |
| sandbox-ux OBS-02-09 | Sandbox transactional integrity | WS4 |
| e2e-004 OBS-03 | `CLAUDE_PLUGIN_DATA` empty in Bash-tool context | Documented as accepted platform limitation in WS5 README |
| round-4 silent-failure gaps | Parser silently absorbs malformed input | Partial WS3 — `ingest-spec` post-validation surface; full parser hardening tracked upstream in ido4specs |

All six F-numbers + Phase 4 Stage 1 watch-items + sandbox findings + e2e-004 platform quirk + round-4 silent-failure gaps + the §7.10 Tier B scope are absorbed.

---

## 3. Architecture overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Phase 4 substrate (unchanged)                                               │
│  ─────────────────────────────                                               │
│  Hooks ride on rule-runner library.                                          │
│  state.json carries last_compliance, last_rule_fires, open_findings[],       │
│  compliance_history, last_session_audit_summary.                             │
│  PostToolUse + PreToolUse + SessionStart + SessionEnd wired.                 │
│                                                                              │
│  Phase 5 deltas                                                              │
│  ──────────────                                                              │
│                                                                              │
│  ENGINE (one PR; @ido4/mcp@0.9.0)                                            │
│    WS1 fixes                                                                 │
│      F5: getTargetStatusKey no longer throws on never-valid transitions      │
│      F6: ToolResponse envelope adds explicit executed: boolean               │
│      F4: audit-log persists all attempts (filter on executed for committed)  │
│      F7: new get_methodology_profile tool                                    │
│    WS3 fixes                                                                 │
│      find_task_pr response includes pull.body                                │
│      new get_task_comments tool                                              │
│      spec lineage exposure (mechanism per §4.3)                              │
│    WS4 fixes                                                                 │
│      sandbox-service pre-flight + best-effort rollback                       │
│                                                                              │
│  PLUGIN (one release; ido4dev@1.0.0)                                         │
│    WS2: AGENT.md prose pass (F1/F2/F3/F4/F7-consume)                         │
│    WS2: rule files imperative advisory wording (5 files)                     │
│    WS3: agent Tier B metric prose; privacy section in hook-architecture.md   │
│    WS3: ingest-spec parser-warning surface                                   │
│    WS4: sandbox SKILL.md rewrite (auto-prompt + detection alignment)         │
│    WS5: /ido4dev:status skill                                                │
│    WS5: doc freshness sweep (CLAUDE.md, README, AGENT.md, hook-arch.md)      │
│    WS5: error UX audit pass                                                  │
│    WS5: README known-platform-constraints section                            │
│    WS5: full 6-skill smoke                                                   │
│    validate-plugin.sh §S (state.json mutation preservation check)            │
└──────────────────────────────────────────────────────────────────────────────┘
```

No new architectural primitives. Phase 5 is substrate-extension + production hardening.

---

## 4. Committed design decisions

### 4.1 WS1 — Engine fixes (cross-repo, one bundled PR)

#### F5 — `complete_task` action-vs-status throw

**Root cause** (verified): `task-workflow-service.ts:165-166` fallback returns the action name when target-state lookup fails; downstream `getStatusName('complete')` throws.

**Fix:** Restructure `executeTransition` so `getTargetStatus` is only called after validation passes. Failed-validation responses set `toStatus = fromStatus` (no movement) and skip the lookup. ~10-15 LOC + integration test exercising every Hydro/Scrum/Shape Up action against a fixture state where the action is never valid for the current status.

**Why this shape:** the alternative (defensive guard inside `getTargetStatusKey`) leaves a footgun for future transitions. Restructuring puts the right invariant at the right altitude — toStatus is meaningful only when the transition will execute or did execute.

#### F6 — `success: false` plus `auditEntry` ambiguity

**Fix:** add `executed: boolean` to `ToolResponse` envelope as a sibling of `success`. Mirrors `success` for now (so it's redundant), but explicit. Hooks check `tool_response.data.executed` (post-MCP-unwrap path) to know if the transition committed.

**Schema delta** (`packages/mcp/src/schemas/task-schemas.ts` and corresponding TypeScript types):

```typescript
interface ToolResponse<T> {
  success: boolean;
  executed: boolean;     // ← NEW: explicit committed-or-not
  data: T;
  suggestions?: ...;
  warnings?: ...;
  validationResult?: ...;
  auditEntry?: ...;
}
```

~5 LOC engine + zod schema + tests.

#### F4 — persist all attempted transitions

**Engine change:** remove the `workflowResult.executed` gate at `task-service.ts:267`. Replace:

```typescript
if (workflowResult.executed && !request.dryRun) {
  this.emitTransitionEvent(...);
}
```

with:

```typescript
if (!request.dryRun) {
  this.emitTransitionEvent(transition, request, workflowResult, validationResult);
}
```

The persisted event includes the new `executed: boolean` flag (set from `workflowResult.executed`). Audit consumers filter `event.executed === true` for committed-only views. ~3 LOC + audit-store unit test for persisting `executed: false` events + audit-service query test that filters work.

**Why option (c) over option (b):** persisting attempts is institutional memory the system genuinely has and the user/agent genuinely needs (§3.9 earn-its-slot test). "Agent attempted bypass 5× and was blocked all 5" is exactly the audit signal the system should remember. Documenting the gap in agent prose (option b) creates a permanent semantic split between hooks-view and audit-log-view; option (c) closes it.

**Behavior change disclosure:** audit-log shape changes. Real users will see new entries (failed attempts). Documented in `docs/hook-architecture.md` audit-log schema section + README "What changed in v1.0."

#### F7 — `get_methodology_profile` MCP tool

**Why a tool, not exposing the resource:** subagents cannot read MCP resources (Anthropic docs explicit; verified). Resources are main-conversation-only via `@server:protocol://path` mentions. The PM agent currently fills profile-specific knowledge (principle counts, severity tiers, container labels) from training data + AGENT.md prose examples. Stage 1 verification noticed the phrasing ("internalized from the loaded specification"); brief-drafting investigation confirmed the gap.

**Tool shape:**

```typescript
server.tool(
  'get_methodology_profile',
  'Returns the full resolved methodology profile (states, transitions, principles, semantics, containers, work items, compliance weights, behaviors). Mirrors the ido4://methodology/profile resource.',
  z.object({}),  // no input
  async () => {
    const container = await getContainer();
    const profile = container.profile;
    return toCallToolResult({ success: true, data: profile });
  }
);
```

Registered in `registerTaskTools` adjacent to other profile-aware tools, OR in a new `registerMetadataTools` if appropriate. ~15-25 LOC + zod schema + test.

**Engine release:** `@ido4/mcp@0.9.0`. Minor bump signals the audit-log behavior change in F4 + the new tool surface in F7. Internal `@ido4/core` ticks to 0.9.0 in lockstep per release.sh's pin discipline.

### 4.2 WS2 — Agent UX hardening (plugin prose pass)

The PM agent's current AGENT.md is correct in shape but produces failure modes under literal interpretation: "Every answer is grounded in real data" + "Don't make claims without verifying" + "When you don't have data, you gather it first" together yield 63 tool calls for one focused audit task (F1). The fix is not to weaken these — the principles are right — but to **prescribe minimum-sufficient sequences per audit pattern** so the agent has a clear "I have enough" signal.

#### F1 — over-fetch fix: minimum-sufficient sequences

Add a new section to AGENT.md, between "Audit Methodology" and "Decision Framework":

> **Minimum Sufficient Evidence**
>
> Each audit pattern below has a prescribed minimum-sufficient sequence. Run that sequence; do not run more tools than the sequence prescribes unless a specific finding requires deeper investigation.
>
> The principle is not "gather everything possibly relevant"; it is "gather what answers the specific question and stop." Fewer tool calls = faster + more legible to the user + lower permission-prompt burden.

Then per-pattern sequences (replacing/augmenting the current "Tool Composition Patterns" section):

```
For AW001 follow-up (AI closure audit):
  1. ONE find_task_pr(issueNumber)
  2. AT MOST ONE get_pr_reviews(prNumber) — only if PR exists
  3. ONE state.json read — for prior finding lookup
  Stop. Form finding. Persist if threshold met.

For AW002 follow-up (BRE bypass pattern):
  1. ONE query_audit_trail(actorType: 'ai-agent', actorId: <id>, since: <recent>)
     — count bypass events for this actor
  2. ONE state.json read — for prior finding
  Stop. Persist at threshold (≥3 in session by same actor).

For Tier A baseline (manual /agents project-manager invocation):
  1. ONE get_methodology_profile() — first call, always
  2. ONE state.json read — for prior context
  3. ONE query_audit_trail(actorType: 'ai-agent', since: <session>)
  4. For Tier A metrics 2 + 3: per AI-driven complete_task,
     ONE find_task_pr + AT MOST ONE get_pr_reviews
  5. Compute metrics, surface, persist findings if thresholds crossed.
  Stop. Do not browse audit-log.jsonl. Do not read additional state files.
```

#### F2 — read-then-mutate state.json discipline

Replace the current "Audit Findings Persistence" section's "Schema" subsection with the following preamble:

> **Read-then-mutate, never overwrite**
>
> The Write tool overwrites the entire file. To preserve runner-written fields (`last_rule_fires`, `last_compliance`, `compliance_history`, `last_session_audit_summary`), you must:
>
> 1. Read the current `state.json` content via the Read tool.
> 2. Parse it as JSON.
> 3. Mutate ONLY `open_findings[]` — append, update, or set `resolved: true` per §schema.
> 4. Write the entire mutated object back.
>
> Do not author state.json from scratch. Do not assume fields you didn't read are absent.
>
> Example:
>
> ```javascript
> // Read
> const state = JSON.parse(readFile('${CLAUDE_PLUGIN_DATA}/hooks/state.json'));
>
> // Mutate
> state.open_findings = state.open_findings || [];
> state.open_findings.push({
>   id: `audit:bypass_pattern:${actorId}:${weekRef}`,
>   source: 'pm-agent',
>   ...
> });
>
> // Write
> writeFile('${CLAUDE_PLUGIN_DATA}/hooks/state.json', JSON.stringify(state, null, 2));
> ```

**`validate-plugin.sh §S` (new):** fixture-state `{last_rule_fires: {AW002: {...}}, last_compliance: {...}, open_findings: []}` + simulated agent-write that adds a finding + assertion that the post-write state preserves both `last_rule_fires` and `last_compliance` unchanged.

#### F3 — advisory wording sharpened to imperative

This is the third surfacing of F3 (Phase 4 Stage 1, Phase 4 Stage 5 partial smoke, now). Phase 3 Stage 7 settled on advisory because no forced-delegation primitive exists in Claude Code — that constraint holds. Sharpening within the advisory paradigm is what's actionable.

**Scope correction (2026-04-26 implementation):** the brief originally said *"Update emit text across all 5 rule files emitting advisory escalation."* That was wrong. Rule files only declare `escalate_to: <agent-name>`; the canonical advisory text is built once by the runner at `hooks/lib/rule-runner.js:403`. So the actual fix is **one line in the runner** + the unit test that asserts on the wording. Rule files don't change. This matches the suite-level `hook-and-rule-strategy.md §2.8` ("escalation to LLM judgment is an explicit, named slot") and `§4.8` ("the runner emits the advisory").

Old wording (Phase 3 Stage 7):

```
**Governance signal — recommend invoking `/agents <agent>`** to review finding `<rule_id>` with full governance context.
```

New wording (Phase 5 F3):

```
**Governance action — invoke `/agents <agent>` now** to review finding `<rule_id>` with full governance context. The advisory is for you, the primary reasoner — act on it directly rather than relaying to the user.
```

The phrasing addresses two failures: "recommend invoking" reads as a relay-to-user; the new phrasing names the audience explicitly ("for you, the primary reasoner") and uses positive framing ("act on it directly rather than relaying") per the Opus 4.5/4.6 language guidance in `~/dev-projects/ido4-suite/docs/prompt-strategy.md` (drop NEVER-style prohibitions; tell what to do, not what not to do).

#### F4-prose — audit source hierarchy

New section in AGENT.md after "Audit Methodology":

> **Audit Source Hierarchy**
>
> Two views of "what happened" exist and they don't always agree:
>
> 1. **Session signals** (`state.json last_rule_fires`, recent `auditEntry` shapes from response envelopes) — fire on transition *attempts*, regardless of validation outcome. The hook layer sees them.
> 2. **Audit log** (`.ido4/audit-log.jsonl`) — persisted by the engine on every transition attempt as of `@ido4/mcp@0.9.0`, with an `executed: boolean` field. Filter `executed === true` for committed-only history; default view (no filter) shows all attempts.
>
> When auditing what just happened in this session: read session signals first. They are immediate, they include attempts the audit log might frame differently, and they don't require an MCP call.
>
> When auditing patterns over time: query the audit log via `query_audit_trail` with `actorType: 'ai-agent'`. Filter by `executed` based on whether you want all-attempts or committed-only.
>
> If the two views disagree on what an actor did: trust the audit log for what's persisted; trust session signals for what just attempted. They are not contradictions; they are different time horizons.

#### F7-consume — profile fetch as first audit step

Update the **Bootstrap** section at the top of AGENT.md:

> At the start of every invocation:
>
> 1. **Call `get_methodology_profile()`** — returns the full resolved profile (principles, states, transitions, semantics, containers, work items, compliance weights, behaviors). This is your source of truth for methodology specifics.
> 2. **Read `${CLAUDE_PLUGIN_DATA}/hooks/state.json`** — your cross-session memory: last compliance, last rule fires, open findings, compliance history.
>
> Do not reason about methodology specifics (principle counts, container labels, severity tiers) from prose examples in this document. Those are illustrations. The profile is the source of truth.

Also update "Tool Composition Patterns → For AI Work-Product Audit" — `get_methodology_profile()` is item 1, before `query_audit_trail`. Same for "Before Any Container Plan" and "For Compliance Audits."

### 4.3 WS3 — Tier B content metrics + parser warning surface

#### Engine surface additions

**`pull.body` in `find_task_pr`:** extend `PullRequest` type with `body: string`. Plumb through `repositoryRepository.findPullRequestForIssue` (currently returns title/state/merge — see `task-tools.ts:131-140`). GH API already returns it; just stop dropping it. ~30-50 LOC + type extension + test.

**`get_task_comments(issueNumber)`:** new tool. Returns `[{author: ActorIdentity, body: string, timestamp: string}]`. Maps GH `user.type` + `author_association` to ActorIdentity (`'human' | 'ai-agent' | 'system'` — currently the engine only stamps actor on internal events; for raw GH comments, default to `'human'` unless heuristically detected as AI like via the `formatIdo4ContextComment` prefix). Pagination respected. ~80-150 LOC + new schema + test.

**Spec lineage exposure** — Stage 4 investigation determines the path:

- **Path A:** spec ref already lives in issue body (via `formatIdo4ContextComment` or similar at ingestion time) — confirm via grep; expose via new `get_task_lineage(issueNumber)` tool that parses the body. ~20-50 LOC.
- **Path B:** spec ref is transient (`MappedTask.ref` not persisted) — add persistence at `IngestionService.ingest()`: write `<!-- ido4-lineage: ref=T-001 spec=specs/foo.md -->` HTML comment to issue body; new tool reads it. ~80-150 LOC.

The investigation in Stage 4 commits to one path with a short rationale block in this brief's status log.

#### Tier B agent prose extension

Append three metrics to the Tier A list in AGENT.md "Audit Methodology":

```
8. **PR description quality** — for AI closures with a PR (Tier A metric 2),
   length + reference-density (mentions of acceptance criteria, spec refs,
   linked issues). Threshold: < 200 chars OR zero references → 'shallow_pr'
   finding. Tunable.

9. **Comment-trail presence** — for AI work, count of governed comments
   (via get_task_comments) at meaningful events (refinement, blocker,
   closure). Threshold: AI closures with zero comments → 'silent_closure'
   finding.

10. **Spec-to-task traceability** — for AI closures, does get_task_lineage
    return a spec ref? Closures without lineage are spec-orphan; surface
    as 'spec_orphan' finding (informational severity unless rate > 30%).
```

Three new finding categories: `shallow_pr`, `silent_closure`, `spec_orphan`. Schema extension in Audit Findings Persistence.

#### Privacy section

New section in `docs/hook-architecture.md`:

> **What content reaches Claude's context via Tier B**
>
> Tier B audit reads PR body text and issue-comment bodies. These may contain customer names, internal-system references, security-sensitive information, or confidential business decisions.
>
> What ido4dev does with this content:
> - Reads it via MCP tool calls (`find_task_pr`, `get_task_comments`).
> - Surfaces metric values (length, reference count, presence/absence) and the original content excerpts in agent context for reasoning.
> - Does NOT persist content to `state.json open_findings[]` — only metric values + task IDs go there.
> - Does NOT exfiltrate content outside the user's local Claude Code session.
>
> Users who need redaction primitives for highly sensitive contexts: tracked as v1.1 work. Phase 5 ships with full content visibility for Tier B audit; users with sensitive PR/comment content should evaluate whether the audit is appropriate for their environment.

#### Parser silent-failure surface in `ingest-spec` skill

Round-4 named three silent shapes: XL-effort silently conflated with L; wrong heading (`## Group:` instead of `## Capability:`) silently dropped; malformed task ref silently absorbed.

In `skills/ingest-spec/SKILL.md` Stage 0b, after the bundled-validator pre-check, add a post-validation pass that scans the spec for the three patterns and emits warnings:

```
After validator returns valid=true, scan the spec for:
  - "Effort: XL" → warn "XL effort buckets to L; consider splitting."
  - "## Group:" anywhere outside a Capability section → warn
    "## Group: heading not recognized — tasks under it may be orphaned."
  - "### " followed by anything not matching <PREFIX>-<NN>: → warn
    "Malformed task ref likely silently absorbed."

Emit warnings BEFORE Stage 1 dry-run preview. User decides whether to proceed.
```

~30 LOC skill change + sibling test fixtures.

This is bounded — full parser hardening (making these warnings rather than silent absorption) is upstream `@ido4/tech-spec-format` work tracked in ido4specs.

### 4.4 WS4 — Sandbox UX hardening (cross-repo)

#### Pre-flight all external dependencies

`sandbox-service.ts` `createSandbox`: before any local-state write or remote mutation, run a pre-flight check:

```
1. Verify GH auth: gh auth status (or equivalent)
2. Verify repo default branch exists (the OBS-06 trigger)
3. Verify project-v2 API access: list user's projects (auth scope test)
4. Verify repo permissions: can create issues, can create labels
```

If any pre-flight check fails: return failure with specific remediation. No `.ido4/` files written. No GH issues created. No project created.

#### Best-effort rollback on mid-flight failure

If pre-flight passes but a mid-flight failure occurs (e.g., issue-creation succeeds but project-attach fails):

1. Track every external mutation as it happens (issue numbers created, project ID created, labels created).
2. On failure: attempt cleanup in reverse order — delete created issues, delete created project, delete labels. Best-effort (some may fail if rate-limited; report clearly).
3. Local-state rollback: write `.ido4/` to a temp dir; rename to final location only on full success; on failure, delete temp dir.

~150-250 LOC engine-side + tests.

#### Skill auto-prompt fix (OBS-02)

`skills/sandbox/SKILL.md` opens with:

```
# Sandbox

**Execute immediately when invoked.** Ask the user for both inputs in a
single message:
  1. Repository (e.g., owner/repo or full URL)
  2. Methodology (Hydro, Scrum, or Shape Up)

Do not report "awaiting the skill's instructions" — this body IS the
instructions.
```

#### Skill/tool detection alignment (OBS-03)

Skill checks `.ido4/project-info.json` for setup-needed gating; MCP `create_sandbox` tool checks any `.ido4/` artifact. **Align both** to check `.ido4/project-info.json` only — the skill's documented behavior wins (it's user-facing).

Engine change: `sandbox-service.ts` detection logic uses `.ido4/project-info.json` presence/absence as the gate, not "any `.ido4/` file." ~5 LOC.

#### Profile-file mutation guard (OBS-04)

Don't rewrite `.ido4/methodology-profile.json` on rejected paths. ~5 LOC + test.

#### OBS-09 project-v2 cleanup

Cannot be fixed from within ido4 alone — Projects v2 are explicitly repo-independent at the GH API level. Two parts:

- **Document in skill:** `skills/sandbox/SKILL.md` teardown section explains: "When you delete the sandbox repo, the associated GitHub Project v2 is NOT deleted automatically. Run `gh project list --owner <user>` and manually delete the orphan."
- **Document in README "Known platform constraints" (WS5):** name this as an accepted limitation.

### 4.5 WS5 — Comprehensive E2E + release readiness

#### `/ido4dev:status` skill (OBS-01 resolution)

New `skills/status/SKILL.md`:

```yaml
---
name: status
description: Show the current ido4dev governance status — last compliance grade, open audit findings, recent rule fires.
tools: Bash, Read
user-invocable: true
---

# Status

Read state.json and print the banner content.

!`node "${CLAUDE_PLUGIN_DATA}/hooks/scripts/session-start-banner.js" 2>/dev/null || echo "[ido4dev] No state available — fresh project or no prior session."`
```

The bash injection runs the existing `session-start-banner.js` which already produces the four-block banner. Output prints to chat (user-visible). On-demand replacement for the SessionStart banner the user can't see in their terminal.

~10-line skill markdown. Trivial to ship.

#### Documentation freshness sweep

For each doc, verify-against-shipped-reality:

- **`CLAUDE.md`** (this file): verify "Active Work" section reflects v1.0 close; Hook Architecture summary matches shipped rule files; ido4specs extraction record accurate.
- **`README.md`**: tools/skills/agents inventory accurate; install instructions current; new "Known platform constraints" section present; "What changed in v1.0" section listing F4 audit-log behavior change + new `executed` field.
- **`docs/hook-architecture.md`**: rule inventory matches shipped rules; envelope shape current (post-MCP-unwrap); state.json schema includes Phase 5 additions (Tier B finding categories); privacy section.
- **`docs/architecture-evolution-plan.md` §11**: status log entries for every Phase 5 stage close.
- **`agents/project-manager/AGENT.md`** (post-WS2): every claim in the prose verifiable by reading shipped code/profiles.

Each doc gets one careful read + corrections. ~half day.

#### Error UX consistency audit

Walk every MCP tool error path. Verify each produces a `ConfigurationError`-shape object (`message + remediation` + optional `context`). Plain `throw new Error(...)` calls without remediation strings are flagged and fixed. ~half day.

#### Full 6-skill smoke

Re-smoke all six skills in a fresh Claude Code session:

1. `/ido4dev:onboard` — first-touch greenfield flow.
2. `/ido4dev:guided-demo` — demo flow against ido4-demo.
3. `/ido4dev:sandbox` — methodology-selectable sandbox creation (post-WS4).
4. `/ido4dev:sandbox-explore` — sandbox exploration walkthrough.
5. `/ido4dev:ingest-spec` — full ingestion pipeline incl. parser warnings (post-WS3).
6. `/ido4dev:status` — new skill (post-WS5).
7. `/ido4dev:pilot-test` — dev-only; verify the [dev-only] prefix renders in autocomplete.

~1 day for the full smoke + report.

#### "Known platform constraints" section in README

```markdown
## Known platform constraints

These are properties of Claude Code that ido4dev works around, not bugs:

- **SessionStart banner not visible in terminal** (#24425, #11120) — Claude Code injects SessionStart hook stdout into the AI's context but does not display it in the user's terminal. Plugin workaround: `/ido4dev:status` shows banner content on demand.
- **`CLAUDE_PLUGIN_DATA` may be empty in Bash-tool context** — The env var is set for SessionStart hook subprocesses but not always for Bash-tool invocations made by the LLM. Plugin workaround: skills with bundle invocations include a `BUNDLE=$(ls ~/.claude/plugins/data/*/bundle-name.js)` fallback.
- **GitHub Project v2 doesn't cascade-delete with the repo** — Projects are explicitly repo-independent at the GH API level. After running `/ido4dev:sandbox` against a throwaway repo, manually delete the project: `gh project list --owner <user>` then `gh project delete <NUMBER>`.
- **Single-project scope** — ido4dev assumes one ido4 project per directory. Multi-project / org-wide governance is not supported in v1.0.
- **Methodology switching mid-project not supported** — Changing `.ido4/methodology-profile.json` from Hydro to Scrum mid-project leaves existing tasks in invalid states. v1.0 does not provide a migration path.
```

#### Comprehensive E2E

Re-run the six scenarios from `reports/phase-4-stage-5-runbook.md` against the post-WS1+WS2+WS3+WS4 plugin:

1. AW001 trigger — AI closure on a real task; advisory escalation reaches Claude; PM agent invocation produces minimum-fetch audit + finding persists.
2. AW002 + G1 — AI bypass attempt; both gates fire; PM agent aggregates pattern.
3. SessionStart banner round-trip — finding from Scenario 1 surfaces next session.
4. F2-evaluation (now resolved) — verify state.json mutation preserves runner-written fields.
5. F3-evaluation — verify imperative advisory wording produces auto-routing in primary reasoner.
6. Tier B trigger — manual `/agents project-manager`; agent computes Tier A + Tier B; produces multi-metric finding.

Plus four new scenarios specific to Phase 5:

7. F5 verification — `complete_task` against a never-valid status returns clean validation failure (not a throw).
8. F7 verification — agent's first tool call is `get_methodology_profile`; profile knowledge grounded.
9. Sandbox failure rollback — invoke sandbox against an empty repo; verify no orphan issues, no `.ido4/` artifacts.
10. `/ido4dev:status` user-visible verification — invoke; banner content prints to chat.

~1 day runbook drafting + ~1-1.5 hour user execution + ~1 hour synthesis + report write.

Closing-smoke report: `reports/e2e-007-phase-5-comprehensive.md`.

---

## 5. Execution sequence

Five stages. Stages 1-4 each deliver a coherent, ship-able WS slice; Stage 5 is the comprehensive close. Stages 1-4 may run concurrently where they touch different files; Stage 2 has a dependency on Stage 1 (F7 tool needs to ship before WS2 prose can prescribe its use).

### Stage 1: WS1 engine fixes (cross-repo)

Single bundled engine PR + release.

- F5: restructure `executeTransition` so toStatus computation follows validation; failed validations return `toStatus = fromStatus`. Integration tests for never-valid actions across all 3 profiles.
- F6: add `executed: boolean` to ToolResponse envelope. Schema, types, fixtures, response shape tests.
- F4: persist all transition attempts; remove `workflowResult.executed` gate at audit emission. Audit-store tests for `executed: false` events; query-service tests for the `executed` filter.
- F7: new `get_methodology_profile` tool. Schema, registration, test against all 3 profile fixtures.
- Engine release: `@ido4/mcp@0.9.0`. CI publishes 4 internal `@ido4/*` packages in lockstep.

Plugin-side: bump `@ido4/mcp` dep to `^0.9.0`; `npm install` resolves lockfile. validate-plugin.sh stays green.

*Goal:* engine surface ready for WS2 to consume.

### Stage 2: WS2 agent prose pass

Depends on Stage 1's F7 tool shipping.

- AGENT.md rewrite per §4.2 (Bootstrap update; Minimum Sufficient Evidence section new; Read-then-mutate prose new with example; Audit Source Hierarchy section new; Tool Composition Patterns updated to start with `get_methodology_profile`).
- 5 rule files: imperative advisory wording.
- Sibling test fixtures in `*.test.yaml` updated for new advisory regex.
- `validate-plugin.sh §S` (state.json mutation preservation check).

Verify in live session: agent's first tool call is `get_methodology_profile`; per-pattern audit follows minimum sequence (ONE find_task_pr, ONE get_pr_reviews, ONE state.json read for AW001 follow-up); state.json mutation preserves runner-written fields.

*Goal:* PM agent stops being a UX nightmare.

### Stage 3: WS4 sandbox UX (cross-repo, parallel with Stage 2)

- Engine PR landing pre-flight + best-effort rollback in `sandbox-service.ts`.
- Skill SKILL.md updates for OBS-02 + OBS-03 + OBS-04.
- Engine release piggybacks on Stage 1's `@ido4/mcp@0.9.0` if timing aligns; otherwise its own patch release.

Verify in live session: sandbox creation against an empty repo fails clean (no `.ido4/` written, no GH issues created); skill auto-prompts on invocation; skill detection matches MCP tool detection.

*Goal:* sandbox safe for first-touch real-user UX.

### Stage 4: WS3 Tier B + parser warnings (cross-repo, parallel with Stages 2-3)

Heaviest stage. May extend across multiple commits.

- Engine PR for `pull.body` plumbing.
- Engine PR for `get_task_comments` tool.
- Spec lineage investigation: read `IngestionService.ingest()` flow; commit to Path A or Path B; ship.
- Plugin agent prose: Tier B metrics 8/9/10 added to AGENT.md; new finding categories in schema.
- Privacy section in `docs/hook-architecture.md`.
- `ingest-spec/SKILL.md` parser-warning surface; sibling test fixtures.

Engine release piggybacks on Stage 1's 0.9.0 release ideally; otherwise 0.10.0.

Verify in live session: PR-body content reaches agent context; `get_task_comments` returns governed comments; spec lineage retrievable; parser warnings surface in ingest-spec dry-run.

*Goal:* Tier B audit ships; parser silent-failure visible to users.

### Stage 5: WS5 comprehensive smoke + release readiness (sequential, runs after Stages 1-4)

- `/ido4dev:status` skill ship + verify.
- Documentation freshness sweep: CLAUDE.md, README, AGENT.md (post-WS2), hook-architecture.md.
- Error UX consistency audit + fixes.
- README "Known platform constraints" section.
- README "What changed in v1.0" section.
- Full 6-skill smoke against fresh Claude Code session.
- Comprehensive E2E (10 scenarios per §4.5).
- `architecture-evolution-plan.md §11` final entry.
- `audit-suite.sh` green at close.
- Plugin release: `ido4dev@1.0.0`.

*Goal:* v1.0 ready for real release.

---

## 6. Verification

After every stage:

1. `bash tests/validate-plugin.sh` — structural green. Must stay at `0 failed`.
2. `node tests/rule-runner-unit.test.mjs` — runner passes all unit tests.
3. `node tests/rule-file-integration.test.mjs` — walks every `*.test.yaml`, runs cases.
4. `node tests/compatibility.mjs` — MCP tool surface compatibility (Stage 1 adds `executed`, `get_methodology_profile`; Stage 4 adds `pull.body`, `get_task_comments`, lineage tool — all additive; existing consumers unaffected).
5. Live test in fresh Claude Code session for the stage's new code path.
6. Engine-side: `pnpm test` or equivalent across all 4 `@ido4/*` packages — at least 1774 + new tests passing.

Post-phase: Stage 5 comprehensive E2E + final `audit-suite.sh` green.

---

## 7. Coordination points

- **Engine batching.** Stages 1, 3, 4 each touch the engine. Batch into one engine release (`@ido4/mcp@0.9.0`) where timing aligns. If Stage 1 ships first and Stages 3/4 lag, the second release is `0.10.0`. Plugin release follows — ideally one consumer-side bump at end of Phase 5.
- **Read `~/dev-projects/ido4/methodology-runner/` end-to-end before any engine work** (per §8 intro warning of architecture-evolution-plan). The engine has its own roadmap; Phase 0 rename is COMPLETE, Phase 1 profiles is PLANNED additive — nothing in this brief should collide, but verify before each engine PR.
- **`docs/hook-architecture.md` updated in Stage 1 (envelope shape change), Stage 4 (privacy section + Tier B agent surface).**
- **`architecture-evolution-plan.md §11` updated at every stage gate** — Phase-4 doc-discipline rule applies to Phase 5.
- **Status updates in this brief's §10 status log every stage** — same discipline.
- **One `audit-suite.sh` run at Stage 5 close** confirming cross-repo consistency.
- **Interface contracts** — Phase 5 doesn't break contract #5 (MCP runtime — additive only) or #6 (tech-spec format — unchanged).

---

## 8. Open decisions to resolve during execution

These are flagged so they get resolved in the right stage, not swept:

1. **Spec lineage persistence path (Stage 4 start).** Path A (parse from issue body if already there) or Path B (add explicit HTML-comment marker at ingestion time). Decided after grepping `IngestionService.ingest()` and `formatIdo4ContextComment` for lineage-shaped content. Recorded in stage commit message + this brief's status log.

2. **`get_task_comments` actor-type heuristic (Stage 4).** GH API returns `user.type` (`'User' | 'Bot'`) and `author_association`. Map to ActorIdentity: `'Bot'` → `'ai-agent'`; `'User'` → `'human'`. But ido4-context comments via `formatIdo4ContextComment` are written by humans-via-Claude and would naively map to `'human'`. Pattern-detect the comment prefix and override to `'ai-agent'`? Or accept the limitation that context comments map to author's GH type? Resolve in Stage 4 implementation; document in the tool's response schema docs.

3. **Tier B threshold tuning (Stage 4 vs Stage 5).** Initial thresholds in §4.3 are starting points. Tune at Stage 4 ship (live test) or wait for Stage 5 comprehensive E2E to surface real-world distribution? Lean: ship Stage 4 with the §4.3 thresholds; Stage 5 E2E either confirms or surfaces a tuning need. If tuning needed, land in Stage 5.

4. **Parser-warning surface format (Stage 4).** Three patterns to scan; emit as warnings before Stage 1 dry-run preview. Format: per-warning text? aggregated warning count + summary? Decide at implementation time based on what reads well in the skill output.

5. **WS5 documentation depth.** "Verify against shipped reality" can be light (skim + spot-check) or thorough (every claim audited). Lean thorough at Phase 5 close — this is v1.0; mistakes in CLAUDE.md or README cost trust on first user contact.

6. **F4 audit-log behavior change disclosure tone.** README "What changed in v1.0" section. Default tone: factual + neutral. If real users have started consuming `audit-log.jsonl` directly, more prominent treatment. Lean: factual (no users today).

7. **Comprehensive E2E sandbox cleanup discipline.** WS4 ships rollback, but the E2E itself uses sandbox. Document the cleanup discipline (delete repo + delete project) in the runbook explicitly.

---

## 9. End-of-Phase checklist

- [ ] F5 — `complete_task` and other never-valid action invocations return clean validation failure (no throw)
- [ ] F6 — `ToolResponse` envelope has explicit `executed: boolean`
- [ ] F4 — audit-log persists all attempted transitions; consumers filter `executed === true` for committed-only
- [ ] F7 — `get_methodology_profile` tool exists; PM agent calls it as first audit step
- [ ] F1 — PM agent's audit pattern follows minimum-sufficient sequence (≤5 tool calls per audit pattern)
- [ ] F2 — PM agent's state.json mutations preserve unknown top-level fields; `validate-plugin.sh §S` enforces
- [ ] F3 — All 5 rule files emit imperative advisory wording; sibling fixtures verify
- [ ] F4-prose — AGENT.md "Audit Source Hierarchy" section explains session-signals-vs-audit-log
- [ ] Tier B engine surface: `find_task_pr.pull.body` plumbed; `get_task_comments` tool exists; spec lineage retrievable
- [ ] Tier B agent prose: metrics 8/9/10 in AGENT.md; finding categories `shallow_pr`, `silent_closure`, `spec_orphan` in schema
- [ ] Privacy section in `docs/hook-architecture.md`
- [ ] `ingest-spec` skill emits parser silent-failure warnings (XL effort, wrong heading, malformed ref)
- [ ] WS4 sandbox: pre-flight all external deps; best-effort rollback on failure; skill auto-prompts on invocation; detection aligned with tool
- [ ] OBS-09 documented in skill + README
- [ ] `/ido4dev:status` skill ships
- [ ] CLAUDE.md current (Active Work updated; Hook Architecture summary current)
- [ ] README current (tools/skills/agents inventory; "Known platform constraints"; "What changed in v1.0")
- [ ] AGENT.md verified true post-WS2
- [ ] `docs/hook-architecture.md` verified true post-Phase-5
- [ ] Error UX consistency audit complete; all error paths produce remediation strings
- [ ] All 6 skills smoke-green in a fresh session
- [ ] Comprehensive E2E green: 10 scenarios pass; `reports/e2e-007-phase-5-comprehensive.md` written
- [ ] `architecture-evolution-plan.md §11` has Phase 5 closure entry
- [ ] `audit-suite.sh` green at close
- [ ] Engine release `@ido4/mcp@0.9.0` (or `0.10.0`) published; plugin pins to `^0.9.0` (or `^0.10.0`)
- [ ] Plugin release `ido4dev@1.0.0` published to marketplace
- [ ] Routines (§7.6) acknowledged as v1.1 — `architecture-evolution-plan.md §7.6` status entry naming the trigger fired

---

## 10. Status Log

| Date | Update |
|---|---|
| 2026-04-26 | **Stage 3 ships clean (WS4 — Sandbox UX hardening).** Engine commit `99a414c` on `ido4` main lands four interrelated fixes for sandbox first-touch UX. **Pre-flight (OBS-06/03/04 collapse):** new `preflightCreate(repository)` private method validates repo format, GitHub auth (viewer.id), repo accessibility, and default-branch existence in a single GraphQL query before any mutation. Empty-repo case (the OBS-06 trigger that left orphan issues + Project V2 in Phase 4 Stage 5 partial smoke) now fails clean with specific remediation; user fixes and retries. OBS-03 + OBS-04 confirmed during investigation as downstream symptoms of OBS-06's mid-flight leakage, not separate bugs — single fix collapses all three. **Best-effort rollback (OBS-07):** createSandbox refactored into try/catch wrapping the post-preflight phases. New private `CreateMutationLog` interface accumulates mutations as each phase succeeds (projectId, wroteLocalConfig, createdIssueNumbers, createdBranchRefs, createdPRs). On any failure, `rollbackCreate` walks the log in reverse: PRs closed → branches deleted → issues closed → Project V2 deleted (gated by existing `verifySandboxProject` safety check) → local config removed. Honest scoping: not a saga or 2PC — issues can't be deleted at the GitHub API (only closed); GraphQL mutations aren't transactional. "If we created it, we try to clean it up." **Orphan cleanup (OBS-09 absorbed into WS4 per push-back from initial deferral framing):** new `listOrphanSandboxes()` (read-only — paginated viewer.projectsV2 + per-project repo-existence parallel fan-out) and `deleteOrphanSandbox(projectId)` (sandbox-title safety guard, irreversible deletion). Two new MCP tools: `list_orphan_sandboxes`, `delete_orphan_sandbox`. Tools total: Hydro 61 (was 59), Scrum 59 (was 57), Shape Up 57 (was 55), bootstrap 29 (was 27). **Plugin work:** `skills/sandbox/SKILL.md` rewritten — added "Execute Immediately When Invoked" imperative directive with anti-pattern callout (OBS-02 fix, mirrors Phase 2 commit `56b12ac` ingest-spec pattern); new Phase 5 "Orphan Cleanup" branch invoked via `$ARGUMENTS` keywords (`cleanup-orphans` / `orphans`) — discovers via `list_orphan_sandboxes`, surfaces list to user, deletes per-orphan with explicit confirmation. New `validate-plugin.sh §T` greps SKILL.md for the imperative directive markers. Engine tests: 1215 + 462 + 70 + 41 = 1788 passing (was 1780; +8 new — preflight rejects 4 conditions with no-mutations assertion, listOrphanSandboxes identifies orphans vs alive, deleteOrphanSandbox safety guard refuses non-Sandbox titles). Plugin tests: 113 passed (was 112; +1 §T). Engine release deferred per §7 batching; sits on `ido4` main with WS1 commit, awaiting Stage 4 close. Stage 4 (WS3 Tier B) and Stage 5 (WS5 closing smoke + readiness) remain. **Phase 5 progress: ▰▰▰▱▱ (Stages 1+2+3 complete; Stages 4-5 ahead).** |
| 2026-04-26 | **Stage 2 ships clean (WS2 — Agent UX hardening).** AGENT.md prose pass landed: Bootstrap section updated to call `get_methodology_profile()` first (F7-consume); new "Audit Source Hierarchy" section explains session-signals-vs-audit-log distinction (F4-prose); new "Minimum Sufficient Evidence" section with per-pattern tool sequences replaces the old Tool Composition Patterns (F1 — explicit minimum sequences for AW001/AW002/AW005 follow-up + Tier A baseline + container planning + blocked task investigation); "Read-then-mutate, never overwrite" subsection added to Audit Findings Persistence with code-shaped JS example (F2). Net file size 387 lines (was 420; -33 net despite three new sections) per prompt-strategy iteration-accumulation discipline — cuts came from trimming the kitchen-sink Diagnostic Reasoning section (was 30 lines of edge-case enumeration; now 1 motivated principle + 1 worked example), tightening Communication Style generics, and consolidating Audit Patterns into Audit Methodology. F3 scope correction surfaced during implementation: advisory text is built once by `hooks/lib/rule-runner.js:403`, NOT in 5 rule files as the brief originally said. Fix landed as one-line wording change + sharpened unit test at `tests/rule-runner-unit.test.mjs:292` (asserts new "Governance action" prefix + "primary reasoner" audience naming + "rather than relaying" positive framing). New `validate-plugin.sh §S` greps AGENT.md for the read-then-mutate prose markers (header + rationale + JSON.parse code example) — catches doc drift; structural enforcement of agent write-behavior isn't viable since the agent has Write tool access. Tests: 88 unit + 89 integration + 112 validate-plugin (was 88/89/111; +1 for §S). Brief §4.2 F3 corrected to reflect the actual scope. Stages 3 (WS4 sandbox UX) and 4 (WS3 Tier B) unblocked. Stage 5 (WS5 closing smoke) sequenced last. Engine release deferred to Stage 4 close per §7 batching guidance — `9ad6af0` engine commit (F4/F5/F6/F7) sits on `ido4` main waiting for WS3+WS4 engine work to bundle into single `@ido4/mcp@0.9.0` release. |
| 2026-04-26 | Brief drafted. Five workstreams committed. Pre-drafting investigations: (1) F5 root cause traced to `task-workflow-service.ts:165-166` fallback throw; ~10-15 LOC fix. (2) F6 schema delta scoped to ~5 LOC engine + zod. (3) F7 confirmed: subagents cannot read MCP resources per Anthropic docs (claude-code-guide research over `code.claude.com/docs/en/mcp-servers.md`); `ido4://methodology/profile` resource unreachable from PM agent; `get_methodology_profile` tool needed. (4) F4 mechanism confirmed at `task-service.ts:267`; option (c) chosen over ledger's option (b) — persist all attempts with explicit `executed: boolean`; cleaner for §3.9 institutional-memory thesis (attempted bypass is meaningful audit signal). (5) OBS-01 confirmed as Anthropic platform regression #24425/#11120/#23875; plugin-side resolution via `/ido4dev:status` skill. (6) WS3 engine surface gaps re-verified — `pull.body` not in `find_task_pr` response; `get_task_comments` doesn't exist; spec lineage transient. **Senior-architect lens additions beyond §7.10 original scope:** F7 (newly named — was Phase 4 Stage 1 watch-item F2); WS4 sandbox UX folded in for real-release readiness (was §7.9 standing initiative); WS5 expanded to absorb release readiness (doc freshness, error UX, full skill suite smoke, platform-limit honesty); Round-4 silent-failure gaps partially folded into WS3 via `ingest-spec` post-validation surface; F4 elevated from option (b) to option (c). **§7.10 elements verified absorbed:** F1-F6, Tier B (PR body + comments + lineage + privacy), comprehensive closing smoke. **Open observations from previous tests verified handled:** e2e-006 F1-F6 (all WS1+WS2); phase-4-stage-1 F2/F3 (WS1+WS2); e2e-005 OBS-01 (WS5); sandbox-ux OBS-02-09 (WS4); e2e-004 OBS-03 platform quirk (WS5 docs); round-4 silent-failure gaps (WS3 partial + ido4specs upstream). **Aggregate estimate:** ~17-23 working days. WS1+WS2 sequenced (Stage 1 → Stage 2); WS3+WS4 parallel with Stages 2-3; WS5 sequential close. Awaiting commit. |

---

## Appendix A: Why F7 elevated to engine fix

The Phase 4 Stage 1 verification report flagged a phrasing concern: agent responses contained "internalized from the loaded specification" / "the full profile detail is provided by the MCP layer at runtime." The watch-item said: "verify in Stage 3 when MCP tool calls wire in." Stage 5 partial smoke didn't reach that verification because of F1's over-fetch.

Brief-drafting investigation (2026-04-26): the `.ido4/methodology-profile.json` file is a thin pointer — typically `{"id":"hydro"}`. The full profile data (5 Hydro principles with names + severities + descriptions; `containers[]`; `semantics`; `compliance.weights`) lives in compiled TypeScript at `~/dev-projects/ido4/packages/core/src/profiles/{hydro,scrum,shape-up}.ts`, resolved via `ProfileRegistry.resolve()` at engine boot.

The MCP layer exposes the resolved profile as a *resource* at `ido4://methodology/profile` (`packages/mcp/src/resources/index.ts:101-113`). Resources in Claude Code are accessed via `@server:protocol://path` mentions in the main conversation — they are NOT exposed to subagents. Plugin subagents can only call MCP tools; they have no resource-access primitive.

So the PM agent's profile knowledge today comes from two sources: Claude's training data (knows Hydro/Scrum/Shape Up well enough to answer plausibly) and the AGENT.md prose itself (which includes per-methodology examples — "Hydro: 5 principles" etc.). It does NOT come from a runtime MCP fetch.

This passes Stage 1's identity tests (the answers are coherent) but fails the §3.9 grounding standard. WS2's "ground every claim in real data" is hollow for methodology-specific reasoning — the agent is reasoning from pattern-matched training data.

The fix is a small engine PR (~15-25 LOC): expose the resource shape as a tool. F7 belongs in WS1 because it's an engine fix; consumed in WS2 by updating AGENT.md's Bootstrap section to call it as the first tool of any audit pass. Without this, WS2's prose is half-effective.

---

## Appendix B: Why option (c) for F4

The Phase 4 partial-smoke ledger leaned option (b): document the gap; agent prose teaches "session signals first when looking at recent activity, audit-log when looking at historical patterns."

Senior-architect alternative — option (c): persist all attempted transitions with the `executed: boolean` flag. Audit consumers filter on `executed === true` for committed-only views.

The decisive consideration is §3.9. The thesis: the system operationalizes institutional memory the user/agent doesn't otherwise have. "Agent attempted bypass 5×, blocked all 5" is *meaningful* institutional memory — the kind that surfaces drift before it becomes an outage. Today, hooks see the bypass attempts (G1 fires) but the audit log silently drops them. Option (b) accepts this gap and asks the agent to interpret it correctly; option (c) closes it.

The engine cost is ~3 LOC (drop the `workflowResult.executed` gate at `task-service.ts:267`). The new `executed` flag (added for F6 anyway) carries the committed-or-not distinction in the persisted event. Existing audit-log consumers do nothing today (no real users); future consumers filter as needed.

The behavior change is honest: "in v1.0, audit-log includes attempts; filter for committed-only." Documented in README "What changed in v1.0."

This is the decision the engine code wants: F6 already adds `executed`; F4 just lets the audit log carry it. Option (b) leaves a permanent semantic split between two views of "what happened" — the kind of thing that erodes trust over time.
