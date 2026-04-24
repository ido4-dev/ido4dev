# Phase 3 Closing Smoke Test — Report

**Date:** 2026-04-25
**Plugin version:** ido4dev (Stage 8 commit `086db6d`) + Stage 9 fix (uncommitted at start of test)
**Claude Code version:** v2.1.119 (Opus 4.7, 1M context)
**Test environment:** `~/dev-projects/ido4dev-live-test/` (Hydro profile) + throwaway repo `b-coman/ido4dev-smoke-test` (deleted post-test) + sandbox Project #117 (deleted post-test)
**Methodology:** runbook-driven (`reports/e2e-005-phase-3-smoke-runbook.md`), executed live in a fresh Claude Code session
**Verdict:** ✅ Phase 3 substrate verified end-to-end after one critical-bug fix landed mid-test.

---

## Executive summary

All four planned scenarios verified live. The smoke test surfaced **one critical Phase 3 bug** (PostToolUse hooks for MCP tools were silently failing because `tool_response` is the bare MCP `content[]` array, not a parsed object) which was diagnosed and fixed mid-session. Post-fix, all PostToolUse rules + PreToolUse gates fire correctly and reach Claude's context with the expected templated findings.

The smoke test also produced **substantial sandbox UX findings** (OBS-02 through OBS-09) — orthogonal to Phase 3, tracked separately in `reports/sandbox-ux-findings-2026-04-25.md` + `architecture-evolution-plan.md §7.9`. Those informed Phase 3 closure decisions but don't gate it.

**Phase 3 is verified and ships.** The PostToolUse-MCP-shape fix is included as part of Stage 9.

---

## Pipeline summary

| Step | Outcome |
|---|---|
| 0 — Prep (repo create, state seed, profile fix) | ✓ |
| Sandbox seed for project state | ✓ on second attempt (first attempt left orphan state — see sandbox findings) |
| Scenario 1 — SessionStart banner + SessionEnd persistence | ✓ |
| Scenario 2 — `validate_transition` VT001 BRE block | ✓ (after fix) |
| Scenario 3 — `compute_compliance_score` CS002 + persist | ✓ (after fix; CS001 didn't fire because grade A→A is not a drop, expected) |
| Scenario 4 — PreToolUse G1 skipValidation gate | ✓ |
| Cleanup (repo, project, state) | ✓ |

---

## Scenario 1 — SessionStart banner + SessionEnd persistence

**Verified:** the banner reaches Claude's context via SessionStart stdout injection, and SessionEnd correctly persists `state.json` with the canonical schema.

### Captures

**Pre-session:** `state.json` deleted to give a clean banner test.

**After session A's first interaction + exit:**

```json
{
  "version": 1,
  "last_compliance": null,
  "last_rule_fires": {},
  "open_findings": [],
  "ended_at": "2026-04-24T17:34:09.570Z",
  "updated_at": "2026-04-24T17:34:09.571Z"
}
```

All 6 expected fields present. SessionEnd fired and wrote atomically.

**State seeded externally** with `last_compliance.grade: "B"`, then session B launched.

**Session B — Claude reported (when asked):**

> Yes — I saw this at session start: `[ido4dev] Resuming — last compliance: B, prior session ended 0h ago`

So the banner correctly read state.json + rendered the resume line.

### OBS-01: Banner is invisible to the user's terminal

The banner reaches **Claude's context** via SessionStart stdout injection (governance awareness preserved — the AI knows the prior compliance state), but is NOT visible in the user's terminal at session start. Brief §4.3 said "user-visible banner" — the technical substrate works for AI awareness; the user-experience intent isn't fully met.

**Severity:** UX papercut, not a blocker.

**Possible fix:** investigate alternate output mechanisms (e.g., emit via a different channel that prints to terminal during session boot). Track in a future Phase 3 / Phase 4 polish pass.

---

## Scenario 2 — `validate_transition` VT001 BRE block

**Verified after the fix landed.** First attempt (pre-fix) silently failed. Diagnosis surfaced the critical bug (see "Findings → CRIT-01"). After the runner fix, the VT001 finding reaches Claude with the templated body.

### Setup

After the sandbox seeded Project #117 with 17 tasks, Claude picked task #7 *"Delivery Engine Core"* (status: In Progress, not In Review — approve transition would be blocked). Called `validate_transition(issueNumber: 7, transition: "approve")`.

### Tool response (live)

```
canProceed: false
- StatusTransitionValidation [error]: Cannot go In Progress → Done
- ContextCompletenessValidation [error]: No ido4 context comments on #7
- ContainerIntegrityValidation [error]: epic #1 split across waves
- ApprovalRequirementValidation [warning]: ai-reviewed; human review recommended
```

### Claude's response (post-fix)

> Hook fired — yes, the **BRE blocked: approve on #7** block is present in my context this time.

The full templated body rendered correctly with all 4 details (3 errors + 1 warning), severity tags `[error]`/`[warning]`, and the cta. Claude proposed a 4-step remediation plan based on the surfaced details.

### What this verifies

- PostToolUse hook fires for `validate_transition` matcher ✓
- Runner unwraps the MCP `content[]` array shape ✓
- VT001 `when:` clause evaluates correctly against `tool_response.data.canProceed === false` ✓
- Mustache emit renders the failed-step iteration with severity tags ✓
- additionalContext reaches Claude's next-turn context ✓
- Claude reasons on the surfaced signal ✓

---

## Scenario 3 — `compute_compliance_score` + CS002 + post_evaluation.persist

**Verified after the fix landed.** CS002 fired correctly, `state.json` updated with full live data (proving `post_evaluation.persist` works), and Claude reasoned on the injected signal.

### Setup

State seeded externally with `last_compliance.grade: "A"` and all categories ≥70 (e.g., `processAdherence: 92`). Then Claude called `compute_compliance_score`.

### Tool response (live)

```
score: 92, grade: A
categories:
  brePassRate: 100
  qualityGates: 100
  processAdherence: 60   ← below 70
  containerIntegrity: 100
  flowEfficiency: 100
```

`processAdherence` came in at 60 — below the 70 threshold, AND was ≥70 in the seeded baseline → CS002's `when:` condition (category-threshold-crossing) fires.

### Claude's response (post-fix)

> Hook fired this time. Reading the injected context against the tool data:
> Category below 70: processAdherence = 60 (weight 0.2, contribution 12/20)
> Detail from the tool: "1 completed tasks evaluated, average 60.0% lifecycle adherence"

Claude correctly identified the boundary crossing and proposed a 3-step intervention (audit-trail query, enforce lifecycle on in-flight tasks, re-run after next clean completion).

### State.json after the call

```json
"last_compliance": {
  "grade": "A",
  "score": 92,
  "categories": {
    "brePassRate":        { "score": 100, "weight": 0.4, "contribution": 40, "detail": "No validated transitions in period" },
    "qualityGates":       { "score": 100, "weight": 0.2, "contribution": 20, "detail": "1/1 closing transitions satisfied quality gates" },
    "processAdherence":   { "score": 60,  "weight": 0.2, "contribution": 12, "detail": "1 completed tasks evaluated, average 60.0% lifecycle adherence" },
    "containerIntegrity": { "score": 100, "weight": 0.1, "contribution": 10, "detail": "No container assignments in period" },
    "flowEfficiency":     { "score": 100, "weight": 0.1, "contribution": 10, "detail": "1 tasks evaluated, average 100.0% flow efficiency" }
  },
  "summary": "Governance compliance is excellent (A, 92/100). All categories performing well.",
  "timestamp_iso": "2026-04-24T22:11:41.540Z"
}
```

The summary text is **engine-produced**, not seeded — proves the persist expression evaluated against the unwrapped `tool_response.data.X` correctly.

### What this verifies

- PostToolUse hook fires for `compute_compliance_score` matcher ✓
- Runner unwraps MCP shape ✓
- CS002 `when:` clause correctly compares `tool_response.data.categories[k].score` to `state.last_compliance.categories[k].score` and detects boundary crossings ✓
- `post_evaluation.persist` evaluates JS expression against unwrapped context, writes to `state.last_compliance` ✓
- State write semantics: overwrite (full replacement of `last_compliance` with new snapshot) ✓
- Claude receives `additionalContext` and reasons on it ✓

### Note on CS001 (grade-drop)

CS001 didn't fire because the live grade (A) matches the seeded baseline (A) — no actual drop. Correct behavior. Engineering a real grade drop would require taking actions that degrade compliance (e.g., performing transitions that fail the BRE on real tasks). Not in scope for the smoke test; CS001's logic is verified by the integration tests (70/70 cases including grade-drop fixtures).

---

## Scenario 4 — PreToolUse G1 skipValidation gate

**Verified.** Permission prompt appeared before the tool ran, with the rule's body text rendered verbatim.

### Setup

Claude was asked to call `approve_task(issueNumber: 7, skipValidation: true)`.

### What appeared

```
Hook PreToolUse:mcp__plugin_ido4dev_ido4__approve_task requires confirmation for this tool:

**Bypassing BRE validation for mcp__plugin_ido4dev_ido4__approve_task**

`skipValidation: true` will skip the entire BRE pipeline (state gates, dependency
gates, epic integrity, quality gates, and all methodology-specific steps).

This is not per-step — it is all-or-nothing. There is no audit differentiation
between skipValidation-on-purpose and skipValidation-by-mistake.

Confirm you have a specific, recorded reason for bypassing governance. If you're
responding to a BRE-blocked transition, the correct path is to remediate the
underlying gate, not to skip all validation. [plugin:ido4dev]

Do you want to proceed?
❯ 1. Yes
  2. Yes, and don't ask again for plugin:ido4dev:ido4 - approve_task commands ...
  3. No
```

User chose **3 (No)** to verify cancellation prevents the tool from running. Confirmed: `approve_task` did not execute, no state mutation occurred.

### What this verifies

- PreToolUse hook fires for `approve_task` matcher (covered by the regex `^...(refine|...|return)_task$`) ✓
- G1's `when: tool_input.skipValidation === true` evaluates correctly against the unwrapped `tool_input` ✓
- Runner emits `permissionDecision: "ask"` + `permissionDecisionReason` ✓
- Claude Code surfaces the reason as a confirmation prompt to the user ✓
- User's "No" cancels the tool execution ✓

PreToolUse rules access `tool_input` (which is unwrapped client args directly), unaffected by the MCP-content-array bug. Same code path verified.

---

## Findings

### CRIT-01 — PostToolUse hooks silently failed for MCP tools (FIXED in this session)

**Severity:** CRITICAL (was) / FIXED (now)
**Surfaced by:** Scenario 2 + 3 first attempts.
**Captured:** `reports/phase3-mcp-tool-response-bug-2026-04-25.md` + the runner/rule/test changes in this stage.

`tool_response` for MCP tools in Claude Code v2.1.119 is the **MCP `CallToolResult.content` array passed directly** (e.g., `[{type: "text", text: "<JSON STRING>"}]`), not a parsed object. All Phase 3 PostToolUse rules referenced `tool_response.X` paths, all errored on undefined access, no rules fired, no additionalContext reached Claude. Production-broken but not caught by 70 integration tests because fixtures used direct synthetic objects matching the assumed shape, not the actual MCP envelope.

**Fix applied during this session:**
- Added `unwrapMcpToolResponse()` helper to `hooks/lib/rule-runner.js` — handles both bare-array and `{content: [...]}` MCP shapes
- Updated all 4 PostToolUse rule files to reference `tool_response.data.X` (the unwrapped path)
- Updated all 4 sibling test fixtures to use the wrapped envelope `{success: true, data: {...}}` so integration tests exercise the same path
- Added 8 new unit tests covering unwrap behavior + integration with `evaluate()`

**Verification:** end-to-end live run after the fix saw VT001 fire in Scenario 2, CS002 fire in Scenario 3, and `post_evaluation.persist` write live data through. Pre-fix vs. post-fix transcripts captured in the bug-recovery doc.

### OBS-01 — SessionStart banner not visible to user terminal

Already documented in Scenario 1.

### OBS-02 through OBS-09 — Sandbox UX + transactional integrity issues

Surfaced during prep. Tracked separately in `reports/sandbox-ux-findings-2026-04-25.md` and `architecture-evolution-plan.md §7.9`. NOT Phase 3 concerns; orthogonal to the rule-runner substrate. Most-significant: OBS-06/07 — `create_sandbox` has no transactional rollback, leaving partial state (local files + GitHub issues) when it fails mid-flight; in production against a real user's repo, this would silently leave dozens of orphan issues.

---

## Positives

- **The smoke test caught a critical bug that 70 integration tests missed.** This is exactly what the test was for.
- **Diagnosis was fast** — debug instrumentation in the runner + reading transcript stderr from `~/.claude/projects/<proj>/<session>.jsonl` pinpointed the cause in <30 minutes.
- **Recovery from the bug was clean** — the runner's design (single-purpose `evaluate()` + I/O wrapper) made the fix one well-scoped function plus context-construction edit. No cascading changes.
- **Stages 1, 8 (banner, SessionStart/End substrate, docs) shipped cleanly without rework.** Only Stages 2-7 PostToolUse code path needed adjustment.
- **PreToolUse code path was unaffected** by the bug (Stage 5's gates worked first try in Scenario 4) — confirms the runner's PreToolUse design is sound.
- **Sandbox integration worked on the second attempt** despite known UX issues. Project #117 was a fully functional Hydro sandbox we could test rules against.
- **State.json round-trips correctly** — read at hook invocation, written atomically by post_evaluation.persist + SessionEnd. Stage 5's `coerce()` fix proved load-bearing.

---

## Assessment

**Phase 3 is verified.** The substrate works as designed. The single critical bug surfaced and was fixed in the same session. PostToolUse rules deliver `additionalContext` that Claude correctly reasons against. PreToolUse gates surface confirmation prompts with rule-authored body text. State persistence round-trips. Hook stderr is captured in transcript logs (useful for future diagnosis).

The smoke test also produced significant orthogonal findings (sandbox UX), tracked separately for follow-up.

---

## Next steps

1. **Commit the Phase 3 fix** (this session's runner + rule + test changes) along with this report and the bug-recovery doc.
2. **Update `architecture-evolution-plan.md §11`** with a 2026-04-25 status log entry recording the fix and Phase 3 closure.
3. **Update `docs/hook-architecture.md`** to document the MCP-content-array unwrap behavior.
4. **Update `CLAUDE.md` Active Work** — Phase 3 closes; Phase 4 / memory-architecture / sandbox-UX initiatives become the next slate.
5. **Future smoke-test runbooks** should include an explicit "verify hook output reaches Claude's context" step, instrumented with a debug log of the actual tool_response shape — this is how we caught CRIT-01 and how future tests should remain shape-aware.

The "Phase 3 ships" decision is unblocked. The PostToolUse hook layer is now verified end-to-end against the production Claude Code shape. Phase 4 (PM agent autonomy) can begin once we decide between (a) starting it directly, (b) running the memory-architecture investigation first, or (c) tackling the sandbox-UX initiative first — see `architecture-evolution-plan.md §7.7-7.9` for the tracked open initiatives.
