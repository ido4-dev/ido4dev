# Phase 2 Design Brief: WS1 Plugin Diet Execution

**Status:** Phase 2.2 complete (ceremony duplicates deleted, references swept to `/mcp__plugin_ido4dev_ido4__*`). Phase 2 Stage 4 (migration debt cleanup) is the remaining work.
**Created:** 2026-04-17 (original); rewritten 2026-04-17 after the Option A commit.
**Parent plan:** `~/dev-projects/ido4dev/docs/architecture-evolution-plan.md` §8 WS1.
**Sequencing authority:** parent plan §6 #15 + #17.

This brief captures the committed design and execution sequence for Phase 2. It replaces an earlier version designed around a shell-skill architecture that was built, live-tested, and abandoned; the shell-pattern history is preserved in the parent plan's §11 status log.

---

## 1. Goal (end-of-phase state)

- Plugin skill count reduced from 21 to 5 — stateful workflows only.
- 10 ceremony duplicate skills routed to `/mcp__plugin_ido4dev_ido4__<ceremony>` slash commands (no plugin shells).
- 3 soft-deprecated `sandbox-*` skills hard-removed.
- `spec-quality` moved to `ido4specs` (its natural home post-extraction).
- `spec-validate` deleted (duplicates the bundled `tech-spec-validator.js`).
- `pilot-test` re-branded as developer tooling.
- `tech-spec-validator.js` bundled into `ido4dev/dist/` for `ingest-spec` pre-validation.
- PM agent references updated (ceremony refs point at MCP prompts). **Identity refactor is WS3, not this phase.**
- No behavioral regression vs. pre-Phase-2 state for any ceremony users actually invoke.
- End-of-phase E2E smoke test passes against the new architecture.

---

## 2. Committed direction: MCP Prompts as ceremony surface

Ceremonies are invoked as `/mcp__plugin_ido4dev_ido4__<prompt>` slash commands, served directly by the MCP server. Plugin skills exist only for stateful workflows (`onboard`, `guided-demo`, `sandbox`, `sandbox-explore`, `ingest-spec`). One source of truth for ceremonies (`@ido4/mcp/src/prompts/`), one invocation path, one place to edit methodology-aware reasoning.

**Why this path and not the shell-skill pattern that preceded it:**

- **The premise that motivated shells was wrong.** MCP Prompts ARE slash-accessible in Claude Code as `/mcp__<server>__<prompt>`. Verified from Claude Code's own docs (`code.claude.com/docs/en/commands.md` — "MCP servers can expose prompts that appear as commands… `/mcp__<server>__<prompt>`… dynamically discovered from connected servers") and by the user's live invocation of `/mcp__plugin_ido4dev_ido4__health`, which rendered the correct Hydro health prompt and produced the right GREEN/YELLOW/RED output. The earlier `claude-code-guide` subagent finding that MCP Prompts were not slash-accessible was wrong.
- **Shells had a migration blocker.** Replacing an existing skill name with a bash-injection shell produced "no body content" in Claude Code, even after `/reload-plugins` and a full Claude Code restart. Not root-caused; likely a plugin-manifest caching layer. Workarounds (version-bump-and-reshape, rename to non-colliding names) add cost without solving the underlying question.
- **Verbose UX cost is deferred, not architected around.** `/mcp__plugin_ido4dev_ido4__standup` reads longer than `/ido4dev:standup`, but autocomplete reaches it in one tab. Per parent plan §6 #2 (no live users), the aesthetic cost is not load-bearing right now. If user feedback later requires a shorter alias, the right response is to ask Anthropic for an MCP-prompt alias mechanism, not to ship parallel infrastructure.
- **Cross-MCP-client reach strengthens.** Cursor, Cline (when MCP-prompt support lands), and any future MCP client get the ceremonies natively via `listPrompts` / `getPrompt`. No Claude-Code-only shell detour.
- **Future-proof.** If Anthropic ships a rename or alias mechanism for MCP prompts, migration is zero-cost — we're already on the native path.

See parent plan §6 #17 (committed decision, supersedes #14) and §11 status log (reasoning record).

---

## 3. Execution Sequence

### Phase 2.1 — Shell architecture proof (ABANDONED 2026-04-17)

Built and live-verified the Runtime Prompt Rendering pattern (bash-injection shells calling `ido4-render-prompt` in `@ido4/mcp`). During Stage 3 cascade the attempt to replace `/ido4dev:health` with a shell at the same name failed, and re-opening the design question exposed that MCP Prompts were already slash-accessible. Architecture reversed. All artifacts removed in Phase 2.2.

### Phase 2.2 — MCP Prompts as ceremony surface (COMPLETE 2026-04-17)

Three commits on `phase-2.1-proof`:

- **Commit A (`@ido4/mcp`)** — clean `git revert` of 660c618 (the `render-prompt-cli` feature). Removes `src/render-prompt.ts`, `src/render-prompt-cli.ts`, paired test files, bin entry, `prepare` script. Test suite back to 458/458 passing, zero regressions.
- **Commit B (`ido4dev`)** — delete the 3 shell skills (`review`, `execute-task`, `health`-as-shell), `tests/shell-skills-render.mjs`, `validate-plugin.sh` §K (Shell Skills Structure), `docs/mcp-runtime-contract.md` "CLI surfaces" section.
- **Commit C (`ido4dev`)** — delete 9 ceremony duplicates (`standup`, `board`, `compliance`, `plan-wave`/`sprint`/`cycle`, `retro-wave`/`sprint`/`cycle`) + 6 legacy `commands/*.md` wrappers; sweep ceremony references across `agents/project-manager/AGENT.md` (9 refs), `skills/onboard/`, `skills/guided-demo/`, `skills/ingest-spec/`, `skills/sandbox/`, `skills/pilot-test/`, `hooks/hooks.json` (LLM prompt text examples), `README.md`, `CLAUDE.md`. Every `/ido4dev:<ceremony>` or bare `/<ceremony>` became `/mcp__plugin_ido4dev_ido4__<ceremony>`. The PM agent's Hydro-hardcoded identity (5 Unbreakable Principles, wave state machine) was **not** touched — that's WS3 scope.

Each commit left the plugin in a working state (`validate-plugin.sh` 108/108 after B, 71/71 after C).

### Phase 2 Stage 4 — Migration debt cleanup (REMAINING)

Independent items; execution order within Stage 4 is flexible.

1. **Hard-remove 3 `sandbox-*` soft-deprecated skills** — `sandbox-hydro`, `sandbox-scrum`, `sandbox-shape-up`. Already replaced by `guided-demo` + methodology branching. Update `validate-plugin.sh` EXPECTED_SKILLS; verify nothing else references them.

2. **Move `spec-quality` to `ido4specs`** — authoring guidance belongs upstream in the authoring plugin. Coordinated commit pair (delete from ido4dev, add to ido4specs) + cross-reference updates in both repos.

3. **Delete `spec-validate`** — duplicates `tech-spec-validator.js` (bundled in ido4specs's `dist/`). The user flow remains: ido4specs validates during `/ido4specs:validate-spec`; ido4dev's `ingest-spec` pre-validates via the bundled binary (see item 5) before calling `ingest_spec`.

4. **Rebrand `pilot-test`** — developer integration test mixed into user skills. Either `disable-model-invocation: true` + `[dev-only]` description, or move to `tests/pilot-test.mjs` as non-skill tooling.

5. **Bundle `tech-spec-validator.js` into `ido4dev/dist/`** — mirror the ido4specs dual-bundle pattern. Adds fail-fast pre-validation to `ingest-spec` so parser version skew between ido4specs and ido4dev does not show up as a late-stage ingestion failure. Coordinates with interface contract #5.

6. **End-of-phase E2E smoke test** — fresh Claude Code session, install ido4specs + ido4dev from marketplace, walk `/ido4specs:create-spec → ... → /ido4dev:ingest-spec` against a real strategic spec. Plus one invocation each of `/mcp__plugin_ido4dev_ido4__standup`, `/mcp__plugin_ido4dev_ido4__plan`, `/mcp__plugin_ido4dev_ido4__retro` against the seeded sandbox. Verifies the MCP-namespace UX is real and the architecture holds end-to-end. Produces `reports/e2e-004-phase-2-completion.md`.

---

## 4. Verification

After each Stage 4 item:

1. `bash tests/validate-plugin.sh` — structural (frontmatter, EXPECTED_SKILLS, cross-refs, tool prefixes). 71/71 passing as of end-Phase-2.2.
2. `node tests/compatibility.mjs` — tool-surface check (criticalTools exist in installed `@ido4/mcp`). Unaffected by skill renames.
3. `node tests/round3-agent-artifact.mjs` + `node tests/enforcement-probes.mjs` — behavior-level defenses against the silent drift that `compatibility.mjs` cannot catch.
4. Post-Stage-4: live-session invocation of a ceremony (`/mcp__plugin_ido4dev_ido4__standup`) and a stateful workflow (`/ido4dev:ingest-spec`) to confirm user-visible UX.

---

## 5. Coordination Points

- **ido4specs repo** — `spec-quality` migration is a coordinated commit pair (Stage 4 item 2). Same owner across both repos so no cross-team sync needed.
- **ido4 engine repo** — no active coordination for remaining Stage 4 work. The `render-prompt-cli` revert already landed on `phase-2.1-proof`; no further engine-side changes are in this phase. See parent plan §8 intro warning before any future engine-side work.
- **`hooks/hooks.json`** — will be rebuilt in WS2 (Phase 3). For now, the Phase 2.2 sweep just updated the LLM prompt text examples inside the existing hooks; hook structure is unchanged.
- **PM agent identity (`AGENT.md`)** — Hydro-hardcoded 5 principles, state machine, and "wave-based governance expertise" description remain as-is. WS3 scope.
- **Tests:** `validate-plugin.sh` EXPECTED_SKILLS will shrink again when Stage 4 items 1 + 3 + 4 land. `round3-agent-artifact.mjs` and `enforcement-probes.mjs` are unaffected.

---

## 6. End-of-Phase Checklist

- [x] 10 ceremony duplicates deleted (standup/board/health/compliance/plan-wave|sprint|cycle/retro-wave|sprint|cycle)
- [x] PM agent references updated to methodology-neutral MCP names
- [x] `validate-plugin.sh` EXPECTED_SKILLS accurate
- [x] 3 sandbox-* soft-deprecated skills hard-removed (Stage 4 item 1, 2026-04-19)
- [ ] `spec-quality` moved to ido4specs (Stage 4 item 4)
- [x] `spec-validate` deleted (Stage 4 item 2, 2026-04-19)
- [x] `pilot-test` re-branded dev-only (Stage 4 item 3, 2026-04-19)
- [ ] `tech-spec-validator.js` bundled in ido4dev `dist/` (Stage 4 item 5)
- [ ] `ingest-spec` uses bundled validator for fail-fast pre-validation (Stage 4 item 5)
- [ ] E2E smoke test runs cleanly against the new architecture (Stage 4 item 6)
- [x] Architecture-evolution-plan §11 status log updated with Phase 2.2 completion
- [x] This brief updated to match committed direction

---

## 7. Status Log

| Date | Update |
|---|---|
| 2026-04-17 | Brief drafted (original version, shell-skill architecture). Blocked on §2 open investigation. |
| 2026-04-17 | §2 investigation resolved with the Runtime Prompt Rendering pattern; Phase 2.1 shell proof committed. |
| 2026-04-17 | Phase 2.1 live-verified end-to-end (review + execute-task shells against Hydro/Scrum/Shape Up fixtures). |
| 2026-04-17 | Stage 3 cascade #1 (`health` shell) blocked by Claude Code name-collision failure. Direction re-opened. |
| 2026-04-17 | Option A committed: MCP Prompts as ceremony surface, no plugin shells. Phase 2.2 landed in three paired commits. Brief rewritten in place against the new direction. Stage 4 remaining. |
| 2026-04-19 | Stage 4 items 1-3 landed on `main`: sandbox-hydro/scrum/shape-up hard-removed; spec-validate deleted; pilot-test rebranded dev-only (`disable-model-invocation: true`, description prefixed `[dev-only]`, legacy `commands/pilot-test.md` wrapper removed). Plugin skill count 11 → 7. Items 4 (spec-quality migration), 5 (tech-spec-validator bundle + ingest-spec pre-validation), 6 (E2E smoke test) remaining. |

This log updates as Stage 4 items complete.
