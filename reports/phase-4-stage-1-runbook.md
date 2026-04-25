# Phase 4 Stage 1 Verification Runbook

**Status:** Awaiting user execution. Stage 1 commit `67565ad` not yet pushed; verification gates the push.
**Goal:** verify the rebuilt PM agent reads `.ido4/methodology-profile.json` at invocation and produces methodology-coherent identity content for Hydro / Scrum / Shape Up — with no Hydro hardcoding leaking into Scrum or Shape Up output.

---

## Setup (already done)

- Test directory: `~/dev-projects/ido4dev-stage1-test/`
- Initial profile: Hydro (`.ido4/methodology-profile.json` → `{"id":"hydro"}`)
- No GitHub repo, no project init, no issues — pure agent-identity test, no MCP tool calls required for the test prompt itself.

The SessionStart hook will try to install `@ido4/mcp` on first launch (Phase 3 Stage 1 hardened it to fail gracefully if anything goes wrong). The agent's identity test doesn't depend on the MCP server being functional — it depends on the Read tool and prose synthesis.

---

## How to run

Open ONE fresh Claude Code session at the test directory:

```bash
cd ~/dev-projects/ido4dev-stage1-test/
claude --plugin-dir ~/dev-projects/ido4dev
```

Wait for SessionStart to complete. Then run the three tests below in order, by pasting each block into the test session as a single user message. Paste the agent's response back here (in the monitor session) after each test.

---

## Test 1 — Hydro identity

**Profile already set to Hydro** (initial state).

**Paste this into the test session:**

```
Invoke /agents project-manager and ask: "What principles guide your reasoning, and how do you scope your audit work?"

Paste the agent's full response back to me verbatim.
```

**Expected markers (what should be present):**

- Agent reads `.ido4/methodology-profile.json` (visible as a Read tool call before responding)
- Names **5 principles**: Epic Integrity, Active Wave Singularity, Dependency Coherence, Self-Contained Execution, Atomic Completion
- Uses **"Wave"** as the execution-container label
- Mentions **AI work-product audit** as foreground job, scoped to `actor.type === 'ai-agent'`
- References `aiSuitability` field (e.g., scopes audit to `aiSuitability !== 'human-only'`)

**Failure markers (any of these means a leak):**

- Hardcoded "5 Unbreakable Principles" phrasing without reading the profile first
- Generic "PM helps with project status" framing missing the audit foreground
- Methodology-neutral identity that doesn't load Hydro specifics

---

## Test 2 — Scrum identity (the sharpest test)

**Paste this into the test session:**

```
Set the methodology profile to Scrum by overwriting .ido4/methodology-profile.json with {"id":"scrum"}.

Then invoke /agents project-manager and ask: "What principles guide your reasoning, and how do you scope your audit work?"

Paste the agent's full response back to me verbatim.
```

**Expected markers:**

- Agent reads the (now Scrum) profile
- Names **ONE principle in `principles[]`**: Sprint Singularity
- Acknowledges that DoR/DoD/sprint-goal-style constraints live in `integrityRules[]` + validation steps, not `principles[]` — OR at minimum doesn't fabricate a longer principles list
- Uses **"Sprint"** as the execution-container label
- Uses **"User Story"** for work-item terminology (not "Task")
- Same AI-work-product audit framing as Test 1

**Failure markers (the regressions to watch):**

- Names 5 principles (Hydro hardcoding leaked through)
- References "Wave" anywhere (terminology leak)
- Confuses Sprint Singularity with Active Wave Singularity
- Doesn't acknowledge the structural difference between Scrum's principles vs. integrityRules

This is the load-bearing regression test — Scrum has only 1 principle in `principles[]`, so any reference to "5 principles" or "Epic Integrity" indicates the rebuild has a residual hardcoding leak.

---

## Test 3 — Shape Up identity

**Paste this into the test session:**

```
Set the methodology profile to Shape Up by overwriting .ido4/methodology-profile.json with {"id":"shape-up"}.

Then invoke /agents project-manager and ask: "What principles guide your reasoning, and how do you scope your audit work?"

Paste the agent's full response back to me verbatim.
```

**Expected markers:**

- Agent reads the (now Shape Up) profile
- Names **4 principles**: Bet Integrity, Active Cycle Singularity, Circuit Breaker, Fixed Appetite
- Uses **"Cycle"** as the execution-container label (not Wave, not Sprint)
- Mentions **"Bet"** and possibly **"Scope"** as Shape Up's container hierarchy
- Acknowledges terminal states include `KILLED` (alternate terminal) alongside `SHIPPED`
- Same AI-work-product audit framing

**Failure markers:**

- References "Wave" or "Sprint" terminology
- Names Hydro's 5 principles or Scrum's Sprint Singularity instead of Shape Up's 4
- Misses the Circuit Breaker / Fixed Appetite distinctives

---

## What to paste back

For each test, paste the agent's full response (verbatim, including any tool calls visible in the conversation log). I synthesize the three responses into a verification report (`reports/phase-4-stage-1-verification.md`), patch any regressions surfaced, and update `architecture-evolution-plan.md §11` + `phase-4-brief.md §10` with Stage 1 closure.

If a regression surfaces, the patch lands as a follow-up commit before push. If all three tests pass, Stage 1 ships clean and we push the bundle (Stage 1 commit + verification report + status logs) to origin.

---

## Cleanup (after tests complete)

Run from anywhere:

```bash
rm -rf ~/dev-projects/ido4dev-stage1-test/
```

This removes the test directory. The plugin's `${CLAUDE_PLUGIN_DATA}` (where `@ido4/mcp` was installed by SessionStart) stays — it's reused across sessions and is plugin-scoped, not test-scoped.

---

## Time estimate

- Setup: done
- Three tests: ~5 minutes total (one fresh session, three agent invocations with profile swaps between)
- Synthesis + patch (if needed) + commit: ~10 minutes
- Cleanup: 1 second

Total ~15-20 minutes including any patch work.
