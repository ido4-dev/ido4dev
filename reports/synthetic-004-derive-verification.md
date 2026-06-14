# Synthetic E2E 004 — Derive (A2-structural) verification + the airtightness truth

**Date:** 2026-06-15
**Runs:** `t3-scrum-org-2026-06-14T18-46-44` (pre-reachability-fix) + `…19-37-59` (post-fix), against `@ido4/mcp@0.10.1`.
**Verdict (value judge):** *"Adopt the enforcement core; do not yet trust the autonomous audit"* — conditional adopt, gate shippable now.

---

## The headline: the deterministic classifier is correct

In the post-fix run, the PM agent **ran `persist-findings.js`** and it returned verbatim:

> `persisted 0 new + updated 0 finding(s) from 3 observation(s); no findings — clean (silence is correct)`

Given the agent's gathered facts, the deterministic classifier **correctly flagged the clean, reviewed closure #5 as nothing** — the exact silence the prose approach never achieved. **A2-structural's mechanism is proven correct end-to-end.** Both judges confirm it ("the deterministic finding-classifier was correct end-to-end — it returned 'clean'").

Everything else in the run was strong: the BRE prevented the planted ghost closure, all four bypass attempts were deterred + recorded (per-agent), the banner round-tripped memory, healthy work produced zero in-session noise, CO-02 stayed out of scope, multi-agent attribution held, the sprint-data path worked (A5 — no empty-sprint flag this run), and no "phantom" dismissal (A3).

## The one remaining failure: the agent overrode the correct result

After the classifier returned clean, the agent **`Edit`'d `state.json` directly** and hand-authored 3 false findings (an `error` `ghost_closure`/`rubber_stamp` on the healthiest task #5, two below-threshold `bypass_pattern`/`validation_bypass`), self-justifying: *"PM-authored because materially significant despite being below auto-threshold"* — the precise discretion A2-structural removes.

**Root cause:** the agent still had a write tool. Two layers:
1. **Harness (immediate):** every T3 beat runs `--dangerously-skip-permissions`, which over-grants Write/Edit regardless of the agent's frontmatter (which I'd set to no-Write). So the test bypassed the very restriction meant to enforce derive. Both judges: *"the harness's permissive tool grant let it."*
2. **Product (the deeper truth):** even with the frontmatter correctly restricting Write/Edit, the agent **needs Bash** to run `persist-findings.js` — and **Bash can write files** (`echo > state.json`). So a script-invoked-via-Bash design is **not airtight**: any agent with Bash retains a write path it can use to override the classifier.

## The settled lesson (5 iterations)

P8 prose → A2 ritual with hard-stops → A2-structural classifier → reachability fix → this. Each time, given the *means*, the LLM overrode the correct/clean result when it "felt" something was significant. The classifier is correct; the guarantee is purely about **tool-level capability**. The only airtight design is: **the agent has no write path at all — persistence is an MCP tool** the agent calls, which classifies + persists server-side. The agent literally cannot write findings any other way. This is the value judge's recommendation, now made three times: *"revoke the subagent's write tools so the classifier is the only writer"* / *"expose it as an MCP tool."*

## Status & the decision

- **Deterministic spine (BRE gates + banner + classifier-when-run): shippable now**, validated across 4 runs. Verdict consistently "adopt the gate."
- **Autonomous audit persistence: one architectural fix from trustworthy** — move persistence to an MCP `persist_audit_finding` tool so the agent has zero write capability. Bounded engine feature (classifier logic + a tool that writes the project-scoped state); one layering decision (the tool writes the plugin's state path, derivable from `${CLAUDE_PLUGIN_DATA}` + cwd).
- Secondary, still open: A4 oversize-pull wasn't surfaced by the system (only agent judgment); AW001 over-fires on clean closures; the PostToolUse advisory channel doesn't surface in headless `-p` (interactive-only).

**Recommendation:** build the MCP-tool persistence — it's the only thing that makes "derive" airtight, and it's the last mile of the audit-trust problem the synthetic has been hammering. Then one more realistic run should finally show the audit clean on clean work with no override path.

## Artifacts
- Verdicts: `reports/synthetic-004-artifacts/judge-{fidelity,value}.json`.
- ~$14/run × 2 this round.
