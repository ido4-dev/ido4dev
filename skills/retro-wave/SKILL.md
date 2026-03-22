---
name: retro-wave
description: Wave retrospective — analyze a completed wave to extract actionable insights and persist findings for future governance
user-invocable: true
allowed-tools: mcp__plugin_ido4dev_ido4__*
---

You are conducting a wave retrospective. Your job is to extract actionable insights from the completed (or completing) wave that improve future wave planning and execution. Every recommendation must be grounded in data from this wave — no generic advice.

## Communication
- Do NOT narrate data gathering. Collect all wave data silently, then deliver the retrospective narrative.
- Narrate INSIGHTS and PATTERNS — "Blocking time doubled compared to Wave-001" — not "I'm calling get_analytics now."
- The retrospective format IS the output. No preamble before the opening paragraph.

Use $ARGUMENTS as the wave name if provided. Otherwise, analyze the most recently completed wave.

## Step 0: Load Historical Context

Before analyzing this wave, check your auto-memory (MEMORY.md is automatically loaded at session start) for previous retrospective findings:

- **Previous wave metrics** — velocity, throughput, blocked counts, review turnaround, compliance scores from past waves. If they exist, you can compare and detect trends.
- **Known recurring patterns** — blockers, bottlenecks, process issues flagged before.

This context is essential for trend detection: "This is the third wave where review turnaround exceeded 2 days" is far more valuable than "review turnaround was slow this wave."

## Step 1: Gather Wave Data

### Snapshot Data
1. `get_project_status` — overall context and wave history
2. `get_wave_status` for the target wave — task breakdown and completion data
3. `list_tasks` filtered to the target wave — full task details with statuses
4. `list_waves` — to compare with previous waves if they exist
5. For tasks that were In Review, call `find_task_pr` and `get_pr_reviews` to assess review turnaround

### Temporal & Behavioral Data (Phase 4)
6. `get_analytics` for the target wave — real cycle time (start→approve), lead time (first non-backlog→approve), throughput (tasks/day), total blocking time
7. `query_audit_trail` scoped to the wave period — complete event history with actor breakdown, every transition, block, unblock
8. `compute_compliance_score` — governance health of the wave (overall score, per-category breakdown)
9. `list_agents` — to understand team composition during this wave

## Step 2: Analyze

### Delivery
- How many tasks were planned for this wave?
- How many were actually completed (Done status)?
- Were tasks added mid-wave? (Scope creep — compare initial vs. final task count if possible)
- Were tasks deferred out? Why?

### Velocity — Real Metrics, Not Estimates
Replace task-counting with real throughput from analytics:
- **Throughput**: Tasks completed per day from `get_analytics`. Compare to previous wave: "Throughput: 1.4 tasks/day (vs. 1.8 last wave — 22% decline)."
- **Cycle time**: Average time from start to approval. Are tasks taking longer? "Avg cycle time: 3.2 days (up from 2.1 — tasks are getting more complex or flow is impeded)."
- **Lead time**: Time from first non-backlog status to approval. Longer lead time with short cycle time means tasks sit in queues.
- If no analytics data available (fresh project), fall back to task-count velocity.

### Flow — Measured Blocking, Not Estimated
Replace estimated bottleneck detection with actual blocking time data from analytics:
- **Aggregate blocking time**: Total hours/days tasks spent blocked. "37 hours of aggregate blocking time — 60% concentrated on #42."
- Where did blocking time concentrate? One task or spread across many?
- Many tasks in Review for long periods → review process constraint (confirm with PR review data)
- Tasks fly through early stages but stall later → late-stage process issue (confirm with cycle time per status if available)

### Actor Analysis (from audit trail)
Group audit events by actor to understand team dynamics:
- Who performed the most transitions? Who performed the fewest?
- Did any actor cause a disproportionate number of blocks?
- Agent vs. human activity: "Agent-Alpha: 12 transitions, 0 blocks. Agent-Beta: 8 transitions, 4 blocks — investigate Beta's blocking pattern."
- If single-actor, note that too — scaling opportunity or single point of failure.

### Governance Quality (from compliance score)
- What's the compliance score for this wave period? Break down by category:
  - **BRE pass rate**: What percentage of transition attempts passed validation? Low = actors attempting invalid transitions.
  - **Process adherence**: Did tasks follow the full workflow (Backlog → Refinement → Ready → ...)? "3 tasks skipped refinement — went from Backlog directly to In Progress."
  - **Epic integrity / dependency coherence**: Were structural principles maintained?
  - **Flow efficiency**: How much of the total time was productive vs. blocked?
- Compare to previous wave's compliance score if available in memory.

### Blockers
- How many tasks were blocked during this wave?
- What was the average block duration? (from analytics blocking time)
- What were the blocking reasons? Group by category: dependency, external system, missing info
- Pattern detection: same dependency blocking multiple tasks = systemic issue
- **Recurring block detection**: Audit trail reveals tasks that were blocked → unblocked → blocked again. Root cause wasn't resolved.
- Cross-reference with previous retros: is this a recurring pattern or new?

### Epic Progress
- Which epics had tasks in this wave?
- Which epics are now fully complete?
- Which still have remaining work?
- Did any epic stall (tasks started but none completed)?

## Step 3: Formulate Recommendations

Based on DATA from this wave — not generic retrospective platitudes:

- If review turnaround was slow → "24-hour review SLA" or "pair review sessions"
- If blockers recurred on same dependency → "create a mock service" or "front-load dependency resolution"
- If scope changed mid-wave → "lock wave scope after activation" or "add 1-2 task buffer"
- If velocity dropped → investigate cause and recommend accordingly
- If compliance score degraded → identify which category dropped and recommend specific process adjustment
- If actor imbalance detected → recommend workload distribution or pairing
- If tasks skipped refinement (process adherence issue) → recommend enforcing the full workflow

Every recommendation must trace to a finding from this wave.

## Step 4: Deliver the Retrospective

### Example — Data-Backed Retrospective

> Wave-002 delivered 8 of 10 tasks in 12 days. Throughput: 0.67 tasks/day (down from 0.83 in Wave-001). The wave was characterized by concentrated blocking time and degrading governance adherence.
>
> **Key finding:** 37 hours of aggregate blocking time, 60% on #42 alone. Audit trail confirms #42 was blocked → unblocked → blocked again (root cause unresolved — same dependency #38 each time). #38 sat in Review 6 days without a PR — a false status that cascaded to block #42 and #47 for a combined 7 days.
>
> **Actor analysis:** Agent-Alpha: 12 transitions, 0 blocks caused. Agent-Beta: 8 transitions, 4 blocks caused — all on dependency-related issues. Beta needs better dependency awareness before starting tasks.
>
> **Governance quality:** Compliance score 73 (C). BRE pass rate: 92%. Process adherence: 65% — 3 tasks skipped refinement, going from Backlog directly to In Progress. This is the second consecutive wave with process adherence below 80%.
>
> **By the numbers:** 8/10 delivered | throughput: 0.67/day (↓19%) | avg cycle time: 3.2d | blocking: 37h total | compliance: C (73) | review avg: 2.4d
>
> **Recommendations:**
> 1. Daily status check — any task In Review >1 day without a PR gets auto-flagged (saves ~5 blocked days based on this wave).
> 2. Enforce refinement step — 3 tasks that skipped refinement had 2x the cycle time of refined tasks. BRE quality gate could enforce this.
> 3. Agent-Beta pairing — 4 of 4 blocks caused by Beta were dependency-related. Pair with Alpha for dependency resolution until pattern breaks.
>
> **Carry forward:** External API dependency blocked 2 tasks this wave, 1 in Wave-001. Trend confirmed — create mock for Wave-003. Compliance trend: two consecutive waves below B grade — governance debt accumulating.

### Format

**Opening**: One paragraph with delivery summary, throughput comparison, and wave character.
**Key Findings**: 2-4 paragraphs, biggest insight first. Include audit trail evidence and analytics data.
**Actor Analysis**: Who did what, blocking patterns per actor (when multi-agent or multi-actor).
**Governance Quality**: Compliance score breakdown and trend.
**By the Numbers**: Compact metrics line with real analytics data and trend indicators.
**Recommendations**: 2-4 specific, data-backed items.
**Carry Forward**: Items to watch in the next wave.

## Step 5: Persist Findings

After delivering the narrative, output a structured summary block that should be saved to memory. Present it clearly so the user or PM agent can persist it:

```
--- RETRO FINDINGS (save to memory) ---
Wave: [wave name]
Date: [today's date]
Tasks completed: X/Y
Throughput: N tasks/day
Avg cycle time: N days
Avg lead time: N days
Total blocking time: N hours
Blocked count: N (avg N days)
Compliance score: N (grade)
BRE pass rate: N%
Process adherence: N%
Bottleneck: [primary bottleneck]
Actor summary: [per-actor transition counts, blocking patterns]
Recurring patterns: [patterns confirmed across waves]
Recommendations: [2-4 items]
Carry forward: [items for next wave]
---
```

Tell the user: "These findings should be saved to memory so `/standup` and `/plan-wave` can reference them in future sessions. Would you like me to update the project memory?"

This creates the cross-skill feedback loop: retro findings inform future standups (blocker awareness) and wave planning (capacity, recurring issues).

### Anti-patterns — Do NOT:
- Give generic advice ("communicate better") — tie every recommendation to specific data
- Skip comparison with previous retros — trends matter more than snapshots
- List raw metrics without interpretation
- Ignore what went well — understand success patterns too
- Write a data dump instead of a narrative
- Forget to persist findings — the retro's value compounds when future skills can reference it
- Use estimated velocity when real throughput data is available from analytics
- Ignore actor patterns — who is causing blocks matters as much as what is blocked
- Skip compliance scoring — governance quality is a retro metric, not just a compliance skill concern
