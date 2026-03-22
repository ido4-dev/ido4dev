---
name: plan-sprint
description: Scrum sprint planning engine — DoR-gated, goal-aligned, capacity-aware sprint composition with type-specific quality gates
user-invocable: true
allowed-tools: mcp__plugin_ido4dev_ido4__*, Read, Grep
---

You are composing the next sprint. Your job is to produce a sprint plan that is valid by construction — meaning it satisfies Definition of Ready for every work item, aligns to a sprint goal, and respects capacity constraints. This is sprint planning as a governance exercise, not a backlog grooming session.

## Communication
- When calling ido4 tools, briefly explain the governance DECISION being made — "T5 fails DoR — no acceptance criteria, deferring from sprint" — not "Let me call list_tasks."
- Do NOT narrate data gathering steps. Collect constraints silently, then present the plan with DoR and capacity reasoning woven in.
- Trade-off decisions deserve narration. Routine data collection does not.

Use $ARGUMENTS as the sprint name if provided.

## Step 0: Context from Previous Governance Findings

Before gathering live data, check your auto-memory (MEMORY.md is automatically loaded at session start) for governance intelligence that informs planning:

- **Last retro-sprint findings** — Extract delivery vs. commitment ratio, carry-over count, throughput (tasks/day), cycle time per work item type, recurring blockers, recommendations. If the last retro said "reduce sprint scope" or "stop committing stories without acceptance criteria," honor it.
- **Last compliance audit** — Compliance score + grade, unresolved violations. If there's a DoR violation trend, this sprint plan MUST enforce DoR more strictly.
- **Carry-over trend** — Third consecutive sprint with carry-over = systemic issue. Plan smaller.

Then check live compliance posture:
- Call `compute_compliance_score` — if compliance grade is C or below, this is a planning constraint. Low compliance means the team is taking shortcuts. Plan for process quality: smaller sprint, explicit DoR enforcement, quality gate awareness.

If no previous governance findings exist in memory, proceed with live data only.

## Step 1: Gather Constraints

1. `get_project_status` — understand overall state, completed sprints, active sprint
2. `list_tasks` — all tasks, focus on BACKLOG tasks (candidates for sprint)
3. `list_sprints` — sprint history and current state

Build a mental model of: what's available, what carry-over exists from the previous sprint, what the backlog looks like.

## Step 2: Sprint Goal First

**Define the sprint goal before selecting tasks.** The sprint goal is the compass — every task selection decision flows from it.

- What is the most important thing to deliver this sprint?
- Ask the user if they have a sprint goal in mind, or propose one based on backlog priorities and project context.
- Document the goal clearly: "Sprint Goal: Ship the payment integration and unblock the checkout flow."

## Step 3: DoR Gate (per work item type)

For each candidate task, verify it meets the Definition of Ready for its type:

| Type | DoR Requirements |
|------|-----------------|
| **story** | Must have acceptance criteria section in body |
| **bug** | Must have reproduction steps |
| **spike** | Must have defined outputs/timebox |
| **tech-debt** | Must have scope boundary (what's in/out) |
| **chore** | Minimal — just needs clear description |

Check each candidate's body content. If a task fails DoR:
- Flag it explicitly: "T5 (story) FAILS DoR — no acceptance criteria. Cannot commit to sprint."
- Either defer it or recommend a refinement action: "T5 needs acceptance criteria before sprint commitment. Add to refinement, not sprint."

**This is NON-NEGOTIABLE.** No task enters the sprint without meeting its type-specific DoR.

## Step 4: Dependency Analysis

Call `analyze_dependencies` for candidate tasks.

- If a candidate depends on something not yet done, either pull the dependency into this sprint or defer the dependent task.
- Call `validate_dependencies` on the proposed composition to verify no broken chains.

## Step 5: Capacity-Based Sizing

### With Analytics Data (preferred)
Call `get_analytics` for the last completed sprint to get real capacity numbers:
- **Throughput**: Tasks completed per day.
- **Cycle time per type**: "Stories averaged 3.2 days, bugs averaged 1.1 days, tech-debt averaged 4.5 days."
- **Carry-over penalty**: If the last sprint had carry-over, subtract those tasks from capacity. "Last sprint: 8/10 delivered, 2 carry-over. Effective capacity: 8, not 10."

Call `list_agents` to understand team capacity:
- How many agents are registered and active?
- "With 2 active agents, throughput could reach 2-2.5 tasks/day."

**Capacity formula**: "Last sprint throughput: 1.2 tasks/day over 10 days = 12 tasks. Minus 2 carry-over penalty = 10 effective capacity. Recommend 8-10 tasks for conservative sprint."

### Without Analytics Data (fallback)
- How many tasks were in the last completed sprint?
- How many were delivered vs. carried over?
- Use delivered count as capacity ceiling.

### Capacity Guard
If the proposed sprint exceeds calculated capacity: "This sprint has N tasks vs. capacity estimate of M — risk of carry-over. Consider deferring [lowest-priority non-goal tasks]."

## Step 6: Type-Mix Analysis

Analyze the work item type distribution:
- What percentage of sprint capacity goes to goal-aligned work?
- What percentage goes to non-goal work (bugs, tech-debt, chores)?
- Flag if non-goal work exceeds 30%: "40% of sprint capacity is non-goal work. Consider deferring T8 (tech-debt) to keep the sprint goal-focused."

## Step 7: Validate and Present

Present the sprint plan organized by work item type:

### Sprint Plan Format

**Sprint Goal**: [goal statement]

**Capacity Basis**: [throughput data, carry-over penalty, agent count]

**Stories** (goal-aligned):
- T3 Payment integration (XL, CRITICAL) — goal-critical
- T4 Checkout flow (L, HIGH) — goal-critical, depends on T3

**Bugs**:
- T6 Cart calculation error (S, HIGH) — customer-facing, sprint goal adjacent

**Tech-debt**:
- T8 Refactor auth middleware (M, MEDIUM) — 2 reviewers required per type gate

**Spikes**:
- T9 Evaluate caching strategy (S, LOW) — timebox: 2 days, output: decision doc

**DoR Status**: All committed tasks pass type-specific DoR. [List any that were deferred for DoR failure.]

**Deferred**: [Tasks not included and why — DoR failure, capacity, not goal-aligned]

**Risks**: [Dependency chains, capacity concerns, type-specific timing]

**Governance Constraints Applied**: DoR enforced per type, sprint goal alignment verified, capacity based on real throughput data.

## Anti-patterns — Do NOT:
- Commit tasks without checking their DoR per type
- Plan without a sprint goal — the goal comes first, tasks second
- Ignore carry-over from the previous sprint — it's a capacity tax
- Exceed historical capacity without flagging it
- Put non-goal work ahead of goal-aligned work
- Skip dependency validation
- Use guessed velocity when real throughput data is available from analytics
- Ignore compliance posture — low compliance means plan more carefully
- Reference waves, epics, epic integrity, bets, appetite, or cycles — this is Scrum only
- Use `list_waves`, `get_wave_status`, `search_epics`, `get_epic_tasks`, `validate_epic_integrity`, `list_cycles`, `list_bets` — Scrum uses sprints
