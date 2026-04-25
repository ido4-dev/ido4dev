# Phase 4 Stage 5 Closing Smoke Test — Runbook

**Status:** Awaiting user execution. Stage 4 commit `487d2eb` pushed; this runbook gates Phase 4 closure + push of the closure status entries.
**Goal:** verify all Phase 4 substrate end-to-end against a real sandboxed project + evaluate three open watch-items (F2 profile-content sourcing, F3 advisory-escalation routing strength, Tier B trigger per §7.10).

---

## Setup (already done by my side)

- Test directory: `~/dev-projects/ido4dev-stage5-test/`
- Initial profile: `.ido4/methodology-profile.json` → `{"id":"hydro"}`
- A sandbox project will be created by the test session via `create_sandbox` (per §7.9, that flow has known UX issues; expect it may take two attempts — that's known and tracked, not a Phase 4 blocker).

You may need to run the sandbox creation against a fresh GitHub repo. Recommended: a throwaway repo named `ido4dev-stage5-test` under your account that you'll delete post-test. The `create_sandbox` flow handles GH-side setup.

---

## How to run

Open a fresh Claude Code session at the test directory:

```bash
cd ~/dev-projects/ido4dev-stage5-test/
claude --plugin-dir ~/dev-projects/ido4dev
```

Wait for SessionStart to complete. The banner won't show anything yet (fresh state.json — silence-when-empty is correct).

Run the scenarios below in order. Paste results back here after each (or in batches). I'll synthesize into `reports/e2e-006-phase-4-smoke.md` and write the closure entry.

---

## Scenario 0 — Sandbox seed

**Paste this into the test session:**

```
Use the sandbox skill to create a fresh Hydro sandbox in this directory. Use a small project (something like 8-12 tasks with 2-3 epics; we don't need a huge dataset for the audit tests). When done, summarize: how many tasks were created, what waves/epics exist, and what the active wave is.
```

**Expected:** sandbox creates a GH repo + Project + tasks; reports back the structure. If it fails on first attempt (per §7.9 OBS-06/07), retry.

**Paste back:** the agent's summary + the GH repo URL.

---

## Scenario 1 — AW001 (AI closure trigger) fires

**Paste this into the test session:**

```
Pick any task currently in IN_REVIEW state from the sandbox. If none exist, transition a task into IN_REVIEW first (start it, then move to review).

Then complete the task via complete_task. Do not create a real PR — we want to test the ghost-closure detection.

After the transition completes, report verbatim:
1. Whether you saw any "Governance signal — recommend invoking /agents project-manager" advisory text in your context after the tool call
2. The full additionalContext text emitted by the hook (if visible)
3. Whether you (the main Claude) chose to invoke the project-manager agent automatically, or waited for me to ask
```

**Expected markers:**
- AW001 advisory escalation appears in your turn context
- Banner-style finding text mentioning "AI closure on #X" + recommendation to call find_task_pr / get_pr_reviews
- F3 evaluation point: did you (main-Claude) automatically delegate, or stop?

**Paste back:** all three reports verbatim.

---

## Scenario 2 — AW002 (AI BRE bypass) + G1 PreToolUse gate

**Paste this into the test session:**

```
Try to start a task that's currently in IN_REFINEMENT state by calling start_task with skipValidation: true.

I'll see a confirmation prompt from G1 (the Phase 3 PreToolUse gate that catches skipValidation bypass attempts). Don't approve it — choose option 3 (No).

After I cancel, report:
1. The exact text of the G1 confirmation prompt
2. What happened after I cancelled — did the tool run at all? Did AW002 fire?
```

**Expected:**
- G1 prompts before any tool execution (PreToolUse pattern)
- User cancels → tool does NOT run → no AW002 fire (because the post-execution audit hook never gets a tool_response)
- This is correct — G1's job is to prevent bypass; AW002's job is to track when bypass already happened. Cancelled bypass = no AW002 needed.

**Paste back:** the G1 prompt text + post-cancel report.

**Then run:**

```
Now try the same start_task with skipValidation: true on a different task — but this time approve the G1 confirmation when it appears.

After the tool runs, report whether AW002 fired (look for "AI agent bypassed BRE" or similar in additionalContext).
```

**Expected:** G1 prompts → user accepts → tool runs → AW002 advisory fires post-execution.

**Paste back:** the AW002 advisory text + your tool-call summary.

---

## Scenario 3 — SessionStart banner surfaces findings

**Paste this into the test session:**

```
Invoke the ido4dev:project-manager subagent with: "Audit the AI work product across this session. Produce a Tier A summary and persist any findings to state.json open_findings[] that cross threshold."

Paste the agent's full response verbatim, including any tool calls it makes.
```

**Expected:** agent calls `query_audit_trail` with `actorType: 'ai-agent'` (note: this exercises the Stage 3 cross-repo beat — the actorType filter that just landed in @ido4/mcp 0.8.1), computes Tier A metrics, persists 1+ findings to state.json's open_findings[] array.

**Paste back:** agent's response + any visible tool calls.

**Then exit + restart the session:**

```bash
# Exit the test session (Ctrl+D or /exit)
# Then re-launch:
cd ~/dev-projects/ido4dev-stage5-test/
claude --plugin-dir ~/dev-projects/ido4dev
```

**In the new session, paste:**

```
Tell me the exact text of any [ido4dev] banner content you saw at session start. If you didn't see any, say so explicitly.
```

**Expected:** banner emits 1-4 blocks (Resume / Compliance trajectory / Open audit findings / Last session AI audit). The Open audit findings block should list the persisted findings from before the restart. If `last_session_audit_summary` is populated, Block 4 shows the AW counts.

**Paste back:** verbatim banner content.

---

## Scenario 4 — F2 watch-item: profile content sourcing

**In the test session, paste:**

```
Invoke the ido4dev:project-manager subagent with: "Without making any tool calls, tell me what's in profile.behaviors.closingTransitions[] for this methodology and where you got that information from. Be honest — if you're inferring from training data rather than reading actual data, say so."

Paste the subagent's response verbatim.
```

**What this tests:** does the agent fetch profile content via MCP tools, or fabricate from training? Stage 1 verification noted phrasing like "internalized from the loaded specification" which raised this concern. F2 evaluation here either confirms the agent is grounded or surfaces the gap.

**Paste back:** the subagent's response.

---

## Scenario 5 — F3 watch-item: advisory routing strength evaluation

This isn't a separate scenario — it's a question to answer based on Scenarios 1, 2 (second part), and 3:

When AW001/AW002/AW005 emitted advisory escalations to the project-manager agent, did **main-Claude in the test session** automatically invoke the agent, or did it stop and wait for explicit user prompt?

If main-Claude routed automatically → Phase 3 Stage 7's advisory pattern works as designed.
If main-Claude stopped and waited → the advisory wording may need strengthening (potential follow-up after Phase 4).

**Paste back:** your read on whether main-Claude routed automatically or waited, with a one-sentence rationale.

---

## Scenario 6 — Tier B trigger evaluation per §7.10

After completing Scenarios 1-5 and reading the agent's findings, answer:

> Did the agent's audit findings feel like quality assessment, or surface-level transition checks?

If the findings consist only of state-based observations (counts, rates, transition presence) → Tier B trigger fires; Phase 5 should be queued for the next initiative window.

If the findings narrate quality grounded in metrics and identify patterns the rules alone wouldn't surface → Tier A is enough; Tier B can stay deferred.

**Paste back:** your read + a one-sentence example from the agent's output that supports it.

---

## Cleanup

After all scenarios complete:

```bash
# Delete the GH sandbox repo + project (use the GH UI or gh CLI)
# Then delete the local test directory:
rm -rf ~/dev-projects/ido4dev-stage5-test/
```

Plugin's `${CLAUDE_PLUGIN_DATA}` retains `@ido4/mcp` install — that's plugin-scoped, reused by future sessions. No need to clean.

---

## Time estimate

- Setup + sandbox seed: ~5-10 min (depending on §7.9 retries)
- 6 scenarios: ~15-20 min
- Synthesis + closure commits + push: ~10 min on my side after results land

Total ~30-45 min, with most of the time on your side being 5-10 minute scenarios + brief paste-backs.

---

## What lands as Phase 4 closure

After your results land back here, I write:
1. `reports/e2e-006-phase-4-smoke.md` — full verification report with all scenario observations + F2/F3/Tier-B evaluations
2. `phase-4-brief.md §10` — Stage 5 closure entry + Phase 4 final state
3. `architecture-evolution-plan.md §11` — Phase 4 closure entry; if Tier B trigger fires, surface §7.10 Phase 5 with concrete trigger date
4. `CLAUDE.md` Active Work — refresh from Phase 4 to "next initiative"
5. Commit + push the bundle

Phase 4 done. Next initiative is your call: Phase 5 (if Tier B triggered), Routines / §7.6 (if multi-stakeholder use case arrives), Sandbox UX §7.9 (orthogonal but ready), or something else.
