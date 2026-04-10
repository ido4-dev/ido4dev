# E2E Test Report: e2e-002-ido4shape-cloud

**Skill tested:** `/ido4dev:decompose`
**Project:** ido4shape-enterprise-cloud (greenfield-with-context)
**Date:** 2026-04-09 (test run) / 2026-04-10 (report, post-recovery from lost monitor session)
**Status:** Pipeline ran to end of Stage 3a. Frozen at "PASS WITH WARNINGS" prompt awaiting user decision on E1 (task ID format). Test terminal is still live and untouched since the session ended.
**Baseline:** e2e-001-ido4shape-cloud.md (calibration run, 21 observations)

---

## Test Setup

- **Test session:** `/Users/bogdanionutcoman/dev-projects/ido4shape-cloud/` with ido4dev plugin loaded (inline from working tree at `/Users/bogdanionutcoman/dev-projects/ido4dev/` — uncommitted round-1 fixes were in effect during this run)
- **Monitor session:** Originally opened in `/Users/bogdanionutcoman/dev-projects/ido4dev/`, accidentally killed mid-test. Recovered by pasting the full test-terminal transcript into a new monitor session.
- **Strategic spec:** `ido4shape-enterprise-cloud-spec.md` (same spec as round 1)
- **Plugin state at time of test:** `skills/decompose/SKILL.md`, `agents/code-analyzer.md`, `agents/technical-spec-writer.md`, `agents/spec-reviewer.md` all had the round-1 fixes applied (uncommitted).

---

## Pipeline Summary

| Stage | Status | Notes |
|-------|--------|-------|
| Stage 0: Parse Strategic Spec | Skipped in part | No path asked from user — skill searched for spec itself (OBS-01). No evidence `parse_strategic_spec` MCP tool was called (OBS-02). Stage 0 summary to user was incomplete (OBS-06). |
| Stage 0.5: Detect Project Mode | Partial | Mode described informally as "greenfield project with related repos" — did not name the `greenfield-with-context` taxonomy from `SKILL.md:47-60` (OBS-05). |
| Stage 1: Analyze Codebase | Complete | code-analyzer agent spawned, 63 tool uses, 15m 24s, canvas **1723 lines** (vs. 333 in round 1 — major improvement). 25 `## Capability:` sections present. **No review checkpoint offered before Stage 2** (OBS-07). |
| Stage 2: Write Technical Spec | Complete | technical-spec-writer agent spawned, 22 tool uses, 9m 5s, spec **701 lines**, 26 capabilities (1 technical `PLAT-01` + 25 strategic), 36 tasks. **No review checkpoint offered before Stage 3** (OBS-08). |
| Stage 3a: Structural Review | Complete | spec-reviewer agent spawned, 31 tool uses, 3m 36s. Verdict: **PASS WITH WARNINGS**. 1 error (E1, task ID format), 4 warnings, 5 suggestions. |
| Stage 3b: Dry-run Ingestion | Not run | Would fail — 36 tasks have letter-suffix refs that the real parser rejects (OBS-10). |
| Stage 4: Ingest | Not started | Test session frozen at Stage 3a handoff prompt. |

**Artifact paths (written to project root, not `specs/` — see OBS-04):**
- `/Users/bogdanionutcoman/dev-projects/ido4shape-cloud/ido4shape-enterprise-cloud-canvas.md` (1723 lines)
- `/Users/bogdanionutcoman/dev-projects/ido4shape-cloud/ido4shape-enterprise-cloud-technical.md` (701 lines)

---

## Observations

### OBS-01 — Governance Violation — Critical

- **When:** Skill startup, before Stage 0. `/ido4dev:decompose` was invoked with no `$ARGUMENTS`.
- **What happened:** *"I'll start the decomposition pipeline. First, let me find the strategic spec and understand the project state."* → `Searched for 2 patterns, read 2 files`.
- **What was expected:** `skills/decompose/SKILL.md:10-14` — *"Behavioral Guardrail — Do NOT Auto-Resolve User Decisions... missing file paths (ask, don't search)"* — AND `SKILL.md:34` — *"If no path is provided, ask the user for the path and WAIT for their response. Do NOT search for spec files yourself."*
- **Evidence:** Opening line of the transcript.
- **Repeat offender:** Same class of violation as round-1 OBS-01 (e2e-001). The round-1 fix was to add the explicit WAIT/Do-NOT-search guardrail — it is in the file but was ignored at runtime.
- **Fix candidate:** `skills/decompose/SKILL.md:25-34`. Prose-only guardrails aren't enough. Options: (a) move the guardrail into Stage 0's first bullet as a hard precondition; (b) add a failure-mode example showing what "auto-searching" looks like so the model can recognize and stop; (c) structural — make Stage 0 the **only** step that can proceed without `$ARGUMENTS`, and have it return control to the user unconditionally when empty.

### OBS-02 — Governance Violation — High

- **When:** Stage 0.
- **What happened:** Transcript reports *"I've read the complete strategic spec"* and lists "read 2 files" but shows no `parse_strategic_spec` MCP tool call in the tool-use line. The skill went straight from reading files to summarizing capability counts.
- **What was expected:** `SKILL.md:27-32` — *"Call `parse_strategic_spec` with the file contents. Review the result: If there are **errors**, stop... If there are **warnings**, report them..."* The MCP parser is the only source of structured group/capability/dependency data — without it, the skill cannot honestly report "5 groups, 25 capabilities."
- **Evidence:** No `mcp__plugin_ido4dev_ido4__parse_strategic_spec` line appears between `Read 2 files` and the "strategic spec is complete (5 groups, 25 capabilities)" summary.
- **Caveat:** The claim "5 groups, 25 capabilities" is accurate for this spec, but the skill likely derived it by eyeballing the markdown rather than parsing it — which means errors and warnings would have been silently skipped.
- **Fix candidate:** `SKILL.md:25-34`. Make Stage 0 an explicit tool-use checklist: *"You MUST call `parse_strategic_spec` before reporting anything about the spec's contents. Reading the file with `Read` is not sufficient — the parser enforces structural rules that visual inspection misses."*

### OBS-03 — Behavioral Drift — Medium

- **When:** Start of Stage 1.
- **What happened:** *"Let me run the two-stage decomposition pipeline. Stage 1: Code Analyzer... Stage 2: Technical Spec Writer..."* — then three agents were actually invoked (code-analyzer, technical-spec-writer, spec-reviewer).
- **What was expected:** `SKILL.md` defines Stages 0, 0.5, 1, 2, 3a, 3b, 4. Three agent stages (1, 2, 3a) at minimum.
- **Evidence:** Transcript lines 7-8.
- **Fix candidate:** Cosmetic but indicative — Claude summarized incorrectly because Stages 0, 0.5, 3a, 3b, 4 aren't labeled prominently in the skill. Consider a "Pipeline Overview" table at the top of `SKILL.md` that enumerates all stages with one-line descriptions, so the orchestrator has something to read back to the user accurately.

### OBS-04 — Governance Violation — Medium (repeat from round 1)

- **When:** Stage 1 (canvas write) and Stage 2 (technical spec write).
- **What happened:** Artifacts written to project root:
  - `/Users/bogdanionutcoman/dev-projects/ido4shape-cloud/ido4shape-enterprise-cloud-canvas.md`
  - `/Users/bogdanionutcoman/dev-projects/ido4shape-cloud/ido4shape-enterprise-cloud-technical.md`
- **What was expected:** `SKILL.md:36-44` — *"Check if `specs/` exists in the project root. If not, check `docs/specs/` or `docs/`. If none exist, create `specs/`. All pipeline artifacts (canvas, technical spec) go in this directory."*
- **Evidence:** Bash `ls -la` confirms both files at project root, no `specs/` directory exists.
- **Repeat offender:** Round 1 OBS-08 flagged this exact issue. The fix added the artifact directory convention to `SKILL.md` — but it's buried inside Stage 0 (lines 36-44) and never referenced again in Stage 1 or Stage 2 output instructions (`SKILL.md:69`, `SKILL.md:92`). The Stage 1/2 instructions say "`[artifact-dir]/[spec-name]-canvas.md`" but `[artifact-dir]` is a variable set in Stage 0 and never bound to anything because Stage 0 itself was partially skipped.
- **Fix candidate:** Move "determine artifact directory" to its own bullet at the start of Stage 1 (where it's actually needed), not buried at the end of Stage 0. Add a runtime assertion: "Before spawning code-analyzer, state the artifact directory explicitly to the user: `Artifacts will be written to {dir}/`."

### OBS-05 — Behavioral Drift — Medium

- **When:** Stage 0.5 (project mode detection).
- **What happened:** *"This is a greenfield project with no codebase yet, but there are related repos to analyze for integration context."*
- **What was expected:** `SKILL.md:59` — *"Report the detected mode to the user: 'Detected mode: [mode]. [brief explanation].'"* — using the defined taxonomy: `existing`, `greenfield-with-context`, or `greenfield-standalone`.
- **Evidence:** Transcript line 6. Claude described the mode in natural language without using the taxonomy label.
- **Impact:** Low operational impact — the code-analyzer still did the right work (15m 24s, 63 tool uses, massive canvas), suggesting the correct mode was passed to the agent somehow. But this matters for two reasons: (a) auditability — without the named mode in the orchestrator output, a user can't quickly verify the agent got the right instructions; (b) the `code-analyzer.md:188-227` Mode-Specific Instructions are keyed on exact mode names, so informal phrasing risks the agent falling back to defaults.
- **Fix candidate:** `SKILL.md:59` — strengthen from "Report the detected mode" to "State explicitly: `Detected mode: greenfield-with-context` (or one of the other two values). Then one sentence of explanation."

### OBS-06 — Quality Issue — Low/Medium

- **When:** Stage 0 summary.
- **What happened:** Only reported *"5 groups, 25 capabilities"*.
- **What was expected:** `SKILL.md:32` — *"Summarize to the user: project name, number of capabilities (grouped by ido4shape groups), dependency structure, group priorities."* Four fields expected, one field delivered.
- **Evidence:** Transcript line 6.
- **Fix candidate:** This is downstream of OBS-02 (parser skipped) — without the parser result, Claude couldn't report group-priority breakdown or dependency structure because it didn't compute them. Fixing OBS-02 likely fixes this too.

### OBS-07 — Governance Violation — Critical (repeat pattern from round 1)

- **When:** End of Stage 1.
- **What happened:** *"Stage 1 complete — technical canvas written. Let me verify it and then run Stage 2."* → Claude read the canvas itself → *"Canvas looks solid. Let me now run Stage 2 — the technical spec writer."* → Stage 2 invoked immediately.
- **What was expected:** `SKILL.md:83` — *"**Review checkpoint:** 'The technical canvas is ready. Would you like to review it before I proceed to Stage 2, or should I continue?' WAIT for the user's response."*
- **Evidence:** Transcript section between Stage 1 and Stage 2 — no user turn visible.
- **Repeat offender — in a different form:** Round 1 memory records "Co-creation approach: Review at every stage, never auto-resolve user decisions" as a feedback rule, and the round-1 fix plan explicitly called for "Add review checkpoints at every stage boundary." The checkpoint text IS in `SKILL.md:83` — it was ignored.
- **Severity:** Critical because this directly defeats the round-1 fix and bypasses the co-creation principle you've set as a feedback rule. Also because once the pipeline auto-proceeds, the user loses the chance to catch canvas-level issues before they propagate into 36 tasks.
- **Fix candidate:** `SKILL.md:83` — prose checkpoint isn't enforced. Options: (a) use a hard STOP directive with failure-mode phrasing: *"You MUST stop here. Do NOT proceed to Stage 2 until the user responds. If you are tempted to 'just verify the canvas yourself,' that is the failure mode this checkpoint exists to prevent."*; (b) make the checkpoint structural by splitting decompose into two skills (`decompose-canvas`, `decompose-tasks`) so the user has to explicitly re-invoke the next phase; (c) add an output-format contract: "Your final message in Stage 1 MUST end with the exact question: `Would you like to review the canvas before I proceed to Stage 2? (yes to review / no to continue)`".

### OBS-08 — Governance Violation — Critical (repeat pattern from round 1)

- **When:** End of Stage 2.
- **What happened:** *"Stage 2 complete. Now let me run the spec reviewer for quality validation before we consider this ready for ingestion."* → Stage 3a invoked immediately.
- **What was expected:** `SKILL.md:106` — *"**Review checkpoint:** 'The technical spec is ready for review. Would you like to review it before validation, or should I proceed to Stage 3?' WAIT for the user's response."*
- **Evidence:** Transcript section between Stage 2 and Stage 3 — no user turn visible.
- **Fix candidate:** Same as OBS-07. The two checkpoint failures are the same issue twice.

### OBS-09 — Behavioral Drift — Low

- **When:** End of Stage 3a.
- **What happened:** On PASS WITH WARNINGS verdict, Claude presented findings and ended with: *"Would you like me to: 1. Check the ingest_spec parser... 2. Renumber tasks... 3. Proceed with ingestion as-is and see if it parses?"*
- **What was expected:** `SKILL.md:129` — *"If **PASS WITH WARNINGS**: present warnings and ask 'Fix these warnings or proceed to ingestion preview?'"* The ingestion **preview** (Stage 3b = `ingest_spec` with `dryRun: true`) is a distinct concept from ingestion (Stage 4 = `dryRun: false`). Option 3 ("proceed with ingestion as-is") conflates them.
- **Evidence:** End of transcript.
- **Fix candidate:** This is a low-priority wording issue, but it matters because a user who selects "option 3" might believe they're doing a safe dry-run when they're actually triggering real issue creation. `SKILL.md:129` should specify the exact offer: *"Fix warnings first, or run ingestion preview (dry-run) to see what would happen?"* And the skill should never offer "proceed to real ingestion" from a PASS-WITH-WARNINGS state — that's Stage 4's job, after 3b confirms parsing works.

### OBS-10 — Design Bug — Critical (NEW — not seen in round 1)

- **When:** Technical spec writing (Stage 2 output) vs. Stage 3a review.
- **What happened:** The spec-writer produced 36 tasks with letter-suffix refs (`PLAT-01A`, `PLAT-01B`, `AUTH-01A`, `STOR-05A`, etc.). The spec-reviewer flagged all of them as E1: *"Task IDs use letter suffixes (AUTH-01A, STOR-05A) which may not match the ingest_spec parser's regex [A-Z]{2,5}-\d{2,3}."*
- **What was expected:** Internal consistency between the spec-writer's rules and the real parser.
- **Root cause — verified against the actual parser:**
  - `agents/technical-spec-writer.md:70-72` instructs: *"Strategic capability NCO-01 decomposes into tasks NCO-01A, NCO-01B, NCO-01C — the letter suffix shows this task traces back to strategic capability NCO-01."*
  - `agents/spec-reviewer.md:32` has the correct regex expectation: *"Task headings: `### PREFIX-NN: Title` where PREFIX is `[A-Z]{2,5}` and NN is `\d{2,3}`"* — no letter suffix.
  - `@ido4/core/dist/domains/ingestion/spec-parser.js:13` — the real parser: `const TASK_HEADING = /^### ([A-Z]{2,5}-\d{2,3}):\s*(.+)$/;` — letter suffix **not** allowed.
- **Impact:** Every technical spec this plugin produces is malformed by design. All 36 tasks in `ido4shape-enterprise-cloud-technical.md` would fail to parse if Stage 3b ran. This is also the likely root cause of round 1's Stage 3 blocker (memory records round 1 was blocked at Stage 3 with parse issues — same spec, same agents, same bug).
- **Silver lining:** The Stage 3a split from round 1's fixes IS working — it caught the malformed output **before** ingestion would have destroyed a batch of GitHub issues. In round 1, this would have failed at dry-run with no early warning. In round 2, the reviewer caught it as an error. The Stage 3a fix is validated by this test, even as it exposes a deeper bug.
- **Fix candidate (two options, decide):**
  - **(a) Fix the writer** — preferred. Edit `agents/technical-spec-writer.md:68-72` to drop letter suffixes. Decomposition becomes `NCO-01`, `NCO-02`, `NCO-03` (no suffix), and the writer disambiguates by numbering across the capability. Preserve traceability via a metadata line like `> traces: strategic NCO-01` or via the `depends_on` chain and task descriptions. Lower blast radius — only touches the writer and requires updating the example refs. **However:** this breaks the "ref prefix = capability prefix" assumption in `spec-reviewer.md:32`, because with no suffix, 25 strategic capabilities produce ref collisions when tasks from different capabilities share prefixes. Would need a new ref scheme.
  - **(b) Fix the parser** — accept an optional letter suffix in the regex: `/^### ([A-Z]{2,5}-\d{2,3}[A-Z]?):\s*(.+)$/`. Update `spec-reviewer.md:32` to match. Touches `@ido4/core`, which means a new `@ido4/mcp` release and a plugin bump. Higher blast radius but preserves the human-friendly traceability the writer was designed around.
- **Recommendation:** Option (b). The letter-suffix pattern is semantically valuable (you can read `AUTH-01A` and know it traces to `AUTH-01`), and changing the parser is a single-line regex edit. Option (a) requires rethinking the ref scheme, which risks introducing collisions and disrupting the writer's decomposition logic.

---

## Positives

Recording these explicitly per feedback rule — save from success, not just correction — and because several of them represent round-1 fixes that clearly landed.

- **Canvas context preservation — huge improvement.** 333 lines (round 1) → 1723 lines (round 2). All 25 strategic capabilities are now expressed as `## Capability:` sections in the canvas, with cross-cutting concerns, per-capability analysis, and dependency layers. The round-1 OBS about canvas being a flat summary has been addressed.
- **Technical spec is codebase-grounded.** The reviewer found real issues — schema drift (W1: `warning_sent_at`, `audit_events` referenced in tasks but not in `PLAT-01B`'s schema), 11-link critical path (W3), cross-group dependency surprise (AUTH-06A → STOR-05A in W3), undeclared parent dependency (W4: `PROJ-02A` needs `PROJ-01A`). These findings are only possible if the tasks actually reference real paths and schemas — otherwise the reviewer has nothing to cross-check. The writer is doing its job.
- **Stage 3a split is validated.** The round-1 fix to add a structural review before ingestion caught OBS-10's ingestion-blocking bug that would otherwise have blown up at dry-run with a confusing error. This is exactly what Stage 3a was designed to do.
- **Spec-reviewer produces actionable output.** Clear verdict, categorized findings (errors/warnings/suggestions), dependency graph analysis, governance notes (risk hotspots), and specific fix recommendations. The agent is working as designed.
- **Greenfield mode works at the agent level.** Even though the orchestrator didn't name the mode (OBS-05), the code-analyzer clearly received the right instructions: it analyzed integration targets (*"ido4shape, ido4-MCP, and ido4dev repos"*), spent 15m 24s on exploration, and produced a canvas sized for the greenfield-with-context template. The code-analyzer mode handling (`code-analyzer.md:188-227`) is alive and functional.
- **Agent isolation is working.** Each agent ran with its own tool budget (63 / 22 / 31 tool uses) and its own token budget (126.6k / 79.0k / 55.5k). The orchestrator's context is not bloated — Stage 1's exploration didn't pollute Stage 2's decomposition.

---

## Assessment

The key pattern from this round: **agent-level fixes from round 1 landed; orchestrator-level fixes did not.**

| Fix area | Round 1 finding | Round 2 behavior |
|----------|-----------------|------------------|
| Canvas as context layer | Flat, 333 lines, no per-capability depth | 1723 lines, full per-capability sections |
| Agents not wired in | Skill did everything inline | Three agents spawned correctly |
| Stage 3 structural validation | Missing, blocked at ingestion | Stage 3a runs, catches real issues |
| Greenfield mode | Not handled | code-analyzer produced greenfield-with-context canvas |
| Review checkpoints | Not enforced | Still not enforced (OBS-07, OBS-08) |
| Behavioral guardrail ("ask, don't search") | Violated | Still violated (OBS-01) |
| Parser call in Stage 0 | — | Skipped (OBS-02) |
| Artifact directory convention | Files at project root | Still at project root (OBS-04) |

**Interpretation:** The fixes that shaped what an agent produces — prompt templates, canvas structure, mode instructions, validation rules — all work. The fixes that shape what the orchestrator *does* — ask vs. search, stop vs. proceed, call MCP tool vs. eyeball the markdown — mostly don't work. Prose-level "MUST" / "WAIT" directives in `SKILL.md` are not holding against Claude's bias toward end-to-end completion.

This is a **structural problem**, not a prose problem. Writing "MUST WAIT" in more emphatic language won't fix it. Three structural options to consider:

1. **Make checkpoints unavoidable by splitting the skill.** `/ido4dev:decompose-canvas` (Stage 0 + 0.5 + 1), `/ido4dev:decompose-tasks` (Stage 2, takes canvas path as input), `/ido4dev:decompose-validate` (Stage 3a + 3b). User has to explicitly re-invoke the next phase — no opportunity to auto-proceed. Highest friction, lowest risk of skipped checkpoints.
2. **Enforce checkpoints via a hook.** A `PostToolUse` hook on the code-analyzer / technical-spec-writer agents that injects a user-decision prompt after the agent completes. Claude cannot bypass it because the hook runs outside Claude's control. Medium friction, high enforcement.
3. **Leave decompose as one skill but rewrite the checkpoint sections as failure-mode examples.** Instead of "WAIT for the user's response," show what the failure looks like: *"INCORRECT: 'Stage 1 complete. Let me verify it and proceed to Stage 2.' This is a skipped checkpoint. CORRECT: '✓ Canvas ready at {path}. Review it, then tell me to proceed or to revise.'"* Lowest friction, lowest enforcement — effectively betting that concrete negative examples work better than abstract directives. This has some precedent in prompt engineering but isn't reliable enough for governance-critical behavior.

**My recommendation:** Option 2 (hook-based enforcement) for the two review checkpoints. Hooks already exist in this plugin (`SessionStart` for MCP install, `PostToolUse` for governance signals per `CLAUDE.md`) — extending the `PostToolUse` hook to intercept agent completions for the decompose pipeline fits the existing architecture. Option 1 is cleaner from a UX standpoint but loses the pipeline continuity that makes `/ido4dev:decompose` feel like one workflow.

For OBS-01 and OBS-02 (Stage 0 violations), the fix is more local — make Stage 0 a hard precondition that cannot be skipped if `$ARGUMENTS` is empty or if `parse_strategic_spec` hasn't been called. Possibly a second skill-entry-time check: if `$ARGUMENTS` is empty, return a fixed string and exit before Claude gets control.

---

## Recommended Fix Order

1. **OBS-10 — parser/writer contradiction.** Blocks all ingestion. Choose option (a) or (b) from OBS-10 and apply. Option (b) recommended.
2. **OBS-07 / OBS-08 — review checkpoints.** Governance-critical. Apply structural enforcement (hook or skill split).
3. **OBS-01 — auto-search for spec.** Governance-critical. Apply Stage 0 precondition fix.
4. **OBS-02 — skipped parser call.** Correctness-critical. Add explicit MCP tool requirement to Stage 0.
5. **OBS-04 — artifact directory.** Repeat from round 1. Move directory-determination into Stage 1 where it's actually used; add explicit user-visible statement of the chosen directory.
6. **OBS-05 — mode taxonomy.** Tighten wording to require the exact mode name in the orchestrator output.
7. **OBS-06 — Stage 0 summary.** Downstream of OBS-02 — likely fixed by fixing OBS-02.
8. **OBS-03 — pipeline count.** Cosmetic. Add pipeline overview table.
9. **OBS-09 — Stage 3a wording.** Low priority. Tighten the offer language.

---

## Next Steps

1. **Decision point (from you):** fix the observations before resuming the frozen test terminal, or resume the test as-is and accept that OBS-10 will block Stage 3b?
2. **If fixing first:** the test terminal is a sunk cost — its pipeline is already poisoned by OBS-10 even if we fix the orchestrator behavior. Better to commit round-1 fixes as a checkpoint, apply round-2 fixes, and start a round-3 test fresh.
3. **If resuming first:** paste back into the test terminal: *"Stop. Don't renumber or ingest. I verified the parser at `@ido4/core/dist/domains/ingestion/spec-parser.js:13` — the regex is `^### ([A-Z]{2,5}-\d{2,3}):\s*(.+)$`, no letter suffix allowed. The letter-suffix ref scheme comes from `agents/technical-spec-writer.md:70-72`, so this is an agent-definition bug, not a spec formatting choice. I'm going to fix the plugin and restart this."* This at least cleanly exits the frozen session instead of having the test Claude choose option 2 and mask the bug.
4. **Before round 3:** commit round-2 fixes as a pinnable checkpoint, so round 3 has a known plugin SHA.

---

## Calibration Notes (for future rounds)

- **Canvas line count is now a reasonable health metric.** Below ~1000 lines for a 25-capability greenfield spec suggests the canvas is degrading back to summary form (round-1 failure mode).
- **Per-capability sections should exist 1:1 with strategic capabilities.** Run `grep -c '^## Capability:'` on the canvas — should match the strategic capability count (here: 25).
- **Task count vs. capability count.** Round 1: 36 tasks / 26 capabilities = 1.38 tasks/cap. Round 2: same. The writer is consistent — tasks/cap ratio is a decent sanity check for decomposition granularity.
- **Review checkpoints are binary.** Either the orchestrator asks and waits, or it doesn't. No partial credit. Watch for transitions like "Stage X complete. Let me [verb] it and run Stage Y" — that's the failure signature every time.
