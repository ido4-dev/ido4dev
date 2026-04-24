# Sandbox UX + Transactional Integrity Findings

**Date:** 2026-04-25
**Discovered during:** Phase 3 closing smoke-test prep (runbook at `reports/e2e-005-phase-3-smoke-runbook.md`), while seeding synthetic state for scenarios 2 and 3
**Component:** `skills/sandbox` (plugin) + `create_sandbox` (MCP tool) + GitHub integration
**Tracking:** `architecture-evolution-plan.md §7.9`

This report documents six observations surfaced during Phase 3 Stage 9 preparation. The findings are genuinely orthogonal to Phase 3's goals (Phase 3 is the hook layer; sandbox is Phase 2 / existing surface), but the issues are significant enough to warrant their own fix initiative rather than being buried in the Phase 3 smoke-test report.

## Context

The smoke-test runbook needed real project state for scenarios 2 (`validate_transition` VT001) and 3 (`compute_compliance_score` CS001). We followed the runbook's Option A path: create a throwaway GitHub repo (`b-coman/ido4dev-smoke-test`), invoke `/ido4dev:sandbox` to seed synthetic scenario state, run the scenarios, delete the repo at the end.

The sandbox invocation failed twice — once due to an empty-repo issue (runbook gap, see OBS-05 in runbook), once due to detection state left by the first failure. During these attempts, the tool chain left substantial mutations in place despite reporting failure.

## Observations

### OBS-02: Sandbox skill does not auto-prompt for inputs on load

**Severity:** Papercut (UX friction, not a data-integrity issue)

**Repro:**
1. In a fresh Claude Code session, invoke `/ido4dev:sandbox`.
2. Skill reports loaded (`Successfully loaded skill · 3 tools allowed`).
3. Claude then says: *"I'm waiting for the skill's instructions to load so I can follow them. If you have a specific action in mind..."* — asking the user what to do.

**Expected:** per `skills/sandbox/SKILL.md` Phase 1 Step 1, the skill is supposed to *"ask for BOTH inputs in a single message"* (repository + methodology). The procedural instructions in the skill should execute on invocation.

**Actual:** Claude loaded the skill but did not execute its first instruction. The user had to manually prompt with the required inputs.

**Impact:** minor UX friction; users expect skills to prompt them, not the other way around. Over time, erodes trust in "skill invoked = skill running."

**Root-cause candidates:**
- Claude's skill-invocation interpretation may treat the loaded skill as "prose to reference when the user asks" rather than "procedure to execute now."
- The skill's language ("Phase Detection → Phase 1 Setup → Step 1: Ask for BOTH inputs...") is descriptive rather than imperative at the skill-entry point.
- Per `~/dev-projects/ido4-suite/docs/prompt-strategy.md`, skills written in principle-based prose are preferred, but that may be at odds with "kick off a procedural workflow immediately on load" semantics.

**Candidate fixes:**
- Add an explicit "On invocation, immediately execute Phase Detection and take the corresponding first action" instruction at the top of the skill.
- Or make the skill self-prompting by structuring the SKILL.md with an unambiguous first action.

### OBS-03: Detection inconsistency between skill and MCP tool

**Severity:** Architectural (sign of skill/tool drift)

**Repro:**
1. In a dir where `.ido4/methodology-profile.json` exists but `.ido4/project-info.json` does not, invoke `/ido4dev:sandbox` with a valid repo + methodology.
2. The skill's Phase Detection logic (per `skills/sandbox/SKILL.md` lines 15-20) says: *"File doesn't exist → Phase 1 (Setup)"* — implying setup should proceed.
3. The MCP tool (`create_sandbox`) refuses with: *"The current directory already has a real ido4 project, so the sandbox can't be created here."*

**Expected:** the skill's documented detection logic and the MCP tool's actual detection should agree. Either both files gate setup, or neither.

**Actual:** the skill reads `.ido4/project-info.json` alone; the MCP tool appears to read any `.ido4/` artifact as "already initialized."

**Impact:** medium — users follow the skill's documented logic, are told they're in Phase 1 Setup, and then the tool rejects them. The error is recoverable (use a different dir) but the inconsistency erodes trust in the skill's documented behavior.

**Candidate fixes:**
- Align the MCP tool's detection with the skill's Phase Detection logic (either broaden the skill's check or narrow the tool's).
- Or make the skill read the MCP tool's detection and relay the actual check to the user upfront.

### OBS-04: `methodology-profile.json` mutated during a rejected operation

**Severity:** Papercut-to-architectural (boundary issue)

**Repro:**
1. Start with `{"methodology":"hydro"}` in `.ido4/methodology-profile.json`.
2. Invoke sandbox; it rejects (OBS-03).
3. Inspect the file: now reads `{"id":"hydro","extends":"hydro"}`.

**Expected:** a tool that rejects an operation should not mutate local state as a side effect.

**Actual:** the file was rewritten during the rejected call. The new format carries different semantics (`id` is not used by the rule-runner's `loadProfile()` which reads `methodology` or `profile`).

**Impact:** a rejected operation left the environment in a different state than it was before. This is a weak form of OBS-06 (full transactional-integrity issue) but specific to local profile state.

**Candidate fixes:**
- Tool-side: treat the profile-file write as part of the transactional boundary — if setup is going to fail/reject, don't write.
- Or: if the profile rewrite is intentional (perhaps normalizing to a canonical format), do it *before* the rejection check so the tool either proceeds with the new format or doesn't write at all.

### OBS-06: No transactional rollback of local state on sandbox creation failure

**Severity:** ARCHITECTURAL — real data-integrity issue

**Repro:**
1. Create a throwaway repo with no default branch (as we did).
2. Invoke sandbox with that repo as the target.
3. The MCP tool fails at the GitHub-layer check (no default branch error).
4. Inspect `.ido4/` — substantial local artifacts were created before the failure:
   - `agent-locks.json` (759 B)
   - `assistant-onboarding.md` (2142 B)
   - `audit-log.jsonl` (11176 B)
   - `git-workflow.json` (116 B)
   - `project-info.json` (2705 B — the "real project" marker)
   - `methodology-profile.json` (modified)

**Expected:** a failed sandbox creation should either (a) roll back the local state completely, or (b) not create any state until the GitHub-layer dependency is verified.

**Actual:** the tool creates local state up to the GitHub check, fails at the check, and leaves everything in place. The next invocation sees `project-info.json` and treats the dir as already-initialized (causing OBS-03).

**Impact:** HIGH — this is a trust and usability issue. A user's first failed sandbox creation leaves the directory in a state that blocks all retries. The only fix is manual cleanup (`rm -rf .ido4/`), which is non-obvious and destructive.

**Candidate fixes:**
- Tool-side transactional model: atomically commit all local + remote mutations, or none. (Non-trivial; GitHub mutations aren't natively transactional.)
- Pragmatic alternative: verify all external dependencies (default branch, auth, repo permissions) BEFORE writing any local state.
- Third option: write local state to a temp dir; on success, move into place; on failure, delete the temp dir.
- Minimum viable: if any step fails, delete any partial local artifacts and log what was attempted.

### OBS-07: No transactional rollback across GitHub + local state

**Severity:** ARCHITECTURAL — trust issue

**Repro:**
1. Continue from OBS-06's partially-failed state. Clean local state (`rm -rf .ido4/`).
2. Inspect the GitHub repo: **23 real issues exist** in the target repo — created during the first "failed" sandbox attempt, before the branch-detection check blocked local finalization.
3. Issues have no labels, no Project v2 assignment (the tool's labeling/project-setup step was downstream of the failure).

**Expected:** when sandbox creation fails mid-flight, any external mutations (GitHub issues) should be rolled back — or at minimum, the tool should report clearly: *"N issues were created on your repo; review and delete manually."*

**Actual:** the tool silently left 23 real GitHub issues on the target repo. Subsequent invocations would create duplicates. Worse: if this weren't a throwaway repo, these issues would pollute a real user's real repository permanently.

**Impact:** CRITICAL for user trust — a failed sandbox that silently leaves dozens of orphan issues on a user's repo is unacceptable in production. This could cause significant real-world harm to users' GitHub orgs.

**Candidate fixes:**
- Pre-flight all external dependencies before any mutations (same as OBS-06): check default branch, permissions, project-v2 API access upfront.
- If a mid-flight failure occurs, attempt best-effort cleanup (delete issues created in this invocation).
- At minimum, report loudly what was partially created so the user can clean up themselves.

### OBS-08: Partial sandbox state leaves the scenario non-functional for ido4 tools

**Severity:** Derivative of OBS-06/07 (symptom, not separate root cause)

**Repro:** after OBS-07's partial state, the 23 issues exist but:
- Have no labels (ido4 uses labels for status? or Project v2 fields? — the partial state gives zero status tracking either way)
- Not attached to a Project v2 board
- No local `project-info.json` to tie the repo to a sandbox identity

Consequence: `validate_transition` and `compute_compliance_score` against this partial state would return meaningless results or errors. The scenario is neither a working sandbox nor a clean slate.

**Impact:** whatever recovery we attempt has to account for both local + remote partial state. Cleaning one without the other is insufficient.

**Candidate fixes:** resolved by fixing OBS-06 + OBS-07.

## Severity triage summary

| OBS | Severity | Category | Priority |
|---|---|---|---|
| OBS-02 | Papercut | Skill UX | Low |
| OBS-03 | Architectural | Skill/tool drift | Medium |
| OBS-04 | Papercut-to-architectural | Tool boundary | Medium |
| OBS-06 | **Architectural — data integrity** | Transactional model | **High** |
| OBS-07 | **Architectural — user trust** | Transactional model | **High** |
| OBS-08 | Derivative of OBS-06/07 | — | Resolved with above |

## Proposed follow-up initiative

**Sandbox UX + Transactional Integrity Pass** — scope:

1. **OBS-02/03** — skill + tool alignment:
   - Rewrite `skills/sandbox/SKILL.md` to make Phase 1 entry imperative (auto-prompt on load)
   - Align skill Phase Detection with MCP tool's actual detection logic
2. **OBS-06/07** — transactional pre-flight:
   - Pre-flight all external dependencies (repo default branch, API permissions, project-v2 accessibility) before any local or remote mutations
   - If a late failure occurs, attempt best-effort rollback of GitHub issues created during the invocation
   - Local artifacts: write to a temp location, move into place on success, discard on failure
3. **OBS-04** — profile-file handling:
   - Remove profile-file mutation from rejected paths, or clarify intent
4. **Documentation**:
   - Update the smoke-test runbook with "initialize the throwaway repo with an initial commit before sandbox"
   - Update `skills/sandbox/SKILL.md` to document what the MCP tool actually does on failure

**Scope assessment:** 2-5 days of work depending on how aggressively we pursue transactional rollback (full rollback is significant; pre-flight + best-effort is lighter).

**Cross-cutting:** changes span `skills/sandbox/SKILL.md` (plugin) and `@ido4/mcp`'s `create_sandbox` handler + underlying services (engine).

**Sequencing:**
- Not blocking Phase 3 close.
- Candidate for a Phase 3.5-style cross-repo beat before Phase 4, OR folded into Phase 4's brief if the PM-agent work benefits from a reliable sandbox for its own E2E tests.

## Related documents

- `reports/e2e-005-phase-3-smoke-runbook.md` — the runbook this surfaced from
- `reports/e2e-005-phase-3-smoke.md` — the eventual Phase 3 smoke-test report (OBS-01 lives there, sandbox OBS-02+ live here)
- `architecture-evolution-plan.md §7.9` — standing open-decision tracker pointing at this document
- `skills/sandbox/SKILL.md` — the skill implementation
- `hook-and-rule-strategy.md` (suite) — suite-level standing reference for design-principle adjudication
