# Phase 3 Closing Smoke Test — Runbook

**Purpose:** live-verify in a fresh Claude Code session that Phase 3's hook layer produces the expected end-to-end behavior.
**Duration:** ~30-45 minutes.
**Runs:** 4 scenarios (brief §9; PostCompact scenario struck because Stage 6 was skipped).
**Output:** `reports/e2e-005-phase-3-smoke.md` (co-authored with Claude after execution).

This is a runbook, not a report. Follow each scenario; capture observations; we'll write the report together after.

---

## 0. Prerequisites (one-time setup)

### 0.1 Test directory

Using `~/dev-projects/ido4dev-live-test/` (exists from Phase 2.1 verification).

Verify it has:
```bash
ls ~/dev-projects/ido4dev-live-test/.ido4/
# expect: methodology-profile.json
cat ~/dev-projects/ido4dev-live-test/.ido4/methodology-profile.json
# expect: {"id":"hydro"} — present but doesn't declare methodology field
```

The `{"id":"hydro"}` format won't resolve a methodology in the runner's `loadProfile()` (looks for `raw.methodology || raw.profile`). Profile will be null at evaluation time — rules will fire regardless of their `profiles:` filter. For smoke-test purposes that's fine; cleaner long-term would be `{"methodology":"hydro"}` but not required here.

### 0.2 Synthetic state for the MCP-tool scenarios

Scenarios 2 and 3 call real MCP tools (`validate_transition`, `compute_compliance_score`). Those tools need project state to return meaningful responses. Two options:

**Option A (simplest):** invoke the plugin's `sandbox` skill once before running scenarios 2-3 — it seeds synthetic state (waves, tasks, statuses) against which tool calls return real data. Pattern already used in prior E2E runs.

**Option B:** use an existing ido4 project you already have (e.g., a real GitHub-backed ido4 repo).

I recommend Option A — isolates the smoke test from real-project artifacts.

### 0.3 Plugin launch command

```bash
cd ~/dev-projects/ido4dev-live-test
claude --plugin-dir ~/dev-projects/ido4dev
```

This loads the ido4dev plugin from your local checkout (current state = Stage 8 shipped, 9 commits ahead of origin). Alternative: install from marketplace, but for smoke-testing local changes, the `--plugin-dir` form is cleaner.

### 0.4 State.json location

The plugin writes state to `${CLAUDE_PLUGIN_DATA}/hooks/state.json`. For a local `--plugin-dir` install, that resolves to something like:

```bash
~/.claude/plugin-data/local/ido4dev/hooks/state.json
```

(Exact path may vary — once you've launched the plugin once, find it via:
```bash
find ~/.claude -name state.json 2>/dev/null | grep ido4dev
```
)

---

## Scenario 1 — SessionStart banner + SessionEnd state persistence

**Tests:** state.json round-trips across session boundaries; SessionStart banner reads persisted state.

**Duration:** ~5 min.

### Steps

1. **Clean slate:** remove any prior state so we can observe banner on a seeded session.
   ```bash
   rm -f ~/.claude/plugin-data/local/ido4dev/hooks/state.json  # adjust path after locating
   ```

2. **Launch session A:**
   ```bash
   cd ~/dev-projects/ido4dev-live-test
   claude --plugin-dir ~/dev-projects/ido4dev
   ```
   Expected at session start: no banner (state.json doesn't exist yet).

3. **Do a trivial interaction** — e.g., type "Hi" and get a response. This runs through a full turn, giving the hook layer some exercise.

4. **Close the session** (`/exit` or Ctrl+D). SessionEnd fires; state.json is created.

5. **Inspect state.json:**
   ```bash
   cat ~/.claude/plugin-data/local/ido4dev/hooks/state.json | python3 -m json.tool
   ```
   Expected fields: `version: 1`, `ended_at: <ISO>`, `last_compliance: null`, `last_rule_fires: {}`, `open_findings: []`, `updated_at: <ISO>`.

6. **Seed state with a meaningful baseline** so the next session shows a banner:
   ```bash
   python3 -c "
   import json, pathlib
   p = pathlib.Path.home() / '.claude' / 'plugin-data' / 'local' / 'ido4dev' / 'hooks' / 'state.json'
   s = json.loads(p.read_text())
   s['last_compliance'] = {'grade': 'B', 'score': 82, 'categories': {}, 'timestamp_iso': '2026-04-24T12:00:00Z'}
   s['open_findings'] = []
   p.write_text(json.dumps(s, indent=2) + '\n')
   print('seeded')
   "
   ```

7. **Launch session B** (same command as step 2). First system message should include a banner like:
   ```
   [ido4dev] Resuming — last compliance: B, prior session ended <N>h ago
   ```

### Capture

- Paste step-5 state.json contents into the report.
- Paste the session-B banner line verbatim.

### Pass criteria

- Step 5: state.json exists with all five required fields after SessionEnd.
- Step 7: banner appears at session start referencing last compliance + prior session timing.

---

## Scenario 2 — `validate_transition` BRE block → VT001

**Tests:** PostToolUse rule on `validate_transition` fires with templated finding when `canProceed === false`.

**Duration:** ~10 min.

### Prerequisite

Synthetic state from Option A (sandbox skill) or Option B (real project). You need a task that exists AND is in a state that won't pass an approve transition (e.g., task in `IN_PROGRESS` — approve requires `IN_REVIEW`).

### Steps

1. **In the session from Scenario 1 (or a fresh one in the same test dir):** ensure sandbox/project state is seeded.

2. **Identify a task number to target.** If using sandbox, list tasks via `/mcp__plugin_ido4dev_ido4__board` or similar. Pick one in a non-review state. Call it `N`.

3. **Invoke `validate_transition` for an approve that will fail.** In the chat, ask Claude:
   > Call `validate_transition` with `issueNumber: N` and `transition: "approve"`. I expect this to fail because the task is not in IN_REVIEW.

   Claude will execute the MCP tool call. The tool returns `canProceed: false`.

4. **Observe the PostToolUse hook fire.** You should see in the next-turn context (possibly surfaced as a system reminder or visible prose) a block like:
   ```
   **BRE blocked: approve on #N**

   <reason>

   Failed/warned steps:
   - [error] <stepName>: <message>

   Review suggestions[] in the response, or run /mcp__plugin_ido4dev_ido4__compliance for broader governance context.
   ```

### Capture

- The exact `validate_transition` tool call Claude made (arguments).
- The tool's response (paste the JSON).
- The additionalContext / finding text that surfaced.

### Pass criteria

- VT001 finding text appears in conversation context with correct templating (issue number, transition, reason, details).
- No HTML-escaping in the output (quotes render as `"` not `&quot;`) — regression-guard for the Stage 4 Mustache triple-brace fix.

### Known edge cases

- If the tool errors entirely (invalid issue number, MCP connection problem), the PostToolUse hook may not fire. Confirm the tool returned a structured response before investigating hook-side issues.

---

## Scenario 3 — Compliance grade drop → CS001 + governance-signal recommendation

**Tests:** stateful `post_evaluation.persist` baseline + stateful CS001 rule + advisory escalation wording.

**Duration:** ~10 min.

### Prerequisite

Same as Scenario 2 — synthetic state from sandbox OR real project where `compute_compliance_score` returns a real score.

### Steps

1. **Seed the baseline manually** so CS001 has something to diff against. Close any active session first.

   ```bash
   python3 -c "
   import json, pathlib
   p = pathlib.Path.home() / '.claude' / 'plugin-data' / 'local' / 'ido4dev' / 'hooks' / 'state.json'
   s = json.loads(p.read_text()) if p.exists() else {'version': 1, 'last_rule_fires': {}, 'open_findings': []}
   s['last_compliance'] = {
     'grade': 'A',
     'score': 95,
     'categories': {
       'brePassRate':        {'score': 97, 'weight': 0.3,  'contribution': 29.1, 'detail': ''},
       'qualityGates':       {'score': 93, 'weight': 0.2,  'contribution': 18.6, 'detail': ''},
       'processAdherence':   {'score': 95, 'weight': 0.2,  'contribution': 19.0, 'detail': ''},
       'containerIntegrity': {'score': 96, 'weight': 0.15, 'contribution': 14.4, 'detail': ''},
       'flowEfficiency':     {'score': 94, 'weight': 0.15, 'contribution': 14.1, 'detail': ''}
     },
     'summary': 'Seeded baseline for smoke test',
     'timestamp_iso': '2026-04-24T12:00:00Z'
   }
   s['version'] = 1
   p.write_text(json.dumps(s, indent=2) + '\n')
   print('seeded A baseline')
   "
   ```

2. **Launch a session** in the test dir.

3. **Invoke `compute_compliance_score`.** Ask Claude:
   > Call `compute_compliance_score` on this project.

4. **Observe CS001 firing.** If the tool's returned grade is worse than `A` (very likely in any real sandbox/project), CS001 fires. You should see in next-turn context:
   ```
   **Compliance grade dropped: A → <X>**

   Previous measurement: grade A (score 95)
   Current measurement:  grade <X> (score <Y>)

   <summary>

   Review categories below and address the weakest before it compounds. A project-manager agent review is recommended.

   ---

   **Governance signal — recommend invoking `/agents project-manager`** to review finding `CS001_grade_drop` with full governance context.
   ```

   If the real grade happens to be `A` (tied), the rule won't fire. Seed an even higher baseline (impossible — `A` is the top) isn't an option; instead, inspect state.json after the call — `last_compliance` should be overwritten with the new measurement (post_evaluation.persist working).

5. **Inspect state afterward:**
   ```bash
   cat ~/.claude/plugin-data/local/ido4dev/hooks/state.json | python3 -m json.tool | head -30
   ```

### Capture

- The `compute_compliance_score` tool response (grade + summary).
- The CS001 finding text verbatim.
- Confirmation that the `**Governance signal — recommend invoking /agents project-manager**` line appears.
- The post-call state.json (showing the baseline has advanced to the new measurement).

### Pass criteria

- CS001 finding appears with correct before/after grade rendering.
- Governance-signal recommendation line matches the exact Stage 7 wording.
- `state.json.last_compliance.grade` updated to the new measurement (shows `post_evaluation.persist` wrote through).

---

## Scenario 4 — PreToolUse G1 gate on `skipValidation: true`

**Tests:** PreToolUse runner emits `permissionDecision: "ask"`; Claude Code surfaces confirmation UI.

**Duration:** ~5-10 min.

### Prerequisite

None special — G1 fires PreToolUse *before* the tool runs, so the task doesn't need to be in a specific state. Any task number works (even a fake one — the gate fires before MCP validates the argument).

### Steps

1. **In any active session** (test-dir session from earlier is fine):

2. **Ask Claude to invoke a transition tool with `skipValidation: true`.** Pick any transition tool. `approve_task` is fine.
   > Call `approve_task` with `issueNumber: 1` and `skipValidation: true`. Just exercising the hook — I'm expecting the session to prompt.

3. **Observe the confirmation UI.** Claude Code should surface a permission prompt BEFORE the tool runs. The rule emits `permissionDecisionReason` with:
   ```
   **Bypassing BRE validation for mcp__plugin_ido4dev_ido4__approve_task**

   `skipValidation: true` will skip the entire BRE pipeline (state gates, dependency gates, epic integrity, quality gates, and all methodology-specific steps).

   This is not per-step — it is all-or-nothing. There is no audit differentiation between skipValidation-on-purpose and skipValidation-by-mistake.

   Confirm you have a specific, recorded reason for bypassing governance. ...
   ```

4. **Deny or cancel the tool call** — we're testing the gate, not actually bypassing BRE.

### Capture

- The exact prompt text Claude Code shows (or what Claude reports it received — depending on where the confirmation UI surfaces in your setup).
- Any Claude-side reasoning about whether to proceed or not (gives you a sense of how the permissionDecisionReason reaches it).

### Pass criteria

- Permission prompt appears BEFORE the tool would run (confirmed by cancellation preventing the actual transition).
- Prompt text includes the G1 reasoning body from `pre-transition.rules.yaml`.

---

## After all 4 scenarios — write the report

Draft `reports/e2e-005-phase-3-smoke.md` (I'll co-author with you in a follow-up session). Structure modeled on `reports/e2e-004-phase-2-smoke.md`:

```markdown
# Phase 3 Closing Smoke Test — <date>

## Test Setup
- Session location, plugin version, methodology profile, state-seeding approach.

## Scenarios Run

### Scenario 1 — SessionStart banner + SessionEnd persistence
<observations + verdict>

### Scenario 2 — validate_transition VT001
<observations + verdict>

### Scenario 3 — compute_compliance_score CS001 + governance-signal
<observations + verdict>

### Scenario 4 — PreToolUse G1 skipValidation
<observations + verdict>

## Observations (OBS-01..N)
<any deviations or surprises, per the E2E testing protocol in CLAUDE.md>

## Positives
<what worked cleanly>

## Verdict
Phase 3 substrate verified / substrate verified with <N> observations for follow-up.

## Next Steps
<any fixes to land before Phase 4 begins, or confirmation that Phase 4 can start>
```

---

## What is NOT covered by this smoke test (documented in report)

These paths are verified by unit + integration tests only (80 + 70 cases, all passing):

- VT002 (passed-with-warnings), VT003 (approved-with-suggestions)
- CS002 category threshold crossing
- CH001 cascade unblock (needs `complete_and_handoff` full flow)
- CH002 strong-next-task recommendation
- AT001 integrity violation (needs epic-split condition)
- G3 approve-at-grade-D-or-F (covered structurally by G1)
- G5 re-assignment (needs prior state.last_assignments entry)

Surfacing 4 representative paths is the Phase 3 brief's scoping. Integration tests verify the remaining coverage.

---

## Environment quirks to be aware of

- **`${CLAUDE_PLUGIN_DATA}` path:** varies by installation method. For local `--plugin-dir`, typically under `~/.claude/plugin-data/local/<plugin-name>/`. Confirm via `find` after first launch.
- **Profile file format:** current live-test dir has `{"id":"hydro"}` which doesn't match the runner's expected `{"methodology":"hydro"}` or `{"profile":"hydro"}`. Runner defaults to null profile — rules still fire, but `profile_values` aren't loaded. For the smoke test this is fine; for long-term use, consider fixing the file.
- **Post-compaction behavior:** not tested — Stage 6 was skipped; memory-architecture investigation tracks the broader question.
- **Graceful degradation:** not fault-injected — unit-tested only. The runner's "node absent → exit 0 via `|| true`" pattern in hooks.json commands is the production failsafe.

---

## Co-authoring the report

After you've run the scenarios, paste the captures + observations into a fresh Claude Code session or this one, and I'll turn them into `reports/e2e-005-phase-3-smoke.md` in the project's report style. The Phase 2 report (`e2e-004-phase-2-smoke.md`) is the template.
