# Phase 4 Stage 5 Partial-Verification Report

**Date:** 2026-04-25
**Plugin version:** ido4dev v0.9.0 + Phase 4 Stages 1-4 (commits `67565ad`, `19bed54`, `05126b7`, `487d2eb`); engine v0.8.1 (`ido4/8d3356f`)
**Claude Code version:** v2.1.119 (Opus 4.7, 1M context)
**Test environment:** `~/dev-projects/ido4dev-stage5-test/` (sandboxed Hydro project, GH repo `b-coman/ido4dev-stage5-test`, Project #118 — all cleaned up post-test)
**Methodology:** runbook-driven (`reports/phase-4-stage-5-runbook.md`), partial execution per user's path-B decision
**Verdict:** ⚠️ **Phase 4 substrate verified working; agent-behavior layer surfaced load-bearing UX issues that block production-readiness without a follow-up pass. Phase 4 closes; Phase 5 fixes + re-tests.**

---

## Executive summary

Stage 5 ran 2 of the 6 planned scenarios before pausing. Even at partial scope, the test produced **rich empirical evidence** that wouldn't have surfaced from mechanical (validate-plugin) verification alone:

- **The substrate works.** Audit hook AW001 fires correctly with the right shape — the engine's `auditEntry.actor.type === 'ai-agent'` reaches the rule via the post-MCP-unwrap envelope, advisory escalation lands in Claude's context with the right body text + governance-signal recommendation. Stages 1-4's mechanical wiring is empirically validated.

- **The agent-behavior layer doesn't yet ship.** Six findings (cataloged below) cluster into "the audit substrate is right; the consumer of the audit substrate (the PM agent) needs work." Specifically: the agent over-fetches catastrophically (63 tool calls for one audit task), overwrites state.json instead of merging (loses runner-written fields), reasons from the wrong source (project-level audit log instead of session signals), and produces partially-miscalibrated findings as a result. Plus two engine bugs surfaced that aren't agent issues but block the test path.

- **Decision: Path B (Phase 4 ships substrate; agent UX + engine fixes + Tier B all bundle into Phase 5).** Stage 5 paused after Scenario 1's findings made it clear that continuing would generate more bad-UX evidence without new insight. All findings recorded here for durable Phase 5 input.

---

## What was verified working

### V1 — AW001 wiring fires correctly on AI-driven closures

**Scenario:** AI agent (actor identity `mcp-session`) called `approve_task` on issue #9 (state IN_REVIEW). The transition response carried `auditEntry: { actor: { type: 'ai-agent', id: 'mcp-session' }, transition: 'approve' }` and `data.toStatus: 'Done'`.

**Hook output observed in Claude's turn context:** AW001 advisory text emitted verbatim:
- Title: "AI closure on #9 — verify PR + review state"
- Body: recommendations to call `find_task_pr` + `get_pr_reviews` post-hoc; ghost_closure / rubber_stamp persistence guidance with thresholds (90% / 80%)
- Closing line: "Governance signal — recommend invoking /agents project-manager to review finding AW001_ai_closure_audit_needed with full governance context."

**What this validates from prior stages:**
- Stage 2 rule wiring (`hooks/rules/ai-work-audit.rules.yaml` + matcher + hooks.json entry)
- Stage 2 lint allowlist correction (auditEntry as a top-level envelope sibling)
- Stage 3 actor.type filter substrate (the engine returns `actor: { type: 'ai-agent' }` in MCP responses — confirmed live)
- Phase 3 advisory escalation pattern (Stage 7) — text format correct

This is the load-bearing positive verification. The wiring works end-to-end against a real MCP tool call.

### V2 — Engine actor.type structurally typed

The engine's `createMcpActor()` consistently returns `{ type: 'ai-agent', id: 'mcp-session', name: 'Claude Code' }` for MCP-driven tool calls. This means in production, ALL ido4 work via Claude Code is recorded as `actor.type === 'ai-agent'` in audit entries — confirming the assumption Stage 1 verified at the design level. There's no human-actor distinction at the MCP layer (humans operate Claude Code; Claude Code is the AI agent).

---

## Findings

### F1 — Agent over-fetches catastrophically (UX nightmare)

**Severity:** CRITICAL for production-readiness; not a substrate bug.
**Reproduction:** invoke `/agents project-manager` with a focused audit task ("investigate AW001 advisory on #9 + run Tier A checks"). Agent makes ~63 tool calls including reads of `.ido4/pr-cache.json`, `.claude/agent-memory/...`, multiple state.json paths, audit-log.jsonl, profile JSON, MCP tool calls — far beyond what the task requires.
**Root cause:** agent prose in `agents/project-manager/AGENT.md` includes "ground every claim in real data," "verify before claiming," "diagnostic reasoning when data looks wrong" — written to enforce thoroughness. Agent interprets these literally as "read everything possibly relevant before answering." The Bootstrap section + Audit Methodology section + Diagnostic Reasoning section together produce a "fetch everything" reading.
**User-visible impact:** multiple permission prompts (state.json read, state.json write, hooks/ access), conversation flow interrupted repeatedly, opaque tool-call list of 63+ items. User reported: *"the whole thing is odd, and a UX nightmare, and erodes the user trust."* This is an empirical trust-failure.
**Phase 5 fix:** AGENT.md prose pass — constrain tool usage to "minimum sufficient evidence for the question asked"; add explicit guidance that read-everything is anti-pattern; sharpen the Audit Methodology section's tool composition pattern to prescribe a minimal sequence (e.g., "for AW001 follow-up: ONE find_task_pr + at most ONE get_pr_reviews + at most ONE state.json read; no audit-log.jsonl scan"). Re-test in Phase 5 closing smoke.

### F2 — Agent overwrites state.json instead of read-then-mutate

**Severity:** HIGH (loses runner-written state).
**Reproduction:** trigger AW001 (runner writes `last_rule_fires` for the rule); ask agent to persist a finding; observe agent's Write call replaces the entire file with its own composition.
**Specifically observed:** agent's proposed write contained `"last_compliance": null, "last_rule_fires": []` (note: `[]` is wrong-shape — schema requires `{}`; coerce() would correct on next read). The runner's `last_rule_fires` entries from AW001's fire would have been lost.
**Root cause:** agent prose's "Audit Findings Persistence" section says "you are the single writer of audit findings to state.json open_findings[]" — true in spirit, but doesn't say "read-existing-state-then-mutate-only-open_findings; never overwrite other top-level fields." Agent's Write tool call defaulted to fresh file generation.
**Phase 5 fix:** AGENT.md prose pass — add explicit "read-then-mutate" instruction with a code-shaped example. Possibly also document the Write tool's default behavior (overwrites whole file). Plus consider adding a `validate-plugin.sh` check that the agent's `state.json` writes preserve unknown top-level fields (could test by running a fixture-state-then-agent-action and asserting fields survive).

### F3 — Advisory routing weak (already known; now empirically confirmed)

**Severity:** MEDIUM (Phase 3 Stage 7 explicitly chose advisory over forced; this is the cost of that choice).
**Reproduction:** AW001 fires with the standard advisory body ("Governance signal — recommend invoking /agents project-manager"). Main-Claude in the session sees the advisory but does NOT auto-invoke the subagent — it stops and waits for explicit user prompt to proceed.
**Stage 1 had flagged this** (verification report F3); Stage 5 reproduced live. The "recommend invoking" wording reads as relay-to-user, not directive-to-act.
**Phase 5 fix:** sharpen the advisory wording. Options to consider in the prose pass: imperative phrasing ("Invoke /agents project-manager now to..." vs "recommend invoking..."), explicit framing of who the advisory is FOR (the primary reasoner, not the user), or a dedicated `escalate_to_now: <agent>` rule field that the runner converts into a tool-call hint. Phase 3 Stage 7 settled on advisory because no forced-delegation primitive exists in Claude Code; sharpening within the advisory paradigm is what's actionable.

### F4 — Agent reasons from wrong audit source

**Severity:** HIGH (produces miscalibrated findings).
**Reproduction:** AW001 fires (visible to the runner via response envelope's `auditEntry`). Agent investigates by reading `.ido4/audit-log.jsonl` (the engine's persisted audit trail). Agent reports "0 AI-driven closures in this session, 34 events all actor.type=system" — missing the AI-driven approve_task transition that JUST triggered AW001.
**Root cause:** semantic divergence between two views of the same transition:
- **Hook view:** AW001 sees `tool_response.auditEntry.actor.type === 'ai-agent'` from the engine's response envelope. Hook fires.
- **Audit-log view:** the engine only persists transitions to `.ido4/audit-log.jsonl` when `workflowResult.executed === true`. The approve_task we ran had `success: false` (BRE validation failed). Engine didn't persist. Audit log doesn't include the AI-driven attempt.
- Agent reads audit-log → sees only system-actor seeding events → concludes "no AI closures" → finding is framed around the wrong scenario.
**This is a real engine semantic gap**, not just an agent-prose issue. Hooks and post-hoc audit-log queries see different things when transitions fail validation. Phase 5 has a choice:
  - (a) Fix the engine to persist all attempted transitions (regardless of validation outcome) so the audit log matches what hooks see
  - (b) Document the gap and have the agent's prose explicitly guide it to look at session signals (state.json `last_rule_fires`, recent rule fires) ALONGSIDE audit-log.jsonl
  - (c) Both
Lean (b) for Phase 5 (agent prose pass scope), with (a) tracked as a separate engine roadmap item (would be a behavior change with broader implications).

### F5 — Engine bug: complete_task throws "Unknown status key: complete"

**Severity:** HIGH for testing; needs engine fix.
**Reproduction:** call `mcp__plugin_ido4dev_ido4__complete_task` with any valid issue number. Engine returns:
```json
{
  "message": "Unknown status key: complete",
  "code": "CONFIGURATION_ERROR",
  "remediation": "Use one of: BACKLOG, IN_REFINEMENT, READY_FOR_DEV, IN_PROGRESS, IN_REVIEW, DONE, BLOCKED",
  "retryable": false
}
```
The error suggests the engine is treating the action name `"complete"` as a status-key lookup. Action-vs-status confusion in the transition execution path.
**Why escaped engine tests:** Phase 3's test suite passed 1774 tests including audit + transition validation, but apparently doesn't cover the full execution path of `complete_task` against a real sandbox state. (Engine tests are mock-heavy; this is a runtime-config issue that surfaces only in live execution.)
**Workaround during Stage 5:** used `approve_task` instead, which got further but then surfaced F6.
**Phase 5 fix:** cross-repo engine PR. Investigate the action→status mapping in `executeTransition`'s code path; trace what's looking up "complete" as a status key. Add an integration test that exercises every Hydro action against a fixture state.

### F6 — Engine semantic ambiguity: approve_task with success:false but auditEntry emitted

**Severity:** MEDIUM-HIGH (semantic correctness question).
**Reproduction:** call `approve_task` on a task whose validation will fail (e.g., issue #9 with epic-integrity violation). Response:
```json
{
  "success": false,
  "data": { "issueNumber": 9, "fromStatus": "In Review", "toStatus": "Done" },
  "validationResult": { "stepsRun": 4, "stepsPassed": 2, "stepsFailed": 2, ... },
  "auditEntry": { "transition": "approve", "fromStatus": "In Review", "toStatus": "Done", "actor": {...} }
}
```
The response simultaneously says "validation failed (success: false)" AND "transition occurred (data.toStatus: Done; auditEntry includes the transition)." Did the transition COMMIT or not? Did GitHub state change?
**Multiple downstream consequences:**
- Hooks fire on `auditEntry` shape regardless (AW001 fires correctly per design)
- Audit log doesn't persist (only on `executed === true`)
- Agent post-hoc analysis disagrees with hook view (F4)
- User can't tell from response whether to retry, treat as committed, or remediate
**Phase 5 fix:** engine-side semantic tightening. Either (a) when validation fails, omit `auditEntry` and `data.toStatus` from response (committed-only fields); or (b) explicitly distinguish "attempted transition" from "committed transition" via a new field like `executed: boolean`; or (c) document the current shape and update agent prose to interpret it correctly. Lean (b) — most informative without breaking change.

---

## Cleanup

All Stage 5 artifacts removed (this conversation, 2026-04-25):
- Local: `~/dev-projects/ido4dev-stage5-test/` ✓
- Local (Phase 2.1 leftover): `~/dev-projects/ido4dev-live-test/` ✓
- Local (older test cruft): `~/dev-projects/ido4-test/` ✓
- GH repo: `b-coman/ido4dev-stage5-test` ✓
- GH Project #118: "ido4 Sandbox — Hydro Governance" ✓

Plugin's `${CLAUDE_PLUGIN_DATA}` directory retained (plugin-scoped, reused across sessions).

---

## Phase 4 substrate state (final)

| Component | Status | Notes |
|---|---|---|
| Stage 1: profile-aware PM agent rebuild | ✓ Verified live (multi-profile: Hydro/Scrum/Shape Up identity tests passed Stage 1) | `reports/phase-4-stage-1-verification.md` |
| Stage 2: audit-focused PostToolUse rules | ✓ AW001 verified live; AW002/AW005 substrate exists, mechanical tests pass; live verification deferred to Phase 5 closing smoke | This report |
| Stage 3: cross-repo `actorType` filter | ✓ Engine v0.8.1 published; plugin uses 0.8.1; not yet exercised live (agent didn't reach the call due to F1/F4) | Verified mechanically |
| Stage 4: SessionStart banner enrichment + open_findings persistence | ✓ Mechanical tests pass; live banner round-trip deferred to Phase 5 closing smoke | Banner-fixture render in `validate-plugin.sh §R` |
| Stage 5: closing smoke test | ⚠️ Partial — paused at Scenario 1 with rich findings; full re-run in Phase 5 closing smoke | This report |

---

## Phase 5 scope (informed by these findings)

Per the §7.10 expansion that lands alongside this report, Phase 5 has four workstreams:

1. **Engine fixes** (cross-repo): F5 (`complete_task` action-vs-status bug), F6 (`approve_task` semantic ambiguity around `success: false` + `auditEntry`), and the related question of whether to persist failed-validation transitions to `audit-log.jsonl` for hook/log parity (F4 partial).

2. **Agent UX hardening:** AGENT.md prose pass addressing F1 (over-fetching), F2 (overwrite-vs-merge), F3 (advisory wording strength), F4 partial (where to look for session signals vs project audit log).

3. **Tier B content metrics:** PR description quality + comment-trail presence + spec-to-task lineage (the original §7.10 Phase 5 scope; informed by F4's gap-analysis around what data the agent can see).

4. **Closing smoke (comprehensive):** re-run Phase 4 Stage 5 scenarios 1-6 (the 6 the runbook listed) + Phase 5's new scope (Tier B + revised agent UX). One closing-smoke report covers both Phase 4 substrate AND Phase 5 fixes — eliminates the Phase 4-vs-Phase 5 boundary blur and ensures the substrate works under the revised agent.

The §7.10 entry is the durable scope record; this report is the durable findings record. Together they ensure Phase 5 starts with full empirical context, not a re-discovery loop.
