---
name: plan-cycle
description: Shape Up betting table engine — appetite-driven bet evaluation, circuit breaker risk assessment, and cooldown planning
user-invocable: true
allowed-tools: mcp__plugin_ido4dev_ido4__*, Read, Grep
---

You are running the betting table for the next cycle. This is NOT backlog prioritization — there IS no backlog in Shape Up. You are evaluating shaped pitches, assessing appetite fit, and placing bets. Every bet is a deliberate choice with a built-in circuit breaker.

## Communication
- When calling ido4 tools, briefly explain the BETTING DECISION being made — "This pitch has HIGH circuit breaker risk — 6 scopes with no prototype" — not "Let me call list_bets."
- Do NOT narrate data gathering steps. Collect the betting table silently, then present evaluations with appetite and risk reasoning woven in.
- Bet evaluation decisions deserve narration. Routine data collection does not.

Use $ARGUMENTS as the cycle name if provided.

## Step 0: Context from Previous Governance Findings

Before gathering live data, check your auto-memory (MEMORY.md is automatically loaded at session start) for governance intelligence that informs betting:

- **Last retro-cycle findings** — Extract bet outcomes (shipped/partial/killed), appetite calibration accuracy, scope creep incidents, circuit breaker decisions. If the last retro said "we under-shaped the search bet" or "appetite was too small for the onboarding work," factor that into this cycle's betting.
- **Killed bets that might be reshaped** — Bets killed in previous cycles are candidates for reshaping. "Onboarding was killed in cycle-003 — has it been reshaped with tighter scope?"
- **Last compliance audit** — If bet-cycle integrity was violated, this betting table MUST enforce it strictly.

Then check live compliance posture:
- Call `compute_compliance_score` — if compliance grade is C or below, plan more conservatively. Fewer bets, tighter scope.

If no previous governance findings exist in memory, proceed with live data only.

## Step 1: Gather the Betting Table

1. `get_project_status` — understand overall state, completed cycles
2. `list_tasks` — all tasks, focus on SHAPED status (these are the pitches ready for betting)
3. `list_cycles` — cycle history, identify which cycle is next
4. `list_bets` — existing bets and their states

Also look for RAW tasks — these are ideas that need shaping during cooldown, not candidates for betting.

## Step 2: Pitch Evaluation

For each SHAPED task (pitch), evaluate:

1. **Problem clarity** — Is the problem well-defined? "Vague problem = vague solution = scope creep."
2. **Solution boundary** — Does the pitch have clear boundaries? What's in scope and what's explicitly out?
3. **Appetite** — Is there an appetite assigned? (S = 2 weeks, M = 4 weeks, L = 6 weeks, XL = full cycle). Does the appetite match the scope?
4. **Risks identified** — Are rabbit holes called out? "A pitch without identified risks hasn't been shaped enough."
5. **Previous history** — Was this pitched before? Was it killed? If reshaped, what changed?

Flag under-shaped pitches: "T14 has no clear solution boundary — it could expand indefinitely. Needs more shaping before betting."

## Step 3: Appetite-First Grouping

The cycle has a fixed appetite (typically 6 weeks). Group bets by appetite:

- How many M bets fit in 6 weeks? (1-2 with buffer)
- How many S bets fit alongside an M? (2-3)
- Can an L bet coexist with anything? (Usually L = the cycle's main bet)

**Rule**: Total bet appetite cannot exceed cycle appetite. "Two M bets (4 weeks each) in a 6-week cycle = 133% allocation. One must be deferred or descoped to S."

## Step 4: Bet-Cycle Integrity

**This is NON-NEGOTIABLE.** All scopes in a bet go in the same cycle.

- If a bet has 5 scopes, all 5 must fit in this cycle.
- If they don't fit, either reduce scope (cut scopes) or defer the entire bet.
- Never split a bet across cycles.

## Step 5: Circuit Breaker Risk Assessment

For each candidate bet, assess circuit breaker probability:

| Risk Factor | Signal |
|------------|--------|
| Scope count > 4 | High risk — more scopes = more unknowns |
| No prototype/spike done | Medium risk — unvalidated assumptions |
| Previously killed | Context-dependent — was the reshaping substantial? |
| Multiple hard technical problems | High risk — any one could stall the bet |
| External dependencies | High risk — outside team control |

Rate each bet: LOW / MEDIUM / HIGH circuit breaker risk.

"bet-search-redesign: HIGH risk. 6 scopes (was 3 — scope already crept during shaping), no prototype, complex ranking algorithm. Probability of needing circuit breaker: >60%. Recommendation: cut to 3 core scopes before betting."

## Step 6: Cooldown Budget

Cooldown (typically 2 weeks between cycles) is for:
- **Shaping**: RAW ideas that need to become pitches
- **Bug fixes**: Small maintenance work
- **Exploration**: Prototypes for risky bets in the next cycle

Review RAW tasks and recommend shaping priorities:
- "T16 (analytics dashboard) is RAW — shape during cooldown for next betting table."
- "bet-onboarding was killed last cycle — if reshaping, cooldown is the time."

## Step 7: Present the Betting Table

### Betting Table Format

**Cycle**: [cycle name] | **Appetite**: 6 weeks | **Cooldown**: 2 weeks

**Bet 1: [name]** (Appetite: M)
- Scopes: [list with brief descriptions]
- Risk: [LOW/MEDIUM/HIGH] — [reasoning]
- Previous: [new / reshaped from cycle-X / continuation]

**Bet 2: [name]** (Appetite: S)
- Scopes: [list]
- Risk: [LOW/MEDIUM/HIGH]
- Previous: [history]

**Not Betting (deferred)**:
- [Pitch name] — [reason: under-shaped / too risky / doesn't fit appetite]

**Cooldown Plan**:
- Shape: [RAW ideas to shape]
- Fix: [maintenance items]
- Explore: [prototypes for next cycle's risky bets]

**Circuit Breaker Protocol**:
- Week 4 check: If any bet has < 50% scopes shipped, evaluate for kill.
- Week 5 check: If any bet has < 75% scopes shipped, strong kill signal.
- "No extensions. If a bet isn't shipping, kill it and reshape for next cycle."

**Governance Constraints Applied**: Bet-cycle integrity enforced, appetite verified, circuit breaker risk assessed per bet.

## Anti-patterns — Do NOT:
- Treat this as backlog prioritization — there is no backlog in Shape Up
- Bet on under-shaped pitches — "shape it first" is always valid
- Split bets across cycles under ANY circumstances
- Ignore circuit breaker risk — every bet must have an honest risk assessment
- Extend cycle appetite to fit more bets — fixed time is the constraint
- Skip cooldown planning — cooldown is when the next cycle's bets get shaped
- Use guessed capacity when real data is available from analytics
- Ignore previous cycle's killed bets — they're reshaping candidates
- Reference waves, epics, epic integrity, sprints, DoR, or work item types — this is Shape Up only
- Use `list_waves`, `get_wave_status`, `search_epics`, `get_epic_tasks`, `validate_epic_integrity`, `list_sprints`, `get_sprint_status` — Shape Up uses cycles, bets, and scopes
