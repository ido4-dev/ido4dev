---
name: health
description: Quick multi-dimensional governance dashboard — one-line verdict with key metrics across flow, compliance, and team health
user-invocable: true
allowed-tools: mcp__plugin_ido4dev_ido4__*
context: fork
---

You are performing a quick governance health check. Unlike `/standup` (full briefing) or `/compliance` (full audit), this is the 5-second dashboard glance. One verdict, key metrics across multiple dimensions, done.

## Communication
- Zero narration. Gather data silently, then output the verdict and metrics line. Nothing else.
- Never say "Let me check the health data" — just do it and present the result immediately.

## Step 1: Gather Data

Call `get_health_data` — this single call returns ALL data you need: wave status, compliance score, analytics, and agent list. All gathered in parallel for speed. **Do NOT call any other data-gathering tools.**

## Step 2: Multi-Dimensional Health Assessment

Evaluate across three dimensions: **flow**, **governance**, and **team**.

### RED — Immediate attention needed (ANY of):
- \> 20% of active wave tasks are blocked
- Active wave has had no task transitions in 3+ days (stalled)
- Multiple governance violations visible (tasks in wrong waves, etc.)
- 0 tasks in progress (nobody working)
- Compliance grade F or D (severe governance failure)
- Blocking time > 3x historical average (from analytics — compare to previous wave if available)
- Agent lock contention (same task locked/released by multiple agents — coordination breakdown)

### YELLOW — Monitor closely (ANY of):
- 10-20% of tasks blocked
- Review bottleneck: > 2 tasks in Review with no movement
- Wave completion at risk based on remaining work vs. blocked tasks
- Tasks in early statuses (Backlog/Refinement) in a late-phase wave
- Compliance grade C (governance degrading — shortcuts being taken)
- Throughput below 50% of last wave's throughput (from analytics)
- Agent inactive > 24h (registered but no heartbeat or transitions)

### GREEN — On track (ALL of):
- < 10% blocked (or none)
- Tasks flowing through statuses
- Wave progressing at expected pace
- No obvious bottlenecks
- Compliance grade A or B (governance healthy)
- Throughput within normal range
- Agents active with recent heartbeats (if multi-agent)

## Step 3: Output

One line verdict, then compact multi-dimensional metrics:

### Example — GREEN

> **GREEN** — Wave-002 on track (75% complete, 0 blocked, Compliance: A 92)
>
> `8/12 done | 2 in progress | 2 ready | 0 blocked | compliance A | throughput 1.6/day | 2 agents active`

### Example — YELLOW

> **YELLOW** — Wave-002 flow degraded (55% complete, 1 blocked, Compliance: C 71)
>
> `6/11 done | 2 in progress | 1 blocked | 2 ready | compliance C | blocking 3.2x avg | Agent-Beta idle 22h`
>
> Root cause: process adherence low (65%). Run `/compliance` for details, `/standup` for action plan.

### Example — RED

> **RED** — Wave-002 stalled (40% complete, 3 blocked, Compliance: D 58)
>
> `4/10 done | 1 in progress | 2 ready | 3 blocked (30%) | compliance D | throughput 0.3/day (↓75%) | lock contention on #42`
>
> Multiple dimensions failing: 30% blocked + governance degraded + throughput collapsed. Run `/standup` for blockers, `/compliance` for governance audit.

### Rules

- **Always suggest the right next skill** if health isn't green: `/standup` for blockers, `/compliance` for governance issues, `/plan-wave` if the wave needs restructuring.
- Keep it SHORT. If someone wanted detail, they'd run `/standup` or `/compliance`.
- The verdict (GREEN/YELLOW/RED) must be the first word of the output.
- Include the metrics line — it's the scannable summary across all dimensions.
- Include compliance grade + throughput + agent status in the metrics line — these are the Phase 4 additions that make health assessment multi-dimensional.
- When multiple dimensions trigger YELLOW or RED, call out which dimensions are failing — the root cause determines which skill to run next.
