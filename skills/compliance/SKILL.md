---
name: compliance
description: Comprehensive compliance intelligence — quantitative behavioral scoring, structural principle audit, and cross-referenced synthesis
user-invocable: true
allowed-tools: mcp__plugin_ido4dev_ido4__*
context: fork
---

You are performing a comprehensive compliance assessment. This skill combines three perspectives: a quantitative behavioral score (from real event history), a structural principle audit (from current project state), and an intelligence synthesis (cross-referencing both with actor and temporal analysis). Together, these answer: "How governed are we — and what should we do about it?"

## Communication
- Do NOT narrate data gathering. Gather all data silently, then present the compliance report.
- Narrate FINDINGS and INSIGHTS — "Epic Integrity violation detected: Auth split across waves" — not "I'm calling get_compliance_data now."
- The report structure IS the narration. No preamble before Part 1.

## Part 1: Quantitative Compliance Score

This is the reproducible number — the deterministic score from real behavioral data.

### Step 1.1: Compute the Score

Call `get_compliance_data` — this single call returns ALL data needed for the entire compliance assessment:
- **compliance**: score (0-100), grade, per-category breakdown, recommendations
- **auditTrail**: complete event history (filterable by since/until/actorId)
- **analytics**: cycle time, throughput, blocking time
- **waves**: all waves and their states
- **tasks**: all tasks with wave assignments and statuses
- **blockerAnalyses**: dependency analysis for every blocked task
- **containerIntegrityChecks**: integrity validation for every unique epic

**Use this data for ALL subsequent steps. Do NOT call any other data-gathering tools** — everything is in this single response.

### Step 1.2: Present the Score

Present the score card:

```
## Compliance Score: [score]/100 (Grade: [A-F])

| Category             | Score | Detail                                    |
|----------------------|-------|-------------------------------------------|
| BRE Pass Rate        | XX    | [N/M transitions passed validation]       |
| Quality Gates        | XX    | [status of PR reviews, test coverage, etc]|
| Process Adherence    | XX    | [N tasks followed full workflow]           |
| Epic Integrity       | XX    | [structural epic compliance]               |
| Flow Efficiency      | XX    | [productive time vs. blocked time]         |
```

Include the ComplianceService's own recommendations — these are data-derived and specific.

### Step 1.3: Score Context

- If a previous compliance score exists in memory, show the trend: "Score improved from 62 to 73 (+11 points). Process adherence up 15 points — refinement enforcement is working."
- If no previous score exists, note this is the baseline: "First compliance measurement. Score of 73 becomes the baseline for trend tracking."

## Part 2: Structural Principle Audit

The behavioral score measures what HAS happened. The structural audit catches what IS wrong right now — violations the behavioral score might not yet reflect.

### Step 2.1: Use Data Already Gathered

All governance data was already returned by `get_compliance_data` in Step 1.1. Do NOT make additional tool calls. Use:
- `waves` for wave state analysis
- `tasks` for task/wave/epic assignments
- `containerIntegrityChecks` for pre-computed epic integrity results
- `blockerAnalyses` for dependency information

### Step 2.2: Audit Each Principle

#### Principle 1 — Epic Integrity
"All tasks within an epic MUST be assigned to the same wave."

Use the `containerIntegrityChecks` array from `get_compliance_data` — it contains pre-computed integrity results for every unique epic. Report any check where `maintained` is false, with the violation details and severity score.

#### Principle 2 — Active Wave Singularity
"Only one wave can be active at a time."

From the `waves` array:
- Count waves with `status: 'active'`
- If more than one is active, report with severity score

#### Principle 3 — Dependency Coherence
"A task's wave must be numerically equal to or higher than all its dependency tasks' waves."

From the `tasks` and `blockerAnalyses` arrays:
- For tasks with dependencies, check if any task depends on a task in a LATER wave
- Report forward dependency violations with severity score

#### Principle 4 — Self-Contained Execution
"Each wave contains all dependencies needed for its completion."

From the `tasks` array and `blockerAnalyses`:
- Check if any task in the active wave depends on an incomplete task in a future wave
- Report unsatisfiable dependencies with severity score

#### Principle 5 — Atomic Completion
"A wave is complete only when ALL its tasks are in Done."

From the `waves` and `tasks` arrays:
- For each wave marked as completed, check if all its tasks are Done
- Report non-Done tasks in completed waves with severity score

### Step 2.3: Score Severity

For each violation, calculate severity to prioritize remediation:

**Base severity** = number of directly affected tasks
**Wave proximity multiplier:**
- Active wave: × 3 (immediate impact on current work)
- Next planned wave: × 1.5 (upcoming impact)
- Future wave: × 1 (can be fixed during planning)

**Cascade multiplier** = 1 + number of downstream tasks blocked by this violation
**Epic scale** = violations in larger epics (5+ tasks) add +2

**Severity = (base × wave proximity) + cascade + epic scale**

## Part 3: Intelligence Synthesis

This is where the two perspectives combine to produce insight neither can produce alone.

### Step 3.1: Cross-Reference Quantitative + Structural

- Does the behavioral score agree with the structural audit? A high compliance score with structural violations means the violations are recent (not yet reflected in behavioral data) — flag them as emerging risks.
- A low compliance score with no structural violations means the project recovered from past violations but the behavioral history still shows the damage — governance is improving.
- Specific cross-references: if BRE pass rate is low, which actors are causing failures? If process adherence is low, which tasks skipped steps?

### Step 3.2: Actor Pattern Analysis

Use the `auditTrail` from `get_compliance_data` (already gathered). Analyze by actor:

- **Who is causing BRE failures?** Group failed validation events by actor. "Agent-Beta caused 6 of 8 BRE failures — all on dependency-related transitions."
- **Who has the lowest process adherence?** Which actor skips refinement? Which actor moves tasks directly from Backlog to In Progress?
- **Actor governance ranking**: If multiple actors, rank them by governance compliance. This is actionable — the lowest-compliance actor needs guidance or constraints.

### Step 3.3: Temporal Trend Analysis

Compare current findings to previous compliance audits (from memory):
- **Score trend**: Improving, degrading, or stable? "Score: 73 → 79 → 73 — oscillating, not improving. Process adherence gains are offset by epic integrity regressions."
- **Violation recurrence**: Are the same violations appearing audit after audit? "Epic Integrity violation on Auth has appeared in 3 consecutive audits — remediation is not sticking."
- **Category trends**: Which categories are improving? Which are declining? "BRE pass rate improved from 85% to 92%. Flow efficiency declined from 78% to 65% — more blocking time."

### Step 3.4: Prioritized Recommendations

Combine ComplianceService recommendations with structural remediation steps. Prioritize by:
1. **Recurring violations** (highest priority — they won't fix themselves)
2. **Active wave structural violations** (immediate impact)
3. **Low-scoring compliance categories** (biggest room for improvement)
4. **Actor-specific issues** (targeted intervention)

## Presentation

### Format

```
## Compliance Intelligence Report

### Quantitative Score: [score]/100 ([grade])
[Score card table with per-category breakdown]
[Trend: improved/declined/stable from last audit]

### Structural Audit: [X/5] Principles Compliant
[Per-principle findings with severity scores]

### Synthesis
[Cross-reference insights]
[Actor patterns]
[Temporal trends]
[Prioritized recommendations — numbered, specific, data-backed]
```

### Example — Compliance Intelligence

> ## Compliance Intelligence Report
>
> ### Quantitative Score: 73/100 (C)
> | Category | Score | Detail |
> |----------|-------|--------|
> | BRE Pass Rate | 92 | 46/50 transitions passed |
> | Quality Gates | 70 | 2 PRs merged without required approvals |
> | Process Adherence | 65 | 3 tasks skipped refinement |
> | Epic Integrity | 85 | 1 minor split (resolved) |
> | Flow Efficiency | 60 | 37h blocking time in 12-day wave |
>
> Trend: Score declined from 79 to 73 (-6 points). Flow efficiency dropped 15 points — blocking time doubled.
>
> ### Structural Audit: 4/5 Compliant
> **Principle 1 — Epic Integrity: 1 VIOLATION**
> Epic "Auth" split: #50-#52 in Wave-002; #53 in Wave-003.
> Severity: 9.5. Remediation: Move #53 → Wave-002.
>
> **Principles 2-5: COMPLIANT**
>
> ### Synthesis
> The behavioral score and structural audit agree: Epic Integrity is the weakest area (structural violation + 85 behavioral score = violation is active and measured). Process adherence is degrading — 3 tasks skipped refinement this wave vs. 1 last wave.
>
> Actor analysis: Agent-Beta caused 4 of 4 BRE failures (all dependency-related) and skipped refinement on 2 of 3 tasks that bypassed it. Agent-Alpha is fully compliant.
>
> **Prioritized Recommendations:**
> 1. Fix Auth epic split — move #53 to Wave-002 (recurring violation, 3rd consecutive audit)
> 2. Enforce refinement for Agent-Beta — configure methodology to require refinement step
> 3. Investigate blocking time — 37h is 2x the Wave-001 baseline, driving flow efficiency down

## Step 4: Persist Findings

After delivering the report, output a structured summary block:

```
--- COMPLIANCE FINDINGS (save to memory) ---
Date: [today's date]
Compliance score: [score]/100 ([grade])
  BRE pass rate: [score]
  Quality gates: [score]
  Process adherence: [score]
  Epic integrity: [score]
  Flow efficiency: [score]
Structural audit: [X/5] compliant
Violations: [list with principle, description, severity]
Trend: [improving/degrading/stable] from [previous score] to [current]
Actor insights: [per-actor compliance patterns]
Most urgent fix: [specific action]
Resolved since last audit: [any improvements]
---
```

Tell the user: "These compliance findings should be saved to memory so `/standup` and `/plan-wave` can reference them. Would you like me to update the project memory?"

### Anti-patterns — Do NOT:
- Skip any principle in the structural audit — audit ALL 5
- Report vague violations — cite specific task numbers, wave names, epic names
- Omit remediation — every violation needs a concrete fix
- Conflate principles — each has distinct validation logic
- Report violations without severity — not all violations are equally urgent
- Sugar-coat violations — if governance is broken, say so clearly
- Forget to persist findings — other skills depend on this output
- Present only the quantitative score without structural audit — each catches things the other misses
- Skip actor analysis — knowing WHO needs guidance is as actionable as knowing WHAT to fix
- Ignore temporal trends — a score without context is just a number
