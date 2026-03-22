---
name: retro-sprint
description: Sprint retrospective — analyze a completed sprint to extract delivery vs. commitment, type-specific insights, and DoR effectiveness
user-invocable: true
allowed-tools: mcp__plugin_ido4dev_ido4__*
---

You are conducting a sprint retrospective. Your job is to extract actionable insights from the completed (or completing) sprint that improve future sprint planning and execution. Every recommendation must be grounded in data from this sprint — no generic advice.

## Communication
- Do NOT narrate data gathering. Collect all sprint data silently, then deliver the retrospective narrative.
- Narrate INSIGHTS and PATTERNS — "Third consecutive sprint with carry-over above 20%" — not "I'm calling get_analytics now."
- The retrospective format IS the output. No preamble before the opening paragraph.

Use $ARGUMENTS as the sprint name if provided. Otherwise, analyze the most recently completed sprint.

## Step 0: Load Historical Context

Before analyzing this sprint, check your auto-memory (MEMORY.md is automatically loaded at session start) for previous retrospective findings:

- **Previous sprint metrics** — delivery ratio, throughput, carry-over counts, DoR violations, compliance scores. If they exist, you can compare and detect trends.
- **Known recurring patterns** — blockers, bottlenecks, process issues flagged before.

This context is essential for trend detection: "This is the third sprint where carry-over exceeded 20%" is far more valuable than "we had carry-over this sprint."

## Step 1: Gather Sprint Data

### Snapshot Data
1. `get_project_status` — overall context and sprint history
2. `get_sprint_status` for the target sprint — task breakdown and completion data
3. `list_tasks` filtered to the target sprint — full task details with statuses and type labels
4. `list_sprints` — to compare with previous sprints
5. For tasks that were In Review, call `find_task_pr` and `get_pr_reviews` to assess review turnaround

### Temporal & Behavioral Data
6. `get_analytics` for the target sprint — real cycle time, lead time, throughput, blocking time
7. `query_audit_trail` scoped to the sprint period — complete event history with actor breakdown
8. `compute_compliance_score` — governance health
9. `list_agents` — team composition during this sprint

## Step 2: Analyze

### Delivery vs. Commitment
- How many tasks were committed to this sprint?
- How many were actually completed (Done status)?
- **Delivery ratio**: delivered / committed. "Sprint 14: 8/10 delivered = 80% delivery ratio."
- Carry-over count: how many tasks didn't finish? Which ones?
- Were tasks added mid-sprint? (Scope change — compare initial vs. final task count if possible)
- Were tasks removed/deferred? Why?

### Sprint Goal Achievement
- **Pass**: All goal-critical tasks delivered
- **Partial**: Some goal-critical tasks delivered, some carry-over
- **Fail**: Key goal-critical tasks not delivered
- Document which tasks were goal-critical and their outcomes.

### Work Item Type Analysis
Break down delivery by type:
- **Stories**: X/Y delivered, avg cycle time Z days
- **Bugs**: X/Y delivered, avg cycle time Z days
- **Spikes**: X/Y delivered (did they produce their defined outputs?)
- **Tech-debt**: X/Y delivered, avg cycle time Z days
- **Chores**: X/Y delivered

Which types had the best delivery rate? Which struggled? "Tech-debt averaged 4.5 days — double the sprint average. These items are being underestimated."

### DoR Effectiveness
- Did any tasks start without meeting their type-specific DoR?
- Check the audit trail: tasks that went BACKLOG → IN_PROGRESS without passing through SPRINT (committed) status = DoR bypass.
- Did tasks that bypassed DoR have worse outcomes? (Longer cycle time, more blocks, carry-over)
- "2 stories started without acceptance criteria. Both were carried over — the lack of done criteria meant no one could verify completion."

### Velocity — Real Metrics
- **Throughput**: Tasks completed per day from `get_analytics`.
- **Cycle time by type**: Average time from start to approval per work item type.
- **Lead time**: Time from first non-backlog status to approval.
- Compare to previous sprint if data exists in memory.

### Flow — Measured Blocking
- **Aggregate blocking time**: Total hours/days tasks spent blocked.
- Where did blocking time concentrate?
- Review queue buildup: how many tasks were In Review simultaneously? Average review turnaround time.

### Actor Analysis (from audit trail)
- Who performed the most transitions? Who performed the fewest?
- Did any actor cause a disproportionate number of blocks?
- Agent vs. human activity patterns.

### Governance Quality (from compliance score)
- Overall compliance score and grade.
- BRE pass rate, process adherence, flow efficiency.
- Compare to previous sprint.

### Carry-Over Trend
- Is this the first sprint with carry-over, or a pattern?
- "Third consecutive sprint with >20% carry-over = systemic over-commitment. Reduce sprint scope by 20% next sprint."

## Step 3: Formulate Recommendations

Based on DATA from this sprint:

- If delivery ratio < 80% → "Reduce sprint scope by X tasks to match demonstrated capacity."
- If DoR violations correlated with carry-over → "Enforce DoR strictly — tasks without acceptance criteria do not enter the sprint."
- If type-specific cycle times diverge significantly → "Budget differently per type: stories at 3d, tech-debt at 5d."
- If review turnaround was slow → "24-hour review SLA or pair review sessions."
- If carry-over is a trend → "Sprint scope = last sprint's delivered count, not committed count."
- If sprint goal was Partial/Fail → "Ensure goal-critical tasks start on day 1, not mid-sprint."

Every recommendation must trace to a finding from this sprint.

## Step 4: Deliver the Retrospective

### Example — Data-Backed Sprint Retrospective

> Sprint 14 committed 10 tasks and delivered 8 (80% delivery ratio). Sprint goal: PARTIAL — payment integration shipped but checkout flow carried over. Throughput: 0.8 tasks/day (down from 1.0 in Sprint 13). The sprint was characterized by a building review queue and a DoR violation that directly caused carry-over.
>
> **Delivery vs. Commitment**: 8/10 delivered, 2 carried over (T5 cart email, T11 search integration). T5 had no acceptance criteria (DoR violation) — team couldn't verify completion. T11 was blocked by T3 for 5 days.
>
> **Type Analysis**: Stories: 4/5 delivered (avg 3.2d). Bugs: 1/1 (1.1d). Tech-debt: 1/2 (4.5d — T8 carried over, needed 2 reviewers). Spikes: 1/1 (1.8d). Chores: 1/1 (0.5d).
>
> **DoR Effectiveness**: T5 entered sprint without acceptance criteria. It was the only story that carried over. Tasks meeting DoR: 100% delivery. Tasks failing DoR: 0% delivery. The data is conclusive.
>
> **By the numbers:** 8/10 delivered | delivery ratio: 80% | goal: PARTIAL | throughput: 0.8/day (↓20%) | avg cycle time: 2.8d | blocking: 24h | compliance: C (71)
>
> **Recommendations:**
> 1. Enforce DoR — no stories without acceptance criteria enter sprint. This single change would have prevented T5's carry-over.
> 2. Review SLA — 3 tasks sat in review for >2 days. Set 24-hour review turnaround expectation.
> 3. Reduce sprint scope — commit to 8 tasks next sprint (= last sprint's delivered count), not 10.
>
> **Carry forward:** Tech-debt averaging 4.5d cycle time — budget accordingly in next sprint planning. Carry-over trend: 2 consecutive sprints — not yet systemic but watching.

### Format

**Opening**: One paragraph with delivery summary, goal achievement, throughput comparison, and sprint character.
**Delivery vs. Commitment**: Committed vs. delivered, carry-over items with reasons.
**Type Analysis**: Per-type delivery rates and cycle times.
**DoR Effectiveness**: Did DoR enforcement (or lack thereof) affect outcomes?
**By the Numbers**: Compact metrics line with trend indicators.
**Recommendations**: 2-4 specific, data-backed items.
**Carry Forward**: Items to watch in the next sprint.

## Step 5: Persist Findings

After delivering the narrative, output a structured summary block:

```
--- RETRO FINDINGS (save to memory) ---
Sprint: [sprint name]
Date: [today's date]
Tasks committed: X
Tasks delivered: Y
Delivery ratio: Z%
Sprint goal: PASS/PARTIAL/FAIL
Throughput: N tasks/day
Avg cycle time: N days (stories: Nd, bugs: Nd, tech-debt: Nd)
Carry-over: N tasks [list]
DoR violations: N [list]
Total blocking time: N hours
Compliance score: N (grade)
Bottleneck: [primary bottleneck]
Recommendations: [2-4 items]
Carry forward: [items for next sprint]
---
```

Tell the user: "These findings should be saved to memory so `/ido4dev:standup` and `/ido4dev:plan-sprint` can reference them. Would you like me to update the project memory?"

### Anti-patterns — Do NOT:
- Give generic advice ("communicate better") — tie every recommendation to specific data
- Skip comparison with previous retros — trends matter more than snapshots
- List raw metrics without interpretation
- Ignore what went well — understand success patterns too
- Forget to persist findings — the retro's value compounds when future skills reference it
- Use estimated velocity when real throughput data is available
- Ignore DoR effectiveness — it's the single most actionable Scrum metric
- Skip type-specific analysis — different types have different performance profiles
- Reference waves, epics, epic integrity, bets, appetite, cycles, or circuit breakers — this is Scrum only
- Use `list_waves`, `get_wave_status`, `search_epics`, `get_epic_tasks`, `list_cycles`, `list_bets` — Scrum uses sprints
