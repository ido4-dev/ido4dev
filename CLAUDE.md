# CLAUDE.md — ido4dev Plugin

## What This Is

The governance plugin for ido4 — methodology-aware orchestration, quality gates, compliance, and planning on top of an initialized ido4 project. Authoring technical specs is handled by the companion plugin `ido4specs` (install alongside `ido4dev` to run the full pipeline).

## Architecture

```
ido4specs (companion plugin, upstream)
  └── create-spec → synthesize-spec → review-spec → validate-spec
        │
        ▼ (hand off *-tech-spec.md)
ido4dev (this plugin)
  ├── Skills (~23, in flux during Phase 2 — see "Active Work" below) — Governance workflows (standup, planning, sandbox, ingest-spec, etc.) + new shells (review, execute-task)
  ├── Agents (1)      — project-manager (PM)
  ├── Hooks (2 types) — SessionStart (MCP server install), PostToolUse (governance signals)
  └── .mcp.json       — Starts @ido4/mcp server from ${CLAUDE_PLUGIN_DATA}

@ido4/mcp (npm package, installed automatically)
  ├── Tools (57 Hydro / 56 Scrum / 53 Shape Up)
  ├── Resources (9)
  └── Prompts (7)

@ido4/core (npm dependency of @ido4/mcp)
  └── Domain logic: BRE, profiles, services, repositories
```

## ido4specs Extraction — Complete (2026-04-15)

The decomposition / authoring slice of this plugin was extracted into a standalone companion plugin, `ido4specs`, so engineers can author technical specs as an upstream step feeding into this plugin's governance flow. The production pipeline is now `ido4shape → ido4specs → ido4dev:ingest-spec → GitHub issues under the project's methodology`.

**All five phases complete** — `ido4specs` is live on GitHub, npm (`@ido4/tech-spec-format@0.8.0`), and the `ido4-dev/ido4-plugins` marketplace at v0.1.0. This repo was slimmed to governance-only and released at `v0.8.0` on 2026-04-15. The `decompose` / `decompose-tasks` / `decompose-validate` skills and the three authoring agents (`code-analyzer`, `technical-spec-writer`, `spec-reviewer`) moved to `ido4specs`; `decompose-validate` was renamed to `ingest-spec` and slimmed to dry-run preview + ingest-on-approval. The only remaining closure is a user-driven live E2E smoke test of the full `/ido4specs:create-spec → ... → /ido4dev:ingest-spec` chain in a fresh Claude Code session.

**Where to find the extraction record:**
1. `~/dev-projects/ido4specs/docs/extraction-plan.md` — canonical plan for all five phases, with per-phase status and completion notes
2. `~/dev-projects/ido4specs/docs/phase-2-completion-record.md` — historical record of the Phase 2 plugin scaffold state
3. `~/dev-projects/ido4-suite/PLAN.md` Phase 9 — per-sub-phase checkbox state and plan history
4. Session memory `project_ido4specs_extraction.md` in this repo's pool — quick-load pointer

**Side-effect:** Phase 7 (the `@ido4/mcp` wildcard-dep bug) closed as part of Phase 9.5.1 — `ido4/scripts/release.sh` now mechanically pins internal `@ido4/*` deps to `~${VERSION}` on every bump. A fresh `npm install` in this repo post-0.8.0 pulls `@ido4/core@0.8.0` (was frozen at 0.5.0), and `tests/round3-agent-artifact.mjs` now passes 22/0 (was 19/2 failing).

`ido4specs` has zero runtime dependency on this plugin; both can exist independently.

## Active Work — Phase 2 Plugin Diet (in progress)

The plugin is undergoing a multi-phase reshape codified at `~/dev-projects/ido4dev/docs/architecture-evolution-plan.md`. Goal: convert the current ~23-skill surface — most ceremony skills duplicate methodology-aware logic that already lives canonically in `@ido4/mcp`'s `PromptGenerators` — into ~8 thin shells via the **Runtime Prompt Rendering** pattern. Each shell is a one-line `` !`node ido4-render-prompt <ceremony>` `` bash injection that calls a small CLI shipped with `@ido4/mcp`; the CLI reads the active methodology profile, dispatches to the right generator, and prints the profile-aware ceremony prompt to stdout. Single source of truth (the generators), profile-aware at invocation, zero build-step sync.

**State as of 2026-04-17:**
- **Phase 1** (cleanup, planning docs) — complete
- **Phase 2.1** (proof: `review` + `execute-task` shells + `render-prompt-cli.js` CLI in `@ido4/mcp`) — complete, **live-verified** in fresh Claude Code session against all three methodologies
- **Phase 2 Stage 3** (cascade: replace 10 ceremony duplicates with shells) — next
- **Phase 3** (hooks rebuild) and **Phase 4** (PM autonomy) — sequenced but not yet started

**Before changing skills, agents, hooks, or anything in `docs/`:** read `~/dev-projects/ido4dev/docs/architecture-evolution-plan.md` and `~/dev-projects/ido4dev/docs/phase-2-brief.md` first. Decisions are recorded in plan §6; do not re-litigate.

**Doc discipline (working principle):** update `architecture-evolution-plan.md` §11 (status log) at every phase gate, after every notable achievement, after every decision lands. The plan is a living document — staleness erodes its value as the guiding driver. The same applies to `phase-2-brief.md` and any other in-progress design briefs: progress that doesn't reach the doc didn't happen as far as future sessions are concerned.

## MCP Server Dependency

The plugin doesn't bundle the MCP server. On first session start, a `SessionStart` hook installs `@ido4/mcp` from npm to `${CLAUDE_PLUGIN_DATA}/`. The `.mcp.json` references the installed binary. This means:

- Plugin updates don't require re-downloading the MCP server
- The MCP server updates independently via npm version ranges
- No build step — the plugin is pure markdown + configuration

## Skill Conventions

- Skills are in `skills/{name}/SKILL.md` with YAML frontmatter
- Commands are in `commands/{name}.md` (legacy, mapped to skills)
- Tool references use `mcp__plugin_ido4dev_ido4__*` prefix
- Skill cross-references use `/ido4dev:{name}` format
- Every skill follows Claude Code Agent Skills standard

## Development

### Local testing
```bash
claude --plugin-dir /path/to/this/repo
```

### After changes
```bash
/reload-plugins
```

### Release
```bash
bash scripts/release.sh --dry-run [patch|minor|major] "Release message"  # pre-flight only
bash scripts/release.sh [patch|minor|major] "Release message"            # real release
```
The script runs Layer 1 pre-flight checks (branch, clean tree, remote sync, validation suite, MCP compatibility, version coherence), then bumps version in both `package.json` and `.claude-plugin/plugin.json`, commits, tags, and pushes. Marketplace sync and GitHub release creation happen automatically via CI (`sync-marketplace.yml` gated on `workflow_run`). Use `--yes` flag for non-interactive agent/CI use: `bash scripts/release.sh --yes patch "message"`.

### Working style

Make the call. Reserve (a)/(b)/(c) for genuinely different paths, not flavors of a recommendation already made. A short answer the user can redirect beats a long one that preempts every objection.

## ido4 Suite Coordination

This repo is part of the ido4 suite. Cross-repo release patterns, audit tooling, and coordination docs live in `~/dev-projects/ido4-suite/`:

- `docs/release-architecture.md` — the canonical 4-layer release pattern this repo follows
- `scripts/audit-suite.sh` — verifies all repos against the pattern. Run after any release/CI changes: `bash ~/dev-projects/ido4-suite/scripts/audit-suite.sh`
- `PLAN.md` — master plan tracking in-progress cross-repo work
- `suite.yml` — machine-readable suite manifest

Before changing release scripts, CI workflows, or cross-repo dispatch: read `release-architecture.md` first. After changes: run the audit script.

Before writing or auditing skills, agents, or prompts: read `docs/prompt-strategy.md` first. It defines degrees of freedom, rules vs principles, language guidance for Opus 4.5/4.6, skill architecture patterns, and the two-layer validation pattern.

## E2E Testing Protocol

When monitoring a live ido4dev session (any skill — standup, plan-wave, ingest-spec, sandbox-explore, etc.), follow this protocol.

**Before starting a new test round, read the most recent report in `reports/e2e-00N-*.md`.** Each round's report contains the current state of observations, known platform quirks (subagent execution patterns, skill-discovery inconsistencies, session bloat concerns), and the iteration pattern that emerged from prior rounds. Start there — it's the source of truth for round-to-round continuity.

### Setup

Two sessions run in parallel:
- **Test session:** A project folder with the ido4dev plugin loaded. The user interacts naturally.
- **Monitor session:** Opened in this repo. The user pastes interactions from the test session. Claude evaluates behavior against the skill and agent definitions in this codebase.

### How to monitor

1. Read the skill being tested (`skills/{name}/SKILL.md`) and any agents it invokes (`agents/{name}.md` or `agents/{name}/AGENT.md`). These define expected behavior — stages, sequencing, output format, governance rules.
2. As interactions are pasted, compare actual behavior against the definitions. Look for: skipped stages, wrong sequencing, missing output fields, governance violations, silent failures, quality degradation, hallucinated content.
3. Log every deviation as an observation immediately — don't batch them.

### Observation format

Each observation gets:
- **ID:** Sequential (OBS-01, OBS-02, ...) within the test
- **Type:** Bug, design gap, behavioral drift, quality issue, governance violation
- **Severity:** Low / Medium / High / Critical
- **When:** What stage and interaction triggered it
- **What happened:** The actual behavior (quote the interaction)
- **What was expected:** Traced to the specific skill/agent definition (file and section)
- **Evidence:** The pasted interaction or output that shows the deviation
- **Fix candidate:** Where in this repo the fix would go (file, section)

### Report

After the test session completes, produce a structured report in `reports/`:
- File name: `e2e-{NNN}-{project-name}.md`
- Sections: Test Setup, Pipeline Summary (what stages ran), Observations (all OBS entries), Positives (what worked well), Assessment, Next Steps
- First report for each skill becomes the calibration baseline for future tests

### What to watch for by stage type

Don't duplicate skill definitions here — read the skill. But these cross-cutting concerns apply to any test:
- **Does the skill read what it claims to read?** (canvas, spec, codebase, MCP resources)
- **Does the output match the defined format?** (sections, metadata, structure)
- **Are governance principles respected?** (epic integrity, dependency coherence, etc.)
- **Does the agent handle edge cases?** (empty input, missing files, greenfield projects)
- **Are intermediate review points honored?** (does the user get to review before the next stage proceeds)
- **Is content preserved through the pipeline?** (dependencies, stakeholder context, cross-cutting concerns — nothing silently dropped)

## Related

- [@ido4/mcp](https://github.com/ido4-dev/ido4) — MCP server + core domain (the monorepo)
- [ido4shape](https://github.com/ido4-dev/ido4shape) — Creative specification plugin (upstream)
- [ido4-demo](https://github.com/ido4-dev/ido4-demo) — Demo codebase for sandbox
- [ido4-plugins](https://github.com/ido4-dev/ido4-plugins) — Plugin marketplace
