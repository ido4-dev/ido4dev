# E2E-004: Phase 2 closing smoke test

**Date:** 2026-04-20
**Scope:** Phase 2 closure — focused behavioral verification of the new code paths introduced by Phase 2.2 + Stage 4. Not a full-vision E2E.
**Target skill:** `ido4dev:ingest-spec` (Stage 0b bundled-validator pre-check — the only Phase 2 addition with no prior behavioral coverage).
**Test directory:** `~/dev-projects/ido4shape-cloud/` (real ido4shape-cloud project with a production-scale technical spec).
**Result:** PASS (after a same-session fix pass).

---

## 1. Why a focused smoke test, not the originally-specified full E2E

The original plan (`phase-2-brief.md` §3 Stage 4 item 6) specified a ~45-minute end-to-end walk through `/ido4specs:create-spec → ... → /ido4dev:ingest-spec` plus ceremony prompt invocations. During smoke-test planning (2026-04-20) we reassessed: most of what the full E2E would verify was either already behaviorally confirmed in the 2026-04-17 live test (MCP ceremony prompts work, plugin-dir mode works, `/mcp__plugin_ido4dev_ido4__*` resolves correctly) or only meaningfully testable after Phases 3 + 4 land (deterministic hooks, autonomous PM activation). One genuinely new Phase 2 code path had no behavioral coverage: the Stage 0b pre-validation pathway introduced in commit `1b91148` and reordered in commit `c4270a3`.

Scoping the test to that single gap kept the closure at ~10 minutes (plus a ~5-minute fix+re-test cycle) while preserving the value of live verification — the class of issue that static tests miss (see the 2026-04-17 shell failure precedent). The full-vision E2E is deferred to post-Phase-4 as an `e2e-005` test.

---

## 2. Test setup

**Test session:**
- Terminal: separate from monitor (monitor session held ido4dev repo + git/gh state + doc editing)
- Directory: `~/dev-projects/ido4shape-cloud`
- Launch: `claude --plugin-dir ~/dev-projects/ido4dev` (local-dev mode — ido4dev is deliberately decatalogued from the marketplace per suite `design-decisions.md` DD-001)
- `GITHUB_TOKEN` exported from `gh auth token`
- ido4specs was not installed for this smoke test — the scope didn't exercise the authoring pipeline; the test spec was already produced in a prior session

**Target input:**
- `specs/ido4shape-enterprise-cloud-tech-spec.md` (71 KB, real production-scale technical spec)
- 27 capabilities, 36 tasks, 65 dependency edges, max dependency depth 9, 145 success conditions

**Project state:**
- Intentionally *no* `.ido4/project-info.json` — testing behavior when the spec is ready but the project isn't initialized. This matters because it's the scenario where the reordered Stage 0b design is most valuable (user should learn structural status AND init status in one round trip).

---

## 3. Run 1 — initial invocation

Command: `/ido4dev:ingest-spec specs/ido4shape-enterprise-cloud-tech-spec.md`

**Stage-by-stage behavior (observed):**

| Stage | Expected | Observed | Verdict |
|---|---|---|---|
| Skill activation | Permission prompt → approve → skill begins executing | Permission prompt → approve → skill reports "I've launched the ido4dev:ingest-spec skill. Awaiting the skill's instructions to proceed." | ✗ OBS-01 |
| Stage 0 (path) | Resolve spec path | Not reached — skill waiting | ✗ |
| Stage 0b (pre-check) | Not reached | Not reached | n/a |
| Stage 0 (init check) | Not reached | Not reached | n/a |

Needed a second message ("Proceed with the ingest-spec skill... Start with Stage 0, then Stage 0b, reporting each stage's outcome") to unblock execution.

After the nudge, Claude ran an initial diagnostic bash (`ls .ido4/project-info.json`, `echo "CLAUDE_PLUGIN_DATA=$CLAUDE_PLUGIN_DATA"`, `ls $CLAUDE_PLUGIN_DATA/tech-spec-validator.js`) — revealed:
- `CLAUDE_PLUGIN_DATA` was empty in the bash-tool context
- Bundle existed at `~/.claude/plugins/data/ido4dev-inline/tech-spec-validator.js` (SessionStart hook had copied it correctly — the env var not being set for Bash-tool invocations is a scoping issue, not a copy failure)

Claude then adaptively invoked the validator at the install path directly, Stage 0b completed successfully with `valid=true, 27 groups, 36 tasks, 0 errors`, and the skill stopped cleanly at the project-init check.

**Task-tracker state during Run 1:**
- `Stage 0: Resolve spec path`
- `Stage 1: Ingestion preview (dry-run)`
- `Stage 2: Ingest (on user approval)`

Three entries. Stage 0b was not represented even though it ran. (OBS-02.)

---

## 4. Observations (all resolved same-session)

### OBS-01 — Skill required a "proceed" nudge after invocation

- **Severity:** Medium (behavioral quirk blocking expected execution)
- **When:** Immediately after skill activation
- **What happened:** Skill loaded but Claude reported "Awaiting the skill's instructions to proceed" rather than executing Stage 0.
- **Expected:** Skill body is the instructions; activation alone should be sufficient.
- **Root cause:** The skill opening paragraph + three prose sections (Pipeline Context, Behavioral Guardrail, Communication) read as preamble/setup to the model. The first action-directive appeared only at Stage 0. Claude interpreted the preamble as framing waiting for a further user prompt.
- **Fix (commit 56b12ac):** Added an explicit "Execute immediately when invoked" directive immediately after the skill's opening paragraph, including an anti-pattern callout: "Do not report 'awaiting the skill's instructions' — the body below IS the instructions." Enumerates the two legitimate user-gate stops (Stage 1 preview approval, explicit skill STOPs) so the directive isn't over-literal.

### OBS-02 — Task-tracker template missing Stage 0b

- **Severity:** Low (cosmetic, but visibly wrong during a live demo — three stages tracked, four ran)
- **When:** Task-tracker setup at start of skill execution
- **What happened:** Skill's Communication section instructed Claude to create task entries for Stage 0 / Stage 1 / Stage 2. Stage 0b (added in commit 1b91148, reordered in c4270a3) was not listed.
- **Expected:** Four entries, one per stage, in execution order.
- **Root cause:** Stale text. When Stage 0b was added and then reordered, the Communication section's task-list template was never updated.
- **Fix (commit 56b12ac):** Added Stage 0b as the second entry in the template: *Stage 0: Resolve spec path*, *Stage 0b: Bundled-validator pre-check*, *Stage 1: Ingestion preview (dry-run)*, *Stage 2: Ingest (on user approval)*.

### OBS-03 — `${CLAUDE_PLUGIN_DATA}` empty in Claude's Bash-tool context

- **Severity:** Medium (architectural — skill contract doesn't literally resolve)
- **When:** When the skill's Stage 0b prose directed Claude to invoke `node "${CLAUDE_PLUGIN_DATA}/tech-spec-validator.js" <spec-path>`.
- **What happened:** Echo of `$CLAUDE_PLUGIN_DATA` inside the Bash tool context returned empty. Claude adaptively located the bundle at the real install path `~/.claude/plugins/data/ido4dev-inline/tech-spec-validator.js` (by way of the earlier diagnostic `ls`) and invoked it directly. Validator ran successfully.
- **Expected:** Env var propagates to Bash-tool invocations the same way it does to SessionStart hook invocations — consistent behavior per the documented contract.
- **Root cause (hypothesis):** Claude Code appears to set plugin-scoped env vars (`CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA`) for SessionStart hook subprocesses but not universally for Bash-tool calls made by the LLM. This may be a Claude Code implementation decision, a `--plugin-dir` local-dev mode quirk, or both. The SessionStart hook's copy worked (confirmed bundle present at the expected install path), so the var IS set for hook subprocesses; it just doesn't propagate to Bash-tool subprocesses the same way.
- **Fix (commit 56b12ac):** Stage 0b now documents a preferred-vs-fallback invocation. Preferred: `node "${CLAUDE_PLUGIN_DATA}/tech-spec-validator.js" <spec-path>` (correct when the var propagates). Fallback when the var is empty: `BUNDLE=$(ls ~/.claude/plugins/data/*/tech-spec-validator.js 2>/dev/null | head -1); node "$BUNDLE" <spec-path>`. The glob works for both local-dev (`ido4dev-inline`) and marketplace (`ido4dev`) install naming. Documented in the skill so the behavior isn't dependent on model-side adaptive intelligence.

---

## 5. Run 2 — re-test after fixes (commit 56b12ac pushed to origin/main)

Same command, same test directory, no restart of the Claude session required (plugin-dir reloads on invocation).

**Stage-by-stage behavior:**

| Stage | Expected | Observed | Verdict |
|---|---|---|---|
| Skill activation | Permission prompt → approve → skill begins executing | Permission prompt → approve → skill executed Stage 0 immediately | ✓ OBS-01 resolved |
| Task-tracker setup | 4 entries: Stage 0, Stage 0b, Stage 1, Stage 2 | Task-tracker showed 4 entries with Stage 0b as #2 | ✓ OBS-02 resolved |
| Stage 0 (path) | Resolve spec path | Spec path resolved, file confirmed present | ✓ |
| Stage 0b (pre-check) | Run bundled validator, report `valid=true/false`, proceed to init check regardless of project-init state | Fallback invocation used (`BUNDLE=$(ls …)` glob), validator ran, reported `valid: true, 27 capabilities, 36 tasks, 65 dependency edges, max depth 9, 145 success conditions, 0 errors, 0 warnings` | ✓ OBS-03 resolved; robust path taken |
| Stage 0 (init check) | Report "project not initialized" with remediation, STOP | Reported exactly that; honored the "methodology choice is user decision" guardrail; stopped before Stage 1 | ✓ |

Task-tracker state at end of Run 2:
- ✔ `Stage 0: Resolve spec path`
- ✔ `Stage 0b: Bundled-validator pre-check`
- ◻ `Stage 1: Ingestion preview (dry-run)` (not reached — expected)
- ◻ `Stage 2: Ingest (on user approval)` (not reached — expected)

All three observations from Run 1 resolved. No new observations in Run 2.

---

## 6. Positives worth naming

- **SessionStart hook bundle copy works.** Confirmed from the install-path presence at `~/.claude/plugins/data/ido4dev-inline/tech-spec-validator.js`. The hook's `|| true` defensive pattern doesn't mask a silent failure — the copy genuinely ran.
- **Bundle parses production-scale specs cleanly.** The 71KB spec exercised more of the validator's code paths than the 5-task fixture would have. 27 capabilities, 36 tasks, 65 dep edges, max depth 9 — no warnings, no errors.
- **Version pinning works.** Validator banner reports parser v0.8.0, matching `dist/.tech-spec-format-format-version`.
- **Reordered Stage 0b delivers the designed UX.** In Run 2, a user with a valid spec in an uninitialized project learned both "structural validation passed" AND "project not initialized" in a single round trip — the outcome the reorder commit (`c4270a3`) was scoped to produce.
- **Guardrail honored.** Skill stopped at the project-init check without auto-initializing, per the "methodology choice is a user decision" constraint in the Behavioral Guardrail section. This matches the co-creation principle codified in session memory.
- **Adaptive recovery in Run 1 didn't require code changes to prevent re-occurrence.** The fallback path documented in Stage 0b (OBS-03 fix) ensures that future invocations hit a documented contract — not a model-dependent workaround. This is the right shape: behavior is deterministic and auditable; model intelligence isn't the load-bearing component.

---

## 7. Assessment

**Phase 2 closes: PASS.**

All Phase 2 code paths — plugin skill surface trimmed (11 → 6), ceremony duplicates routed to MCP namespace (`/mcp__plugin_ido4dev_ido4__*`), bundle pattern mirrored from ido4specs, Stage 0b pre-validation wired into `ingest-spec`, release-script `check_bundle` pre-flight, auto-update workflow + cross-repo dispatch — are architecturally in place and behaviorally verified where new code was introduced. Three UX gaps surfaced by Run 1 were diagnosed, fixed, and re-verified in the same session.

No behavioral failures. No regressions. `validate-plugin.sh` 60/60, `compatibility.mjs` 23/23, `audit-suite.sh` 43/0 STATUS: PASS.

The gaps that remain (`CLAUDE_PLUGIN_DATA` scoping semantics in Claude Code, potential future re-cataloguing of ido4dev) are scoped in `architecture-evolution-plan.md` §7 as open decisions; neither blocks Phase 2 closure.

---

## 8. Next steps

1. **Formally mark Phase 2 complete** in `architecture-evolution-plan.md` §11 status log, `CLAUDE.md` Active Work section, and `phase-2-brief.md` checklist + status log. (Same commit as this report.)
2. **Open `phase-3-brief.md` for WS2 (Hooks Rebuild).** Turn §8 WS2's scoping into concrete execution decisions — PostToolUse rewrite from `"type": "prompt"` to structured-data-driven templated handlers; PreToolUse gates on risky transitions; Stop hook for memory persistence; SessionStart fallback for graceful degradation when `npm install` fails; skill-scoped hooks per `prompt-strategy.md`. No code yet; brief first.
3. **Defer the full-vision E2E** to post-Phase-4. Tracked as `e2e-005` in planning, referenced from `phase-2-brief.md` §3 item 6.
4. **Open investigation — `CLAUDE_PLUGIN_DATA` scoping.** Low-priority follow-up: confirm via Claude Code docs or empirical test whether the env-var-unset-in-Bash-tool behavior is intentional, a `--plugin-dir` local-dev quirk, or a marketplace-install difference. Not blocking; the fallback pattern works regardless. Add as a note in the next monthly suite review rather than a dedicated workstream item.

---

## 9. Artifact provenance

- Initial commit with bundle infrastructure + Stage 0b introduction: `1b91148` (ido4dev main, 2026-04-20)
- Stage 0b reorder (moved before project-init check): `c4270a3`
- Three-observation fix commit: `56b12ac`
- This report: committed alongside Phase 2 formal-closure doc updates
- Paired design-record: `~/dev-projects/ido4-suite/docs/design-decisions.md` DD-001 (ido4dev decataloguing rationale, added this session)
