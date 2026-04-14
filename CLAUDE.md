# CLAUDE.md — ido4dev Plugin

## What This Is

The Claude Code plugin for ido4 — the AI-hybrid development platform. This repo contains skills, agents, hooks, and configuration that orchestrate the [@ido4/mcp](https://www.npmjs.com/package/@ido4/mcp) server into intelligent development workflows.

## Architecture

```
ido4dev (this plugin)
  ├── Skills (23)     — Governance workflows (standup, planning, sandbox, etc.)
  ├── Agents (4)      — PM, code-analyzer, technical-spec-writer, spec-reviewer
  ├── Hooks (2 types) — SessionStart (MCP server install), PostToolUse (governance signals)
  └── .mcp.json       — Starts @ido4/mcp server from ${CLAUDE_PLUGIN_DATA}

@ido4/mcp (npm package, installed automatically)
  ├── Tools (57 Hydro / 56 Scrum / 53 Shape Up)
  ├── Resources (9)
  └── Prompts (7)

@ido4/core (npm dependency of @ido4/mcp)
  └── Domain logic: BRE, profiles, services, repositories
```

## Active Extraction (in progress)

The decomposition slice of this plugin is being extracted into a new standalone companion plugin, `ido4specs`, so engineers can author technical specs without installing the full governance platform. The pipeline becomes `ido4shape → ido4specs → ido4dev:ingest-spec → GitHub issues`, and `ido4dev` slims to a governance-only plugin once the extraction completes.

**Status as of 2026-04-14:**
- **Phase 1** (extracting `@ido4/tech-spec-format` from `@ido4/core`) — complete in the `ido4` monorepo
- **Phase 2** (creating the `ido4specs` plugin scaffold) — complete on local main of `~/dev-projects/ido4specs/`, head `b8be1ab`, not yet pushed
- **Phase 3** (slimming this repo) — **next workstream, now unblocked**. Will delete `skills/decompose/`, `skills/decompose-tasks/`, `agents/code-analyzer.md`, `agents/technical-spec-writer.md`, `agents/spec-reviewer.md`, and rename/slim `skills/decompose-validate/` → `skills/ingest-spec/` (Stages 2+3 only — Stage 1 spec-reviewer move is already in ido4specs). Keep all governance skills, `.mcp.json`, and the `@ido4/mcp` install hook.
- **Phases 4–5** (suite integration + release coordination) — pending

The architecture diagram and skill/agent counts above will be updated **as part of Phase 3 itself** — they're accurate today (the decompose skills and agents still live here) and become stale only after Phase 3 deletes them.

**Where to start a Phase 3 session:**
1. Read `~/dev-projects/ido4specs/docs/phase-2-completion-record.md` for architectural context and the deferred-items table
2. Read `~/dev-projects/ido4specs/docs/extraction-plan.md` §8 for the per-file delete/slim/keep/update/verify list
3. Check `~/dev-projects/ido4-suite/PLAN.md` Phase 9.3 for per-sub-phase checkbox state
4. Session memory `project_ido4specs_extraction.md` in this repo's pool has the same context as a quick-load pointer

The slim is reversible until released. ido4specs has zero runtime dependency on ido4dev — reverting Phase 3's commit leaves both plugins in working states.

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

When monitoring a live ido4dev session (any skill — decompose, plan-wave, standup, etc.), follow this protocol.

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
