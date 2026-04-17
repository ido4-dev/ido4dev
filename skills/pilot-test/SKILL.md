---
name: pilot-test
description: End-to-end verification of the governance platform against a live sandbox — exercises every Phase 4 service and validates the data pipeline
user-invocable: true
allowed-tools: mcp__plugin_ido4dev_ido4__*
---

You are running a structured end-to-end verification of the ido4 governance platform. This is not a demo — it is a systematic test protocol that exercises every layer of the system against a real GitHub project and produces a verification report.

**Tone**: Test engineer — methodical, precise, reporting results not narrative. Every check has a pass/fail outcome.

## Communication
- When calling ido4 tools, briefly state what is being TESTED — "Testing BRE rejection: starting a blocked task should fail..." — not "Let me call validate_transition."
- Do NOT narrate internal setup steps (reading config, discovering issue numbers). Just do them silently.
- Report RESULTS (pass/fail with evidence), not process. The phase report format IS the output.

## Argument Detection

- **`$ARGUMENTS` = a repository** (contains `/`, e.g. `b-coman/ido4-test`) → Full pilot test using that repository
- **`$ARGUMENTS` = "cleanup"** → Jump to Phase 8 (cleanup only)
- **No arguments** → Ask the user for a repository in `owner/repo` format. Do NOT suggest repositories — just ask for the text input.

---

## Phase 1: Sandbox Setup

1. **Repository**: Use the repository from `$ARGUMENTS`, or if not provided, ask the user to type the repository in `owner/repo` format. Warn: this creates ~25 real GitHub issues + a PR.

2. **Create**: Call `create_sandbox` with the repository. Wait for completion (2-3 minutes).

3. **Verify Setup** — Run these checks:
   - `get_project_status` → confirm the project exists and has tasks
   - `list_waves` → confirm 4 waves returned (wave-001 through wave-004)
   - `get_wave_status` for wave-002 → confirm it is the active wave with a mix of task statuses

4. **Report Setup**:
   ```
   PHASE 1: SETUP ✓
   - Sandbox created in [owner/repo]
   - Waves: 4 (1 completed, 1 active, 2 planned)
   - Active wave: wave-002-core with X tasks
   ```

---

## Phase 2: Exercise Governed Operations

Execute real transitions to populate the audit trail with diverse governance events. Use the issue numbers from the sandbox — you need to discover the actual GitHub issue numbers by calling `list_tasks` filtered to wave-002 first, then matching task titles to the reference names below.

**Map task references to issue numbers**: Call `list_tasks` and identify:
- T11 (OAuth integration) → READY_FOR_DEV
- T13 (Data export service) → READY_FOR_DEV
- T14 (Batch processing) → IN_REFINEMENT
- T8 (Data validation layer) → BLOCKED
- T9 (API rate limiting) → BLOCKED
- T10 (Auth token service) → IN_REVIEW (no PR)

Record each issue number for use in subsequent calls.

### 2A: Valid Transitions (expect 6 successes)

Execute each transition and record success/failure:

1. `validate_transition` with transition: "start" on T11 (OAuth integration) → expect READY_FOR_DEV → IN_PROGRESS
2. `validate_transition` with transition: "start" on T13 (Data export service) → expect READY_FOR_DEV → IN_PROGRESS
3. `validate_transition` with transition: "review" on T13 → expect IN_PROGRESS → IN_REVIEW
4. `validate_transition` with transition: "block" on T11 with message "Waiting on API spec from ETL task" → expect IN_PROGRESS → BLOCKED
5. `validate_transition` with transition: "unblock" on T11 → expect BLOCKED → IN_PROGRESS (this generates blocking time data for analytics)
6. `validate_transition` with transition: "ready" on T14 (Batch processing) → expect IN_REFINEMENT → READY_FOR_DEV

### 2B: Invalid Transitions (expect 3 BRE rejections)

These SHOULD fail — the BRE must block them:

7. `validate_transition` with transition: "start" on T8 (Data validation layer) → expect REJECTION: task is BLOCKED, can't start
8. `validate_transition` with transition: "start" on T9 (API rate limiting) → expect REJECTION: task is BLOCKED, can't start
9. `validate_transition` with transition: "approve" on T10 (Auth token service) → expect REJECTION or validation warnings: IN_REVIEW but no PR exists

For each rejection, verify the response includes validation errors explaining WHY the transition was blocked.

### 2C: Multi-Agent Operations (expect registrations + lock contention)

10. `register_agent` with agentId="agent-alpha", name="Alpha", role="coding", capabilities=["backend", "data"]
11. `register_agent` with agentId="agent-beta", name="Beta", role="coding", capabilities=["frontend", "auth"]
12. `lock_task` on T11's issue number with agentId="agent-alpha" → expect lock acquired
13. `lock_task` on T11's issue number with agentId="agent-beta" → expect contention warning or rejection (T11 already locked by alpha)

### 2D: Report

```
PHASE 2: GOVERNED OPERATIONS
- Valid transitions: X/6 ✓ (list each)
- BRE rejections: X/3 ✓ (list each with rejection reason)
- Agent registration: 2/2 ✓
- Lock contention: detected ✓/✗
```

---

## Phase 3: Verify Data Pipeline

Now verify that Phase 4 services contain real data from the operations in Phase 2.

### 3A: Audit Trail

1. `query_audit_trail` with no filters → count total events, verify > 0
2. `query_audit_trail` with `transition: "start"` → verify returns the start transition events from Phase 2
3. `get_audit_summary` → verify it returns grouped event counts (by actor, by transition type)

**Checks**:
- Total events > 6 (at minimum the 6 successful transitions)
- Start transitions present in filtered results
- Summary shows activity grouped by transition type

### 3B: Analytics

4. `get_analytics` with waveName="wave-002-core" → verify it returns metrics
5. `get_task_cycle_time` on T13's issue number → verify it returns cycle time (T13 went start → review)

**Checks**:
- Wave analytics returns throughput > 0
- T13 has measurable cycle time (however short)
- Blocking time data present (from T11's block → unblock cycle)

### 3C: Compliance

6. `compute_compliance_score` → verify returns 0-100 score with grade and category breakdown

**Checks**:
- Score is a number between 0 and 100
- Grade is a letter (A-F)
- Categories present: brePassRate, qualityGates, processAdherence, containerIntegrity, flowEfficiency
- BRE pass rate is < 100% (we generated 3 failures in Phase 2B)
- Recommendations array is non-empty

### 3D: Agents

7. `list_agents` → verify 2 agents registered with correct details

**Checks**:
- 2 agents returned (agent-alpha, agent-beta)
- Agent-alpha has lock on T11

### 3E: Report

```
PHASE 3: DATA PIPELINE
- Audit trail: X events captured ✓/✗
- Audit filtering: transition filter works ✓/✗
- Audit summary: grouped counts returned ✓/✗
- Analytics (wave): throughput=X/day, blocking_time=Xh ✓/✗
- Analytics (task): T13 cycle_time=Xs ✓/✗
- Compliance: score=X (grade Y) ✓/✗
  - BRE pass rate: X% (< 100% expected) ✓/✗
  - Categories present: ✓/✗
  - Recommendations: X items ✓/✗
- Agents: 2 registered, 1 active lock ✓/✗
```

---

## Phase 4: Verify Governance Violations

The sandbox embeds 5 governance violations. Verify each is detectable.

### 4A: Epic Integrity Violation

Call `validate_epic_integrity` on the Authentication epic (E3). It should report a violation because T16 (RBAC) is in wave-003 while T10, T11, T12 are in wave-002.

If `validate_epic_integrity` requires an epic name, find the Auth epic using `search_epics` with "Authentication" first.

**Check**: Violation detected — tasks split across waves.

### 4B: False Status (T10)

Call `find_task_pr` on T10's issue number. T10 is IN_REVIEW but has no PR.

**Check**: Returns null/empty — no PR for an In Review task = false status.

### 4C: Cascade Blocker (T7 → T8 → T9)

Find T7 (Build ETL transformations, IN_PROGRESS) by scanning the task list. Call `analyze_dependencies` on T9's issue number.

**Check**: Dependency chain shows T9 → T8 → T7 (depth 2 cascade).

### 4D: Review Bottleneck (T12)

Find T12 (Session management, IN_REVIEW). Call `find_task_pr` on T12 → returns a real PR. Then call `get_pr_reviews` on that PR.

**Check**: PR exists but has 0 reviews (stale review).

### 4E: Wave Risk (wave-002)

Call `get_wave_status` for wave-002-core.

**Check**: Shows blocked tasks + stalled reviews = wave at risk.

### 4F: Report

```
PHASE 4: GOVERNANCE VIOLATIONS
- Epic integrity (Auth split): detected ✓/✗
- False status (T10 no PR): detected ✓/✗
- Cascade blocker (T7→T8→T9): detected ✓/✗
- Review bottleneck (T12 stale): detected ✓/✗
- Wave risk (wave-002): detected ✓/✗
```

---

## Phase 5: Cross-Service Intelligence

Verify that tools can be combined for data-backed reasoning — this is what skills do.

### 5A: Standup Data Availability

Call the tools a standup would use:
1. `get_wave_status` (wave-002)
2. `query_audit_trail` (last hour — should contain Phase 2 transitions)
3. `get_analytics` (wave-002)
4. `list_agents`

**Check**: All 4 return substantive data. An LLM running `/mcp__ido4__standup` would have real audit events, real analytics, and agent status to reason from — not just snapshot data.

### 5B: Compliance Intelligence Data

Call the tools a compliance audit would use:
1. `compute_compliance_score`
2. `validate_epic_integrity` (Auth epic)
3. `analyze_dependencies` (T9)
4. `query_audit_trail` (recent, to see actor patterns)

**Check**: Quantitative score + structural violations + audit trail actor data all available. The `/mcp__ido4__compliance` ceremony can produce a 3-part report (quantitative + structural + synthesis).

### 5C: Report

```
PHASE 5: CROSS-SERVICE INTELLIGENCE
- Standup data: all 4 sources return data ✓/✗
- Compliance data: score + structure + audit all available ✓/✗
- Intelligence layer can reason from real data, not snapshots ✓/✗
```

---

## Phase 5.5: Active Governance

Verify Phase 6 services — work distribution, coordination, and merge readiness — using the seeded audit trail and agent data.

### 5.5A: Work Distribution

1. `get_next_task` with agentId="agent-alpha" → alpha is locked on T7, so expect recommendations from remaining ready tasks
2. `get_next_task` with agentId="agent-beta" → expect T11 (OAuth) ranked high due to capability match (auth, security)

**Checks**:
- Both calls return recommendations with `scoreBreakdown`
- T13 (Data export) should appear with cascade value > 0 (T14 depends on it)
- T7 should NOT be recommended (already locked by alpha)
- Recommendations differ between agents based on capability matching

### 5.5B: Coordination State

Call `get_coordination_state` with agentId="agent-alpha".

**Checks**:
- Returns 2 registered agents
- Shows T7 lock held by agent-alpha
- Events array is non-empty (seeded audit trail)
- `myCurrentTask` shows alpha's lock on T7

### 5.5C: Merge Readiness

1. `check_merge_readiness` on T12's issue number → expect:
   - workflow check: PASS (task is In Review)
   - PR review check: FAIL (0 reviews on seeded PR)
   - dependency check: PASS (no unsatisfied dependencies)
   - epic integrity check: WARN or FAIL (Auth epic split across waves)

2. `check_merge_readiness` on T10's issue number → expect:
   - PR check: FAIL (no PR exists)

### 5.5D: Override Mechanism

Call `check_merge_readiness` on T12's issue number with overrideReason="Sandbox verification — testing override mechanism".

**Check**: Returns ready=true with override recorded.

### 5.5E: Report

```
PHASE 5.5: ACTIVE GOVERNANCE
- Work distribution (alpha): recommendations returned ✓/✗
- Work distribution (beta): recommendations returned ✓/✗
- Cascade scoring: T13 cascade > 0 ✓/✗
- Capability matching: agents get different rankings ✓/✗
- Coordination state: 2 agents, events non-empty ✓/✗
- Merge readiness (T12): workflow PASS, review FAIL ✓/✗
- Merge readiness (T10): PR FAIL ✓/✗
- Override mechanism: ready=true with override ✓/✗
```

---

## Phase 7: Verification Report + Skill Bridge

### 7A: Final Report

Compile all phase reports into a single verification report:

```
═══════════════════════════════════════════════════
       PILOT TEST VERIFICATION REPORT
═══════════════════════════════════════════════════

Repository: [owner/repo]
Scenario: hydro-governance
Date: [timestamp]

PHASE 1: SETUP                          [PASS/FAIL]
  Sandbox creation ✓  |  containers ✓  |  tasks ✓

PHASE 2: GOVERNED OPERATIONS            [PASS/FAIL]
  Valid transitions: 6/6 ✓
  BRE rejections: 3/3 ✓
  Multi-agent: 2 agents, contention detected ✓

PHASE 3: DATA PIPELINE                  [PASS/FAIL]
  Audit: X events, filtering works ✓
  Analytics: throughput X/day, blocking Xh ✓
  Compliance: score X (grade Y), BRE pass rate Z% ✓
  Agents: 2 registered, 1 lock active ✓

PHASE 4: GOVERNANCE VIOLATIONS          [PASS/FAIL]
  Epic integrity: ✓  |  False status: ✓
  Cascade blocker: ✓  |  Review bottleneck: ✓
  Wave risk: ✓

PHASE 5: CROSS-SERVICE INTELLIGENCE    [PASS/FAIL]
  Standup data: ✓  |  Compliance data: ✓

PHASE 5.5: ACTIVE GOVERNANCE           [PASS/FAIL]
  Work distribution: ✓  |  Cascade scoring: ✓
  Coordination: ✓  |  Merge readiness: ✓
  Override mechanism: ✓

═══════════════════════════════════════════════════
  OVERALL VERDICT: [PASS / PARTIAL / FAIL]
  Checks passed: X/Y
═══════════════════════════════════════════════════
```

### 7B: Skill Verification Bridge

After the automated report, tell the user:

> The data pipeline is verified. The sandbox now has real audit events, analytics data, compliance scores, and registered agents — exactly what the upgraded skills need.
>
> **Run each governance skill to verify data-backed intelligence:**
>
> 1. `/mcp__ido4__health` — Should show YELLOW or RED with compliance grade, throughput, agent status
> 2. `/mcp__ido4__standup` — Should reference audit trail events, flag cycle time outliers, show agent activity
> 3. `/mcp__ido4__board` — Should show kanban with flow analysis, blocked %, agent annotations
> 4. `/mcp__ido4__compliance` — Should show 3-part report: quantitative score + structural audit + synthesis
> 5. `/mcp__ido4__retro` — Should show real analytics (throughput, cycle time, blocking time), actor analysis (methodology-aware)
> 6. `/mcp__ido4__plan` — Should use analytics for capacity, compliance for constraints (methodology-aware)
>
> After verifying skills, run `/pilot-test cleanup` to destroy the sandbox.

---

## Phase 8: Cleanup

When `$ARGUMENTS` = "cleanup":

1. Call `destroy_sandbox`
2. Confirm: "Sandbox destroyed. All issues closed, PR deleted, config removed."

---

## Anti-patterns — Do NOT:

- Skip phases or checks — run every verification even if earlier ones pass
- Guess at results — every check must come from an actual tool call
- Continue past a critical failure without noting it — report the failure and continue testing
- Produce a verbose report — stick to the structured format above
- Run skills yourself — Phase 6 tells the user to run them manually so they can observe the intelligence layer firsthand
