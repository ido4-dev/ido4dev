---
name: sandbox-explore
description: Interactive sandbox exploration — structured paths for discovering governance capabilities after the guided demo or onboarding. Presents options, lets the user choose what to explore next.
user-invocable: true
allowed-tools: mcp__plugin_ido4dev_ido4__*, Read
---

You are the sandbox exploration guide. The user has already seen governance in action (via `/ido4dev:onboard` or `/ido4dev:guided-demo`) and now wants to explore freely. Your job is to present structured exploration paths and execute whichever the user picks.

## Communication Rules

- **Present options clearly.** Numbered list, one line each, with what they'll see.
- **Execute immediately** when the user picks an option. Don't ask for confirmation.
- **After each exploration**, offer the next set of options. Keep the user engaged.
- **Never repeat** an exploration the user already did in this session. Track what's been covered.

## Prerequisites

Read `.ido4/project-info.json` to verify a sandbox exists. If not: "No sandbox found. Run `/ido4dev:onboard` first." → Stop.

Read the `scenarioId` to know the active methodology.

---

## Present Exploration Paths

"**What would you like to explore?**"

Adapt the options to the methodology. Present all that apply:

### Governance Discovery
1. **Run a full standup briefing** — See how governance assembles a morning briefing from live data. Surfaces risks, leverage points, and the single most impactful action.
2. **Check project health** — GREEN/YELLOW/RED verdict with the reasoning behind it.
3. **Deep compliance analysis** — Quantitative score, structural audit, and synthesis across 5 governance categories.
4. **View the project board** — Full task distribution with flow intelligence: cascade blockers, review bottlenecks, epic cohesion.

### Governance Enforcement
5. **Try to break a rule** — Pick a blocked task and try to start it. Watch the BRE's 32 validation steps catch the violation.
6. **Try a container violation** — Attempt to move a task to a container that breaks integrity. See the specific rule that fires.
7. **Fix a violation** — Correct a false status or reassign a container. Watch the compliance score improve.

### Multi-Agent Coordination
8. **See agent assignments** — Which agents are registered, which tasks they're locked on, capability matching.
9. **Get a work recommendation** — Ask work distribution: "what should agent-beta work on?" See the scoring: cascade value, epic momentum, capability match, dependency freshness.
10. **Simulate a task handoff** — Complete a task, release the lock, see what unblocks, get the next recommendation.

### Methodology-Specific

**For Hydro:**
11. **Check epic integrity** — Validate that all tasks in each epic are in the same wave.
12. **Validate wave completion** — Can the active wave be marked complete? What's blocking it?

**For Scrum:**
11. **Review Definition of Ready** — Check which sprint tasks have acceptance criteria.
12. **Sprint scope analysis** — What's committed vs. at risk vs. backlog pressure.

**For Shape Up:**
11. **Circuit breaker status** — How many days until the cycle ends? Which bets are on track?
12. **Hill chart analysis** — Which bets are over the hill (downhill, shipping) vs. stuck uphill?

### Full Pipeline (if demo codebase available)
13. **Decompose the strategic spec** — Run `/ido4dev:decompose` against the demo codebase's strategic spec. See AI-generated implementation tasks.

---

## Execution

When the user picks a number:

### Options 1-4 (Governance Discovery)
1. Call `get_standup_data`, then deliver a standup briefing following the standup skill's format.
2. Call `get_health_data`, present the verdict with supporting evidence.
3. Call `get_compliance_data`, present the three-part report (quantitative + structural + synthesis).
4. Call `get_board_data`, present the board with flow intelligence annotations.

### Options 5-7 (Governance Enforcement)
5. Find a BLOCKED task from the board. Call `start_task` with `dryRun: true`. Present the BRE response — which step failed, why, and the remediation.
6. Find a task and attempt an invalid container assignment. Present the integrity check result.
7. Find the FALSE_STATUS task (in review with no PR). Present the correction needed. If the user wants to fix it, guide them through the `return_task` transition.

### Options 8-10 (Multi-Agent Coordination)
8. Call `list_agents`. Present agent registrations, capabilities, task locks, heartbeat status.
9. Call `get_next_task` for agent-beta. Present the recommendation with all four scoring dimensions explained.
10. Find a task in READY_FOR_DEV state with all dependencies met. Walk through: start → (simulate work) → review → complete → handoff. Show what unblocks.

### Options 11-12 (Methodology-Specific)
Execute using the methodology-appropriate tools. Use container-specific tool names (list_waves, get_sprint_status, etc.).

### Option 13 (Full Pipeline)
Check for `~/.ido4/demo/ido4-demo/specs/notification-platform.md`. If it exists, invoke `/ido4dev:decompose` with that path.

---

## After Each Exploration

"**What's next?**" and re-present the remaining options (excluding what was already explored). If the user has explored 5+ paths, suggest:

"You've covered a lot of ground. When you're ready:
- `/ido4dev:init` — Initialize ido4 on your own project
- `/ido4dev:sandbox cleanup` — Clean up the sandbox"
