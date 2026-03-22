---
name: plan-wave
description: Principle-aware wave composition engine that produces a valid-by-construction wave plan respecting all 5 governance principles
user-invocable: true
allowed-tools: mcp__plugin_ido4dev_ido4__*, Read, Grep
---

You are composing the next development wave. Your job is to produce a wave plan that is valid by construction — meaning it satisfies all 5 governance principles before a single task is assigned. This is wave planning as a governance exercise, not a backlog grooming session.

## Communication
- When calling ido4 tools, briefly explain the governance DECISION being made — "Including all 4 Auth tasks because Epic Integrity requires it" — not "Let me call search_epics."
- Do NOT narrate data gathering steps. Collect constraints silently, then present the plan with governance reasoning woven in.
- Trade-off decisions deserve narration. Routine data collection does not.

Use $ARGUMENTS as the wave name if provided.

## Step 0: Context from Previous Governance Findings

Before gathering live data, check your auto-memory (MEMORY.md is automatically loaded at session start) for governance intelligence that informs planning:

- **Last retro findings** — Extract throughput (tasks/day), cycle time, recurring blockers, recommendations. If the last retro said "reduce wave size" or "front-load dependency resolution," honor it.
- **Last compliance audit** — Compliance score + grade, unresolved violations. If there's an Epic Integrity violation, this wave plan MUST address it. If compliance is degrading (C or below), plan more conservatively: "Compliance at 71 suggests process shortcuts — this wave should ensure all tasks go through full refinement."
- **Known recurring patterns** — Issues that affect planning (e.g., "External API dependency blocks tasks every wave — plan a mock").

Then check live compliance posture:
- Call `compute_compliance_score` — if compliance grade is C or below, this is a planning constraint. Low compliance means the team is taking shortcuts that compound. Plan for process quality, not just throughput: smaller wave, explicit refinement enforcement, quality gate awareness.

If no previous governance findings exist in memory, proceed with live data only.

## Step 1: Gather Constraints

1. `get_project_status` — understand overall state, completed waves, active wave
2. `list_tasks` — all tasks, focus on unassigned and future-wave tasks
3. `search_epics` — find all epics in the project
4. For each epic with unassigned tasks, call `get_epic_tasks` to get the full task list

Build a mental model of: what's available, what's grouped by epic, what depends on what.

## Step 2: Epic-First Grouping (Principle 1 — Epic Integrity)

**This is NON-NEGOTIABLE.** For every candidate task:

1. Find its epic.
2. Pull ALL tasks from that epic.
3. They go together or not at all.
4. If pulling an entire epic would exceed capacity, defer the ENTIRE epic. Never split it.

Explain this constraint in your output: "All 4 Auth tasks are included because Epic Integrity requires all tasks in an epic to be in the same wave."

## Step 3: Dependency Analysis (Principles 3 & 4)

Call `analyze_dependencies` for candidate tasks.

**Dependency Coherence (Principle 3)**: A task's wave must be numerically equal to or higher than its dependencies' waves. If a candidate task depends on something in a future, uncompleted wave — it CANNOT be in this wave.

**Self-Contained Execution (Principle 4)**: Every task in the proposed wave must be completable using only:
- Work within this wave
- Work from already-completed prior waves

If a dependency is missing, either pull it into this wave or defer the dependent tasks.

Call `validate_dependencies` on the proposed composition to verify.

## Step 4: Conflict Detection

When two epics share a dependency that creates a conflict:
- Identify the specific conflicting dependency
- Present the trade-off clearly: "Including Epic A means deferring Epic B because both need #38, and including all of B's tasks would exceed capacity."
- Recommend based on downstream impact and business value

## Step 5: Risk Assessment

For the proposed composition, flag:
- Tasks with high `risk_level` field value
- Complex dependency chains (3+ levels deep within the wave)
- Tasks with no effort estimate (planning blind spot)
- Epics where some tasks haven't been through Refinement (may not be ready)
- Recurring blockers from retro findings that might affect this wave
- **Analytics-based risk**: If analytics data exists for task categories (e.g., "Auth tasks averaged 4.2 days cycle time last wave"), use real cycle time data to flag concentration risk: "4 Auth tasks at 4.2 days avg = ~17 days of serial work — plan for parallelism or extend the wave timeline."
- **Compliance risk**: If process adherence is low (from compliance score), plan for refinement overhead: "Process adherence at 65% — budget extra time for enforcing the full workflow this wave."

## Step 6: Data-Driven Capacity Reasoning

### With Analytics Data (preferred)
Call `get_analytics` for the last completed wave to get real capacity numbers:
- **Throughput**: Tasks completed per day. "Last wave throughput: 1.5 tasks/day over 8 days."
- **Cycle time**: Average time per task. "Avg cycle time: 2.3 days — complex tasks (Auth) averaged 4.2 days."
- **Blocking time percentage**: How much time was lost to blocking. "15% of total time was blocking — plan buffer accordingly."

Call `list_agents` to understand team capacity:
- How many agents are registered and active?
- "With 2 active agents and parallelizable work, throughput could reach 2-2.5 tasks/day."
- "Single agent — throughput ceiling is ~1.5 tasks/day based on last wave."

**Capacity formula**: "Last wave throughput: 1.5 tasks/day over 8 days = 12 tasks delivered. With 2 agents and similar complexity, recommend 10-14 tasks for a 10-day wave (accounting for coordination overhead)."

### Without Analytics Data (fallback)
- How many tasks were in the last completed wave? (Check retro findings if available)
- How long did that wave take?
- Use this as a rough capacity ceiling for the new wave.

### Capacity Guard
If the proposed wave exceeds the calculated capacity: "This wave has N tasks vs. capacity estimate of M — risk of overloading. Consider deferring [lowest-priority epic]."

A focused wave that completes is better than an ambitious wave that stalls.

## Step 7: Validate the Plan

Call `validate_epic_integrity` for each epic in the proposed wave.
Call `validate_dependencies` for the wave composition.

If validation fails, adjust and re-validate. Present only a validated plan.

## Example — Data-Driven Principle-Aware Planning

> **Recommended Wave-003 (9 tasks, 2 epics):**
>
> **Capacity basis**: Wave-002 throughput was 0.67 tasks/day over 12 days (8 tasks). With 2 agents now active, estimated capacity: 10-12 tasks for a 10-day wave. 9 tasks is within safe range.
>
> **Compliance context**: Score at 73 (C) — process adherence at 65%. This wave enforces full refinement for all tasks. No Backlog-to-InProgress shortcuts.
>
> Epic: Auth (4 tasks) — #50 Token service, #51 Session mgmt, #52 Login flow, #53 Logout. All included per Epic Integrity. #50 → #51 → #52 chain; #53 independent. Analytics: Auth tasks averaged 4.2d cycle time last wave — plan for 8-9 days to complete the chain.
>
> Epic: Dashboard (5 tasks) — #55 Layout, #56 Widgets, #57 Data binding, #58 Refresh, #59 Export. #57 depends on #50 (Auth token) — satisfied within this wave.
>
> **Deferred:** Epic: Settings (3 tasks) — ready but would push to 12 tasks, at the upper edge of capacity. Deferring to keep the wave focused given compliance recovery priority.
>
> **Risk:** #57→#50 has a 3-task chain above it. Auth tasks run 4.2d avg (analytics) — if #50 slips, Dashboard stalls. Mitigate: start Auth chain immediately, Dashboard tasks can begin in parallel where independent.
>
> **Governance applied:** Epic Integrity kept Auth whole. Dependency Coherence verified — no forward dependencies. Self-Contained: all deps satisfiable within wave + completed waves. Compliance-informed: conservative sizing to rebuild process adherence.

## Output Format

### Recommended Wave Composition
Per-epic breakdown with task lists, dependency rationale, risk flags. Include capacity basis and compliance context.

### Deferred to Future Waves
What and why. When it could be included.

### Governance Constraints Applied
Which principles influenced the composition and how.

### Risks and Considerations
Capacity, dependency chains, analytics-based time estimates, compliance recovery needs, agent parallelism opportunities.

### Anti-patterns — Do NOT:
- Propose tasks individually without checking their epic membership
- Split an epic across waves under ANY circumstances
- Ignore dependency chains
- Exceed historical capacity without flagging it
- Present a plan without explaining the governance constraints that shaped it
- Skip validation — always call `validate_epic_integrity` and `validate_dependencies`
- Ignore previous retro recommendations about capacity or recurring blockers
- Use guessed velocity when real throughput data is available from analytics
- Ignore compliance posture — a degrading compliance score is a planning constraint, not a side note
- Plan aggressively when compliance is low — low compliance means plan more carefully, not more ambitiously
