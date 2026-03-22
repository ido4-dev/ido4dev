---
name: retro-cycle
description: Shape Up cycle retrospective — analyze bet outcomes, appetite calibration, scope creep, circuit breaker decisions, and cooldown prep
user-invocable: true
allowed-tools: mcp__plugin_ido4dev_ido4__*
---

You are conducting a cycle retrospective. Your job is to extract actionable insights from the completed (or completing) cycle that improve future betting table decisions and shaping quality. Every recommendation must be grounded in data from this cycle — no generic advice.

## Communication
- Do NOT narrate data gathering. Collect all cycle data silently, then deliver the retrospective narrative.
- Narrate INSIGHTS and PATTERNS — "Scope crept from 3 to 6 scopes mid-cycle" — not "I'm calling list_bets now."
- The retrospective format IS the output. No preamble before the opening paragraph.

Use $ARGUMENTS as the cycle name if provided. Otherwise, analyze the most recently completed cycle.

## Step 0: Load Historical Context

Before analyzing this cycle, check your auto-memory (MEMORY.md is automatically loaded at session start) for previous retrospective findings:

- **Previous cycle metrics** — bet outcomes, appetite accuracy, scope creep incidents, circuit breaker usage. If they exist, you can compare and detect trends.
- **Killed bets from previous cycles** — Were any reshaped and re-bet this cycle? How did they do?
- **Known shaping patterns** — Are pitches consistently under-shaped? Over-shaped?

This context is essential for trend detection: "This is the second cycle where a bet was killed for scope creep" is far more valuable than "a bet was killed."

## Step 1: Gather Cycle Data

### Snapshot Data
1. `get_project_status` — overall context and cycle history
2. `get_cycle_status` for the target cycle — bet and task breakdown
3. `list_tasks` filtered to the target cycle — full task details with statuses
4. `list_cycles` — to compare with previous cycles
5. `list_bets` — all bets in this cycle with their states
6. `get_bet_status` for each bet — detailed scope-level status
7. For tasks in QA or later, call `find_task_pr` to verify status accuracy

### Temporal & Behavioral Data
8. `get_analytics` for the target cycle — real cycle time, lead time, throughput, blocking time
9. `query_audit_trail` scoped to the cycle period — complete event history, including shape, bet, ship, kill transitions
10. `compute_compliance_score` — governance health
11. `list_agents` — team composition

## Step 2: Analyze

### Bet Outcomes
For each bet in the cycle, determine outcome:
- **Shipped**: All scopes shipped within appetite. "bet-push-notifications: SHIPPED. 3/3 scopes delivered in 4 weeks (appetite: M = 4 weeks). Clean delivery."
- **Partial**: Some scopes shipped, some cut. "bet-search-redesign: PARTIAL. 4/6 scopes shipped. T7 (ranking) and T9 (analytics) cut at week 5."
- **Killed**: Bet killed by circuit breaker. "bet-onboarding: KILLED at week 4. 0/2 scopes shipped. Team correctly identified the bet wasn't converging."

Summarize: "Cycle-003: 1 shipped, 1 partial, 1 killed."

### Appetite Calibration
For each bet, was the appetite right?
- **Under-appetited**: Bet needed more time than allocated. Scopes were cut not because they weren't valuable, but because the work was bigger than estimated. "Search bet was M (4 weeks) but needed L (6 weeks) — 6 scopes was too much for M appetite."
- **Over-appetited**: Bet finished well before deadline. Idle time at the end. "Push bet finished in 3 weeks with M appetite — could have been S."
- **Correctly appetited**: Bet shipped close to the deadline without scope cuts. "Ideal calibration."

"Appetite accuracy: 1/3 bets correctly sized. Under-shaping is the trend — pitches aren't defining scope tightly enough."

### Scope Creep Audit
- Which scopes were added mid-cycle? Check the audit trail for tasks that entered the bet after the cycle started.
- "T9 (search analytics) was shaped and added to the search bet at week 3. This took the bet from 3 to 6 scopes — a 100% scope increase. The bet went from on-track to at-risk immediately."
- How many scopes were in the original pitch vs. final count?

### Circuit Breaker Review
For killed bets:
- **Timing**: When was the kill decision made? "Killed at week 4 of 6 — 67% through the cycle. Good timing — early enough to redirect capacity."
- **Signal quality**: Was the kill correct? "Onboarding had 0/2 scopes shipped at week 4. Kill was the right call."
- **Reshapeability**: Can this bet be reshaped for the next cycle? What would change? "Onboarding needs tighter scope — 2 scopes was too ambitious. Reshape with 1 scope (welcome screen only) for next betting table."

For partial bets:
- Were the scope cuts timely? "Search scope cuts happened at week 5 — ideally should have been week 4."
- Were the right scopes cut? "T9 (scope creep) was correctly cut. T7 (ranking) was the riskiest scope — also correct to cut."

### Hill Chart Reconstruction
For each bet, where did each scope end up?
- **Over the hill (shipped)**: Implementation done, verified, deployed
- **Mid-hill (partial)**: Work started but not completed
- **Base of hill (barely started)**: Minimal progress
- **Killed**: Explicitly killed

"Search bet hill chart: T4 results page (SHIPPED), T5 filters (SHIPPED), T6 suggestions (SHIPPED), T8 mobile search (QA — over hill), T7 ranking (BUILDING — mid-hill, cut), T9 analytics (SHAPED — base, scope creep, cut)."

### Flow — Measured Blocking
- Aggregate blocking time per bet.
- Where did blocking concentrate?
- Did any scope block another? (Dependency chains within bets)

### Actor Analysis (from audit trail)
- Who performed the most transitions?
- Kill decisions: who initiated them? Were they timely?
- Shape transitions: how long did shaping take per pitch?

### Governance Quality
- Compliance score breakdown: bet-cycle integrity, scope discipline, flow efficiency.
- Compare to previous cycle.

## Step 3: Formulate Recommendations

Based on DATA from this cycle:

- If appetite was consistently wrong → "Invest more time in shaping. Every pitch needs a prototype or spike to validate scope."
- If scope creep happened → "Lock scope after betting. New scopes go to cooldown shaping, not active bets."
- If circuit breaker was triggered too late → "Week 3 checkpoint: any bet with < 25% scopes shipped gets an explicit continue/kill decision."
- If bets were killed → "Reshape [bet name] with tighter scope for next betting table."
- If all bets shipped → "Appetite may be too generous — consider taking on one more S bet next cycle."

Every recommendation must trace to a finding from this cycle.

## Step 4: Deliver the Retrospective

### Example — Data-Backed Cycle Retrospective

> Cycle-003 ran 3 bets over 6 weeks: 1 shipped cleanly, 1 shipped partially (4/6 scopes), 1 correctly killed at week 4. Total: 10/13 scopes across active bets resolved (7 shipped, 3 cut, 2 killed, 1 in QA at cycle end). Throughput: 1.2 scopes/week. The cycle was characterized by scope creep in the search bet and a correct kill decision on onboarding.
>
> **Bet Outcomes**:
> - Push notifications: SHIPPED (3/3 scopes in 4 weeks, appetite M). Clean delivery — well-shaped pitch with clear boundaries.
> - Search redesign: PARTIAL (4/6 scopes). Scope crept from 3 to 6 scopes mid-cycle. T9 (analytics) added at week 3 was the inflection point. Cut T7 (ranking) and T9 at week 5.
> - Onboarding: KILLED at week 4 (0/2 scopes shipped). Correct decision — team recognized the work wasn't converging. Candidate for reshaping.
>
> **Appetite Calibration**: Push correctly appetited (M). Search under-appetited — 6 scopes needed L, not M. Onboarding unclear — killed before appetite could be validated.
>
> **Scope Creep**: T9 added mid-cycle. Root cause: search analytics was a "nice to have" that got promoted during building. Lock scope after betting — new ideas go to cooldown shaping.
>
> **Circuit Breaker**: Onboarding killed at week 4 — good timing. Search scope cuts at week 5 — one week late. Recommend week 4 checkpoint for all bets.
>
> **By the numbers:** 3 bets (1 shipped, 1 partial, 1 killed) | 7/13 scopes shipped | throughput: 1.2/week | scope creep: +3 scopes | appetite accuracy: 1/3 | compliance: B (78)
>
> **Recommendations:**
> 1. Lock scope after betting — T9's mid-cycle addition turned a green bet red. New ideas go to cooldown.
> 2. Week 4 checkpoint — search scope cuts should have happened at week 4, not week 5. Explicit continue/kill decision at week 4 for all bets.
> 3. Reshape onboarding — reduce to 1 scope (welcome screen only) with S appetite. Prototype during cooldown before next betting table.
>
> **Cooldown prep:** Shape onboarding v2 (tighter scope). Shape analytics dashboard (RAW). Prototype ranking algorithm (spike for search bet v2).

### Format

**Opening**: One paragraph with bet outcome summary, throughput, and cycle character.
**Bet Outcomes**: Per-bet analysis with scope counts and outcomes.
**Appetite Calibration**: Was each bet correctly sized?
**Scope Creep Audit**: What was added mid-cycle and why?
**Circuit Breaker Review**: Kill/cut decisions — timing and correctness.
**By the Numbers**: Compact metrics line.
**Recommendations**: 2-4 specific, data-backed items.
**Cooldown Prep**: What to shape, fix, and explore during cooldown.

## Step 5: Persist Findings

After delivering the narrative, output a structured summary block:

```
--- RETRO FINDINGS (save to memory) ---
Cycle: [cycle name]
Date: [today's date]
Bets: X (shipped: Y, partial: Z, killed: W)
Scopes shipped: X/Y
Appetite accuracy: X/Y bets correctly sized
Scope creep: +N scopes added mid-cycle
Circuit breaker: N bets killed, timing assessment
Throughput: N scopes/week
Compliance score: N (grade)
Key finding: [primary insight]
Recommendations: [2-4 items]
Cooldown prep: [shaping, fixing, exploring priorities]
Reshaping candidates: [killed bets to reshape]
---
```

Tell the user: "These findings should be saved to memory so `/ido4dev:standup` and `/ido4dev:plan-cycle` can reference them. Would you like me to update the project memory?"

### Anti-patterns — Do NOT:
- Give generic advice ("shape better") — tie every recommendation to specific data
- Skip comparison with previous retros — trends matter more than snapshots
- Treat killed bets as failures — they're often correct governance
- Ignore scope creep — it's the #1 Shape Up anti-pattern
- Forget to persist findings — the retro's value compounds when future skills reference it
- Use estimated velocity when real throughput data is available
- Skip appetite calibration — it's the single most actionable Shape Up metric
- Ignore circuit breaker timing — late kills waste more capacity than early kills
- Reference waves, epics, epic integrity, sprints, DoR, or work item types — this is Shape Up only
- Use `list_waves`, `get_wave_status`, `search_epics`, `get_epic_tasks`, `list_sprints`, `get_sprint_status` — Shape Up uses cycles, bets, and scopes
