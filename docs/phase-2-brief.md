# Phase 2 Design Brief: WS1 Plugin Diet Execution

**Status:** Draft — design updated 2026-04-17 after extensive web research. Original shell-over-MCP-Prompt design was wrong (no protocol-level delegation exists). Replacement design — **Runtime Prompt Rendering via Bash Injection** — codified in §2. Ready to execute pending user sign-off on the revised design.
**Created:** 2026-04-17
**Parent plan:** `~/dev-projects/ido4dev/docs/architecture-evolution-plan.md` §8 WS1
**Sequencing authority:** parent plan §6 #15

This brief captures the design decisions and execution sequence for the Phase 2 plugin diet — turning 21 skills into ~8 skills, deleting duplicates, creating thin shells over MCP Prompts, and cleaning migration debt. The brief exists because "start Phase 2" is not a single code change — it's a coordinated sequence with real risk of broken in-between states, and needs thinking done up front.

---

## 1. Goal (end-of-phase state)

- Plugin skill count reduced from 21 to ~8
- 10 ceremony duplicate skills replaced by thin shells delegating to MCP Prompts
- 3 soft-deprecated sandbox-* skills hard-removed
- `spec-quality` moved to `ido4specs` (its natural home post-extraction)
- `spec-validate` deleted (duplicates the bundled `tech-spec-validator.js`)
- `pilot-test` re-branded as developer tooling (or moved out of user-facing skill surface)
- `tech-spec-validator.js` bundled into ido4dev's `dist/` for ingest-spec pre-validation
- PM agent's skill references updated to new names
- No behavioral regression vs. pre-Phase-2 state for ceremonies users actually invoke
- End-of-phase E2E smoke test passes against the new shell-based architecture

---

## 2. The #1 Open Investigation — RESOLVED 2026-04-17

**Question: How does a Claude Code plugin skill delegate to an MCP Prompt?**

**Answer: it doesn't. The pattern doesn't exist at the Claude Code protocol level.** Authoritative finding from the `claude-code-guide` subagent (2026-04-17, web search against current docs):

- No mechanism for a skill to invoke `listPrompts` / `getPrompt` on an MCP server programmatically
- No declarative delegation in skill frontmatter (no `delegates-to-mcp-prompt` field or similar)
- Claude Code does not expose MCP Prompts as `/mcp__<server>__<prompt>` slash commands (MCP Prompts appear in Claude Desktop's `+` menu, not in Claude Code CLI as slash commands today)
- No official Anthropic reference implementation of "plugin skill as shell over MCP Prompt" in `github.com/anthropics/skills` or `github.com/anthropics/*`

**Implication:** the core design of this brief — thin shells delegating to MCP Prompts — is not viable with current Claude Code. The options that remain are below; the Phase 2 design must be re-committed against one of them before execution resumes.

### Real options (one of these becomes the new design)

- **Option A — MCP-only.** Ceremony logic lives only in MCP Prompts. Drop the plugin ceremony skills entirely. Lose branded `/ido4dev:` UX for ceremonies (users can't easily invoke MCP Prompts in Claude Code today).
- **Option B — Build-Time Generator.** `PromptGenerators` in `@ido4/mcp/src/prompts/` become THE canonical source. A codegen step (CI or pre-release) produces BOTH (a) MCP prompt registrations and (b) plugin skill body files from the same generator functions. Single logical source, two rendered outputs, CI drift check. Preserves branded UX + cross-MCP-client portability.
- **Option C — Skill-only (no MCP Prompts for ceremonies).** Keep ceremony logic in plugin skills. Deprecate MCP Prompts. Lose cross-MCP-client portability and the methodology-native prompt generators. Simplest architecturally but throws away a genuinely good piece of the engine.

### Committed design: Runtime Prompt Rendering via Bash Injection

Extensive web research (2026-04-17, direct `code.claude.com` + industry survey) surfaced a genuinely elegant path that wasn't in the original three-option list. The authoritative findings:

- **Plugin skills ARE namespaced slash commands by default** per `code.claude.com/docs/en/plugins`: *"Plugin skills are always namespaced (like `/my-first-plugin:hello`) to prevent conflicts"*. `/ido4dev:standup` is the standard UX; no shell-wrapper delegation needed to get branded commands.
- **Skills support runtime bash injection as a first-class feature** per `code.claude.com/docs/en/skills`: *"The `` !`<command>` `` syntax runs shell commands before the skill content is sent to Claude. The command output replaces the placeholder."* Skills have access to `${CLAUDE_SKILL_DIR}` and `${CLAUDE_PLUGIN_DATA}` for referencing bundled assets.

This unlocks a single-source-of-truth pattern that doesn't need build-time codegen:

```markdown
---
name: standup
description: Governance-aware morning briefing — data-backed risk detection and leverage-point identification
---

!`node ${CLAUDE_PLUGIN_DATA}/node_modules/@ido4/mcp/dist/render-prompt.js standup`
```

**How it works:**

1. User invokes `/ido4dev:standup`
2. Claude Code loads the skill; the bash injection runs
3. Small Node script (shipped as part of `@ido4/mcp`) reads `.ido4/methodology-profile.json`, builds the PromptContext, calls the right methodology-specific generator (`HYDRO_GENERATORS.standup(ctx)` or Scrum or Shape Up), prints the rendered ceremony prompt text to stdout
4. Output replaces the placeholder; Claude sees the full profile-aware prompt and executes normally

**Properties:**

- **Branded UX:** `/ido4dev:standup` works natively (Anthropic's default pattern)
- **Single source of truth:** `PromptGenerators` functions remain THE canonical source
- **Profile-aware at invocation:** one skill file handles all three methodologies; the right prompt renders at the right time
- **No build-step sync, no CI drift check:** nothing to drift — the skill renders fresh from source on every invocation
- **Minimal skill files:** ~5 lines each, mostly frontmatter
- **Cross-MCP-client reach preserved:** MCP Prompts still register via `server.prompt()` — Cursor, Cline (when support lands), and other MCP clients still get them via their native invocation
- **Future-proof:** if Anthropic ships native skill→prompt delegation, migration is deleting the bash injection and replacing with the new declarative mechanism

**Cost:** Each skill invocation spawns a Node process (tiny overhead — milliseconds). The `render-prompt.js` entry point needs to be added to `@ido4/mcp`'s package (new CLI bin). Security-conscious users can disable bash injection via `disableSkillShellExecution` in settings, at which point the skill becomes a placeholder.

### Industry context (validation)

Cross-framework survey confirms the approach:

- **Branded plugin namespace UX is universal** — Cursor's `.cursor/commands/`, Cline's `.clinerules/`, Continue's slash commands all use plugin-scoped naming. No framework forces users into `/mcp__server__prompt`-style invocation for branded workflows.
- **Single source of truth with multi-target rendering is a validated pattern.** `zzgosh/agent-rules` (GitHub) syncs `AGENT_RULES.md` to Claude / Codex / Gemini / Kilo rule files via CI. MLflow Prompt Registry manages prompts with versioning + environment aliases. Precedent is solid.
- **MCP 2026 roadmap** (`blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/`) focuses on transport scalability, governance, enterprise readiness. No cross-client standard yet for skill→MCP-prompt delegation — our bash-injection approach avoids betting on something that doesn't exist. When it does exist, migration is mechanical.
- **Anthropic's documented reference pattern** for skills invoking external data (`codebase-visualizer` example in skills docs) uses exactly this bash-injection flow.

### Revised scope: what changes vs. the original brief

Most of §3-§10 below remains sound. The specific changes the revised design introduces:

1. Add a `render-prompt.js` CLI entry point to `@ido4/mcp` (small engine change — coordinate per §8 intro warning with methodology-runner roadmap, but this is additive, not a rename)
2. Each of the 8 shell skills is a 5-line markdown file with a single bash injection line
3. The "how delegation works" guidance in §3 (naming) and §4 (execution sequence) is now concrete — render via bash injection, not via a protocol mechanism that doesn't exist
4. The drift-prevention CI check becomes unnecessary (nothing to sync)
5. The eval-first plan in §5 still applies — verify each shell's rendered output matches the intended ceremony behavior

## 2b. Superseded — original investigation question

Kept for history. The original open question was:

## 2b. Superseded — original investigation question

Kept for history. The original open question was:

The shell architecture depends on this mechanism working cleanly. We haven't verified it. Possible patterns:

| Pattern | Description | Implication |
|---|---|---|
| **A — Instruction delegation** | Skill body instructs Claude to fetch and execute the MCP Prompt (e.g., "Retrieve the `standup` prompt from the `ido4` MCP server and follow its instructions") | Clean single-source-of-truth; skills are genuinely thin |
| **B — User redirect** | Skill body tells user to invoke `/mcp__ido4__<prompt>` instead | Not real delegation; defeats the purpose of branded shells |
| **C — Duplicated text** | Skill body contains the same text as the MCP prompt | Compromises single-source-of-truth; requires sync mechanism |
| **D — Protocol-level delegation** | Some Claude Code feature for skill-to-prompt handoff we haven't found | Ideal if it exists; need to check Claude Code docs |

**Resolution path** (either/or):
1. Read Claude Code's MCP + Skills documentation for prompt invocation semantics from skill context
2. Test-implement ONE shell (e.g., `/ido4dev:health`) and observe whether delegation actually works end-to-end in a fresh Claude Code session

**Decision gate:** if only Pattern C is viable, decide whether "duplicated with CI-enforced sync" is acceptable, or whether the shell abstraction needs a different design entirely. Do not start the rest of Phase 2 until this is resolved — we'd be building 7 more shells on an unverified foundation.

---

## 3. Naming Decision: methodology-neutral shells

The 8 shells are methodology-neutral names, mapped 1:1 to MCP PromptGenerators interface:

| MCP Prompt | Current plugin skills | New shell skill |
|---|---|---|
| `standup` | `standup` | `standup` |
| `plan-${container}` | `plan-wave`, `plan-sprint`, `plan-cycle` (3) | `plan` (1) |
| `board` | `board` | `board` |
| `compliance` | `compliance` | `compliance` |
| `health` | `health` | `health` |
| `retro` | `retro-wave`, `retro-sprint`, `retro-cycle` (3) | `retro` (1) |
| `review` | (none) | `review` (NEW) |
| `execute-task` | (none) | `execute-task` (NEW) |

**Why neutral names:** MCP Prompts are profile-driven — `plan-${container}` is dynamically named per the active profile. Plugin skills are static. `/ido4dev:plan` always works; the MCP Prompt layer detects the active methodology from `.ido4/methodology-profile.json` and returns the right ceremony reasoning.

**Cost:** users with muscle memory for `/ido4dev:plan-wave` relearn. Acceptable per parent plan §6 #2 (no live users) + cleaner UX (fewer commands, methodology-aware invisibly).

---

## 4. Execution Sequence

One skill at a time. Per-skill: add shell → verify → delete original → verify. Not parallel across ceremonies. The goal is: at every git commit, the plugin should be in a working state.

### Stage 0: Pre-execution gates
1. **Resolve §2 open investigation.** No execution until the delegation mechanism is verified.
2. Run `bash tests/validate-plugin.sh` → green (establishes current-baseline state)
3. Finalize per-skill eval scenarios (see §5)

### Stage 1: Low-risk deletions (no shell creation needed)
- Delete `skills/sandbox-hydro/`, `skills/sandbox-scrum/`, `skills/sandbox-shape-up/` (already soft-deprecated, replaced by `guided-demo`)
- Update `tests/validate-plugin.sh` EXPECTED_SKILLS to remove the three
- Run validate-plugin.sh → green
- Single commit

### Stage 2: Add NEW shells (no conflict with existing skills)
- `/ido4dev:review` — maps to MCP `review` prompt (no existing plugin skill)
- `/ido4dev:execute-task` — maps to MCP `execute-task` prompt (no existing plugin skill)
- Run evals (§5) on both in a fresh test session
- If delegation works → single commit

### Stage 3: Replace ceremonies, one at a time, in dependency order
Order chosen by: (a) skill's independence from other skills, (b) implementation complexity, (c) bugs that naturally get fixed during the swap.

| # | Skill | Why this order | Notes |
|---|---|---|---|
| 1 | `health` | Simplest, independent | Shell replaces existing same-name skill |
| 2 | `board` | Independent, medium complexity | Shell replaces existing same-name skill |
| 3 | `standup` | Referenced by PM agent | Update PM agent skill references in same commit |
| 4 | `compliance` | Complex, currently broken (`context: fork` subagent hang) | Shell naturally drops the `context: fork` bug |
| 5 | `plan` | Consolidates 3 per-methodology skills → 1 | PM agent references `plan-wave`; update in same commit |
| 6 | `retro` | Consolidates 3 per-methodology skills → 1 | PM agent references `retro-*`; update in same commit |

Per replacement commit:
1. Add shell skill at the new name (for consolidations, new single name replaces 3 files)
2. `bash tests/validate-plugin.sh` → green
3. Manual eval in fresh test session → verify per-skill eval scenario (§5)
4. If eval passes: delete the original skill file(s)
5. Update PM agent `AGENT.md` references if applicable (same commit as the deletion)
6. `bash tests/validate-plugin.sh` + `node tests/compatibility.mjs` → green
7. Update `tests/validate-plugin.sh` EXPECTED_SKILLS to reflect the change
8. Commit. One skill replacement = one commit. Enables clean revert if downstream work uncovers an issue.

### Stage 4: Cleanup
- Move `skills/spec-quality/` to `~/dev-projects/ido4specs/skills/spec-quality/` (coordinated commit pair across both repos)
- Delete `skills/spec-validate/` (duplicate of bundled `tech-spec-validator.js`)
- Re-brand `skills/pilot-test/` — either add `[dev-only]` to description and `disable-model-invocation: true`, or move to `tests/pilot-test.mjs` as non-skill tooling
- Bundle `tech-spec-validator.js` into `~/dev-projects/ido4dev/dist/` + add version marker + checksum (mirrors the ido4specs dual-bundle pattern)
- Update `skills/ingest-spec/SKILL.md` to invoke the bundled validator for fail-fast pre-validation before calling `ingest_spec`
- Fix any remaining stale doc references across plugin

### Stage 5: End-of-phase checkpoint (NOT a gate, a confirmation)
Run the full E2E smoke test now — fresh Claude Code session, install ido4specs + ido4dev from marketplace, walk `/ido4specs:create-spec → ... → /ido4dev:ingest-spec` against a real strategic spec. **This is a checkpoint confirming the new architecture works end-to-end, not a gate for starting.** Produces `reports/e2e-004-phase-2-completion.md`.

---

## 5. Eval-First Plan (per skill being replaced)

For each ceremony skill, 2-3 representative scenarios the shell + MCP prompt must handle. Verified manually in a fresh test session per Stage 3 step 3.

### `/health`
- Active wave, 0 blockers, compliance A/B → **GREEN** verdict with 1-line summary
- 3+ blockers or compliance D/F → **RED** with root cause + next-skill suggestion
- Mixed state → **YELLOW** with degraded-dimension identification

### `/board`
- Blocked tasks present → **CRITICAL** line identifies cascade depth
- In-Review without PR → false status flagged
- All clean → "on track" headline
- **Anti-pattern check:** output does NOT render kanban columns

### `/standup`
- Repeated block/unblock on same task → audit trail pattern surfaced
- Multi-agent with one idle → coordination signal
- Early vs. late phase → recommendations adapt

### `/compliance`
- Structural violation present → Part 2 flags with severity score
- Clean structure, low score → synthesis notes recovery
- **Behavior check:** does NOT hang at 25-30 tool uses (current bug via `context: fork`)

### `/plan` (profile-driven)
- Hydro: Epic Integrity enforced, epic split refused
- Scrum: Sprint Goal formulated first, DoR enforced
- Shape Up: pitches evaluated, poorly-shaped flagged, scope hammered

### `/retro` (profile-driven)
- Hydro wave: real throughput, cycle time, actor analysis
- Scrum sprint: binary Sprint Goal achieved/not, carry-over
- Shape Up cycle: ship rate, appetite calibration, scope creep audit

### `/review` (NEW)
- Completed container → Increment assessment + stakeholder summary

### `/execute-task` (NEW)
- Passed-validation task → methodology-principle-respecting guidance, phases structured

Evals are **LLM judgment quality checks**, not deterministic tests. They're verified manually because no automation can assess "did the output demonstrate methodology understanding."

---

## 6. Coordination Points

### PM agent (`agents/project-manager/AGENT.md`)
Currently references `/plan-wave`, `/compliance`, `/standup`, `/health` in recommendations and tool composition patterns. When any referenced skill changes name/shape, update AGENT.md in the same commit to avoid broken references.

Post-phase: PM agent references the methodology-neutral names (`/plan`, `/retro`) not per-methodology.

### Hooks (`hooks/hooks.json`)
References `validate_transition` and `assign_task_to_(wave|sprint|cycle)` — these are MCP **tool names**, not plugin skill names. Unaffected by skill renames. Will be revisited in Phase 3 (WS2 Hooks Rebuild).

### Tests
- `tests/validate-plugin.sh` EXPECTED_SKILLS — update with each deletion/addition
- `tests/compatibility.mjs` `criticalTools` — only updates if we add/remove a **tool** dependency, not for skill renames
- `tests/round3-agent-artifact.mjs` — tests parser behavior, unaffected
- `tests/enforcement-probes.mjs` — tests BRE enforcement, unaffected

### ido4specs (for the `spec-quality` move)
Same owner across both repos — coordinated commit pair:
1. Remove from ido4dev: delete `skills/spec-quality/`, update `validate-plugin.sh` EXPECTED_SKILLS
2. Add to ido4specs: place under `skills/spec-quality/`, add to that repo's equivalent list
3. Cross-reference: update any ido4dev docs pointing at it (CLAUDE.md if applicable, other skills)

---

## 7. Per-Step Verification

Between each Stage 3 skill replacement commit:

1. `bash tests/validate-plugin.sh` — structural sanity (frontmatter valid, no broken tool refs, EXPECTED_SKILLS matches reality)
2. `node tests/compatibility.mjs` — tool-surface check (criticalTools exist in installed `@ido4/mcp`)
3. Manual eval in a **fresh Claude Code test session** (not this conversation) — invoke the new shell, verify per-skill eval scenario
4. One commit per replacement. Granular history enables revert without unwinding unrelated work.

---

## 8. End-of-Phase Checklist

- [ ] 8 shell skills live and delegating correctly to MCP Prompts
- [ ] 10 ceremony duplicates deleted (standup, board, health, compliance, plan-wave, plan-sprint, plan-cycle, retro-wave, retro-sprint, retro-cycle)
- [ ] 3 sandbox-* deprecated skills hard-removed
- [ ] `spec-quality` moved to ido4specs
- [ ] `spec-validate` deleted
- [ ] `pilot-test` re-branded or relocated
- [ ] `tech-spec-validator.js` bundled in ido4dev `dist/`
- [ ] `ingest-spec` uses bundled validator for fail-fast pre-validation
- [ ] PM agent references updated to methodology-neutral skill names
- [ ] `validate-plugin.sh` EXPECTED_SKILLS accurate
- [ ] All per-skill evals (§5) verified manually
- [ ] E2E smoke test runs cleanly against the new shell-based architecture
- [ ] Architecture-evolution-plan §11 status log updated with Phase 2 completion
- [ ] This brief updated with Phase 2 outcomes and any design drift

---

## 9. Open Questions Beyond the #1 Investigation

- If Pattern A (instruction delegation) works, can a shell be a truly one-line body, or does it need skill-level behavior controls (`disable-model-invocation`, `allowed-tools`)?
- How should the `disable-model-invocation` inconsistency across current skills be resolved during the rebuild? (Opportunity to set a uniform policy: ceremony shells → `false` so Claude can auto-invoke; stateful workflows like ingest-spec → `true`.)
- Should the `tech-spec-validator.js` bundle in ido4dev auto-update via `repository_dispatch` the same way ido4specs's does? (Probably yes, for consistency with the bundled-validator pattern.)
- Does `/ido4dev:plan` need to read `.ido4/methodology-profile.json` to pick the right MCP prompt, or does the MCP server handle that automatically from its loaded profile? (If Pattern A, likely the latter.)

---

## 10. Status Log

| Date | Update |
|---|---|
| 2026-04-17 | Brief drafted. Blocked on §2 open investigation. No execution yet. |

This log updates as investigations resolve, stages complete, and design drift emerges.
