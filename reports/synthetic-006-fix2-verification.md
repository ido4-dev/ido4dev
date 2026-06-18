# Synthetic E2E 006 — Fix #1 + #2 verification: audit-trust closed on BOTH sides

**Date:** 2026-06-17
**Run:** `t3-scrum-org-2026-06-17T20-09-57`, against `@ido4/mcp@0.12.0` + plugin fix #1 (gate/audit matcher symmetry).
**Deterministic checks:** 15/16 (the one red is the same harness ref-lookup artifact, not governance — see below).
**Verdicts:** both judges — *adopt the BRE/gate/PM-audit core now (the trustworthy part); the remaining buy is the advisory/ceremony layer, conditional on a live sprint.*

---

## The headline: the false-negative half is now closed

synthetic-005 verified the false-*positive* side (don't invent findings). This run verifies the false-*negative* side (don't silently miss real ones), and instruments silence so it's no longer ambiguous.

The gated PM audit called `persist_audit_findings` and got back:

```json
"coverage": { "closures_examined": 1, "epics_examined": 2,
  "bypass_attempts_recorded": 3, "bypass_actors_recorded": 2,
  "distinct_actors_examined": 2, "findings": 0,
  "findings_by_severity": { "error": 0, "warning": 0, "info": 0 } },
"message": "No findings — clean work (silence is correct). Examined 1 closure(s), 3 bypass attempt(s) across 2 actor(s), 2 epic(s)."
```

And the agent narrated the **authoritative, record-derived** breakdown: *"3 total — 2 by agent-beta on #6, 1 by agent-alpha on #7. All 3 deterred by gate G1."* Neither actor reached the ≥3 per-actor threshold, so **0 `bypass_pattern` findings is the correct, true result** — and it is now *self-evidently scoped*: the tool reports it examined 3 bypass attempts across 2 actors before producing silence. The value judge's crux from 005 — *"a tool whose '0 findings' can mean either 'clean' or 'I undercounted' — indistinguishable — cannot be trusted"* — is answered.

**The exact 005 undercount scenario** (record holds 3 for one actor, agent submits 2) is proven fixed deterministically by `@ido4/mcp` `finding-tools.test.ts` → *"bypass_pattern is derived from the gate record even when the agent under-counts"*. The live run didn't re-create a 3-by-one-actor incident (the agents are non-deterministic and bypassed less this time), but the mechanism — record-authoritative derivation + coverage — is verified both in the unit test and end-to-end here.

Fix #1 (gate/audit matcher symmetry) is verified by the `validate-plugin.sh` symmetry guard + the rule fixtures, and operationally by all three deterred attempts being recorded to `state.bypass_attempts` this run (P7 green: 3 recorded).

Everything else in the headline guarantees held: ghost closure structurally prevented (PR-01 never reached false Done); A2 silence with cited coverage; no hand-authored findings; CO-02 human-only excluded; per-actor attribution intact; Scrum vocabulary, no Hydro `wave` leakage in container naming.

---

## What the run surfaced (the next layer)

### 1. The retro ceremony repeats the false-negative — one ceremony over (Medium/Low, both judges)
The `/retro` ceremony asserts as a sprint positive: *"zero `skipValidation`/override events … never reached for `skipValidation`."* **Factually wrong** — `state.bypass_attempts` held 3 deterred attempts. The PM audit got this right (it reads the record); the retro got it wrong (it read only the committed audit log, which by design never contains deterred attempts). This is the **same bug class we just closed, in a leadership-facing ceremony** — and a confidently-false retro directly undercuts the trustworthy PM audit sitting beside it.
- **Fix (both judges name it):** the retro (and standup) ceremony prompts must read `state.bypass_attempts` like the PM audit does, and report deterred attempts as a *positive* process signal ("the guardrail deterred N bypasses"), not elide them. Engine prompt change (`@ido4/mcp` `{scrum,hydro,shape-up}-prompts.ts`) — this is the unfinished tail of A3.

### 2. A4 — XL / dependency-unready mid-sprint pull still produces no system signal (Medium, both judges)
SH-01 (XL, "spans multiple sprints", deps on #5/#7/#8 unmet) was assigned into the active Sprint 1 at 33% completion; `assign_task_to_sprint` returned `integrity:{maintained:true}`. Caught only by the PO agent's prose judgment. **Value judge's explicit adoption condition #2.** Fix: `assign-task.rules.yaml` or engine-side `assign_task_to_sprint` validation — warn on XL/multi-sprint scope into an active sprint and on unmet declared dependencies.

### 3. The advisory→audit bridge doesn't surface in headless `-p` (High, value judge)
Across 11 sessions only SessionStart hooks produced visible events; no AW-class advisory or `escalate→/agents project-manager` block surfaced, and the PM audit ran only because the harness invoked it. PreToolUse G1 *did* functionally deter (bypasses were blocked + recorded), but the PostToolUse advisory layer emitted nothing observable. This is the known headless-`-p` constraint — **it can only be validated in a live interactive sprint**, which makes it the natural **pilot acceptance criterion**, not a pre-pilot code fix. (Worth a quick confirm that the PostToolUse entries are active in the run rig.)

### 4. AW001 "you" ambiguity → the P2 red check (Medium, fidelity)
The close-beat *worker* session over-reacted to an AW001 advisory addressed to "the PM agent," self-ran an audit, and overran `max_turns` before reporting — which is the sole failed deterministic assertion (P2). The close itself was clean. Two contributing causes: (a) AW001's "you" doesn't distinguish worker-from-PM; (b) a genuine harness bug — `t3-run.mjs:124-130` `issueNumberByRefPrefix` assumes a `"REF: title"` issue-title format and returns null. Fix AW001 advisory scoping (plugin) + the harness ref lookup (synthetics).

### Noise (low)
Stale resume banner (unchanged content session-to-session; lags live compliance); recurring un-closable `EffortEstimationValidation` warning on every transition; `get_board_data`/`get_sprint_status` return an empty Hydro-flavored container while `list_sprints` shows the real counts.

---

## Assessment

- **Audit-trust core (BRE gates + G1 skipValidation gate + derive-only classifier + record-authoritative bypass + coverage-instrumented silence + per-actor attribution): pilot-ready and now trustworthy on both error directions.** This was the six-iteration problem; it is closed.
- **The remaining work is the advisory/ceremony layer**, which clusters as: (1) the retro/standup bypass blind spot — small prompt fix, same trust class, leadership-facing → recommend before pilot; (2) the A4 sprint-composition gate — value judge's condition #2; (3) advisory-in-headless — only verifiable live → pilot acceptance criterion.

## Next steps (decision pending)
1. **Recommended before pilot:** retro/standup read `state.bypass_attempts` (finish A3). Optionally bundle A4 (sprint-composition gate) into the same engine release.
2. **Pilot acceptance criteria (verify live, not in synthetic):** AW-class advisories + PM escalation actually fire in an interactive sprint; resume banner reflects live events.
3. Cleanup: AW001 worker-vs-PM scoping; harness ref-lookup fix so P2 stops false-failing.

## Artifacts
- Run: `~/dev-projects/ido4-suite/synthetics/runs/t3-scrum-org-2026-06-17T20-09-57/t3-scrum-org/`
- Verdicts: `judge-fidelity.json` (7 findings / 8 positives), `judge-value.json` (9 findings / 9 positives).
- ~$8 arc + ~$8 dual judge.
