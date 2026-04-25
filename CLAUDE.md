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
  ├── Skills (6) — Stateful workflows (onboard, guided-demo, sandbox, sandbox-explore, ingest-spec) + dev tooling (pilot-test — scoped dev-only)
  ├── Agents (1) — project-manager (PM); Phase 4 rebuilds it as profile-aware AI-work-product auditor
  ├── Hooks (4 types) — SessionStart (MCP install + tech-spec-validator bundle + resume banner), SessionEnd (state.json persistence), PreToolUse (3 governance gates), PostToolUse (4 rule files producing 14 deterministic findings)
  └── .mcp.json       — Starts @ido4/mcp server from ${CLAUDE_PLUGIN_DATA}

@ido4/mcp (npm package, installed automatically)
  ├── Tools (57 Hydro / 56 Scrum / 53 Shape Up)
  ├── Resources (9)
  └── Prompts (8 methodology-aware ceremonies) — standup, plan, board, compliance, health, retro, review, execute-task. Invoked as /mcp__plugin_ido4dev_ido4__<prompt> slash commands.

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

## Active Work — Phase 5 (next initiative; brief to draft)

The plugin is undergoing a multi-phase reshape codified at `~/dev-projects/ido4dev/docs/architecture-evolution-plan.md`. **Phase 4 closed 2026-04-25** with substrate ships clean + 6 findings handed off to Phase 5 (`reports/e2e-006-phase-4-partial.md`). Phase 5 absorbs four workstreams: engine fixes (F5/F6 from the partial report), agent UX hardening (F1/F2/F3/F4), Tier B content metrics (the original §7.10 scope), and a comprehensive closing smoke that re-runs Phase 4 Stage 5 scenarios alongside Phase 5's new scope. Phase 4 substrate reference: `docs/phase-4-brief.md`; Phase 3 substrate reference: `docs/phase-3-brief.md`; standing reference: `~/dev-projects/ido4-suite/docs/hook-and-rule-strategy.md`.

**Product-thesis framing (§3.9 of the evolution plan).** Hooks/rules/state aren't UX polish — they're the operating substrate for hybrid human+AI engineering at scale. Humans + old tools + AI in the old pattern leaves AI's speed capped at human-coordination speed; pure AI without governance drifts invisibly. ido4 bridges them by **operationalizing institutional memory** (remembering methodology + dependencies + compliance trajectory + epic relationships) and **imposing it at the moment it's relevant**. Mutual substrate: AI agents get context they'd otherwise reconstruct; humans offload coordination to the system. The test for every rule, audit metric, or persisted finding: "does this operationalize institutional memory — either remembering something, or surfacing something the user/agent needs but doesn't have in context?" If not, it's noise. See `architecture-evolution-plan.md §3.9` for the full framing.

**State as of 2026-04-25:**
- **Phase 1** (cleanup, planning docs) — complete (2026-04-17).
- **Phase 2** (plugin diet — ceremony duplicates deleted, migration debt cleared, Stage 4 items landed) — complete (2026-04-20). Report: `reports/e2e-004-phase-2-smoke.md`.
- **Phase 3** (hooks rebuild, WS2) — **ships clean (2026-04-25)**, commits `c0a22d2` / `0e17edf` / `ebabb20`. Substrate built: rule-runner library + vendored YAML/Mustache, `state.json` with `coerce()` preserving unknown fields, six rule files producing 14 rules across PostToolUse + PreToolUse, advisory-escalation pattern (Stage 7), MCP `tool_response` unwrap (Stage 9 critical fix). Reports: `reports/e2e-005-phase-3-smoke.md`, `reports/phase3-mcp-tool-response-bug-2026-04-25.md`. Canonical hook reference: `docs/hook-architecture.md`. Stage 6 was skipped (PostCompact hook not implemented in current Claude Code; memory-system auto-reload covers the underlying need); §3.1 violation closed across all migrated matchers. Four research-first pre-implementation corrections (Stages 3, 5, 6, 7) caught optimistic primitive assumptions before code shipped — the discipline carries forward into Phase 4.
- **Phase 4** (PM agent autonomy, WS3) — **closes 2026-04-25 with substrate-ships-clean verdict + 6 findings handed off to Phase 5 (Path B)**. Stages 1-4 verified mechanically + (Stage 1) live-multi-profile-verified. Stage 5 closing smoke ran 2 of 6 scenarios before pausing on rich agent-UX findings: AW001 wiring works (substrate ✓), but the agent layer over-fetches catastrophically (63 tool calls, multiple permission prompts), overwrites state.json instead of merging, reasons from wrong audit source, and produces partially-miscalibrated findings — *"UX nightmare and erodes trust"* (user feedback). Plus 2 engine bugs surfaced. Substrate references: `docs/phase-4-brief.md`, `docs/hook-architecture.md`. Findings: `reports/e2e-006-phase-4-partial.md`.
- **Phase 5** (next initiative — brief to draft) — **triggered 2026-04-25 by Phase 4 Stage 5 partial smoke**. Originally scoped as Tier B content metrics; scope expanded to four workstreams via §7.10: WS1 engine fixes (F5 `complete_task` action-vs-status bug; F6 `approve_task` semantic ambiguity around `success: false` + `auditEntry`), WS2 agent UX hardening (F1 over-fetch + F2 overwrite + F3 advisory wording + F4 source guidance — all in `agents/project-manager/AGENT.md` prose), WS3 Tier B content metrics (PR body quality + comment-trail presence + spec-to-task lineage), WS4 comprehensive closing smoke that re-runs Phase 4 Stage 5 scenarios alongside Phase 5 new scope (eliminates the Phase-4-vs-Phase-5 boundary blur; ensures substrate works under revised agent). Estimated ~10-16 working days across all 4 WS. Findings ledger preserved in `reports/e2e-006-phase-4-partial.md` so Phase 5 starts with full empirical context.

**Open investigations (status as of 2026-04-25):**
- **§7.6 — Routines vs `CronCreate`** — Researched + decided. Two distinct primitives: Routines (cloud, account-scoped, durable, runs blind to `state.json`/skills/`${CLAUDE_PLUGIN_DATA}`) and `CronCreate`-the-tool (in-session, 7-day expiry). Routines deferred from Phase 4 by user decision (2026-04-25); three concrete re-open triggers documented (multi-stakeholder distribution, cross-session AI-audit pattern, real users arrive).
- **§7.7 — Event log promotion** — Standing watch. None of Phase 4's planned rules require cross-session event history. Concrete pending triggers documented; first concrete cross-session rule earns the upgrade.
- **§7.8 — Memory architecture** — Preliminary-resolved. Four-layer model (state.json, GitHub issues, `.ido4/project-info.json` + BRE state, SessionStart `additionalContext`) covers ido4's use cases. No MEMORY.md authorship needed unless Phase 4 surfaces a concrete gap.
- **§7.9 — Sandbox UX + transactional integrity** — Standing initiative, separate from Phase 4. OBS-06/07 (no transactional rollback for `create_sandbox`) is the load-bearing finding. Tracked in `reports/sandbox-ux-findings-2026-04-25.md`.
- **§7.10 — Phase 5 (agent UX + engine fixes + Tier B + closing smoke)** — **TRIGGERED 2026-04-25.** Scope rewritten to four workstreams (engine fixes, agent UX hardening, Tier B content metrics, comprehensive closing smoke). Findings ledger in `reports/e2e-006-phase-4-partial.md`. Phase 5 is the active next initiative.

**Before changing skills, agents, hooks, rule files, or anything in `docs/`:** read `~/dev-projects/ido4dev/docs/architecture-evolution-plan.md` (especially §3 principles, §6 decisions, §11 status log, §7.10 Phase 5 scope) and the active-phase brief (Phase 5 brief once drafted; until then `docs/phase-4-brief.md` is the substrate reference + `reports/e2e-006-phase-4-partial.md` is the findings ledger that drives Phase 5 scope; `docs/phase-3-brief.md` as the substrate reference for hook-layer mechanics). Decisions are recorded in plan §6; do not re-litigate. For hook/rule design specifically, also read the suite-level `~/dev-projects/ido4-suite/docs/hook-and-rule-strategy.md` (§2 principles, §4 canonical patterns, §5 anti-patterns).

**Doc discipline (working principle):** update `architecture-evolution-plan.md` §11 (status log) at every phase gate, after every notable achievement, after every decision lands. The plan is a living document — staleness erodes its value as the guiding driver. The same applies to in-progress design briefs (Phase 5 brief, once drafted): progress that doesn't reach the doc didn't happen as far as future sessions are concerned.

## MCP Server Dependency

The plugin doesn't bundle the MCP server. On first session start, a `SessionStart` hook installs `@ido4/mcp` from npm to `${CLAUDE_PLUGIN_DATA}/`. The `.mcp.json` references the installed binary. This means:

- Plugin updates don't require re-downloading the MCP server
- The MCP server updates independently via npm version ranges
- No build step — the plugin is pure markdown + configuration

## Bundled tech-spec-validator

`skills/ingest-spec` runs a fail-fast pre-check on the technical spec before calling `ingest_spec`. The check uses `@ido4/tech-spec-format`'s parser, shipped as a zero-dependency Node bundle at `dist/tech-spec-validator.js`. A `SessionStart` hook copies it to `${CLAUDE_PLUGIN_DATA}/tech-spec-validator.js` so the skill can invoke `node "${CLAUDE_PLUGIN_DATA}/tech-spec-validator.js" <path>` without referencing the plugin install root.

This matches the dual-bundle pattern already used by `ido4specs` and `ido4shape` (canonical doc: `~/dev-projects/ido4-suite/docs/release-architecture.md`). The bundle is version-locked:

- `dist/tech-spec-validator.js` — the bundle (banner contains `@ido4/tech-spec-format v<X.Y.Z>`)
- `dist/.tech-spec-format-version` — semver marker of the bundled version
- `dist/.tech-spec-format-checksum` — SHA-256 of the bundle (verified in `tests/validate-plugin.sh`)

**Manual bundle refresh:** `bash scripts/update-tech-spec-validator.sh 0.8.0` (npm) or `bash scripts/update-tech-spec-validator.sh ~/dev-projects/ido4` (local build). The script fetches/copies the bundle, smoke-tests it against `references/example-technical-spec.md`, and writes the version + checksum markers.

**Automatic bundle refresh:** `.github/workflows/update-tech-spec-validator.yml` receives `repository_dispatch: tech-spec-format-published` from the ido4 monorepo's publish flow, opens an auto-PR with the updated bundle, and auto-merges patch/minor bumps. Major bumps open with `needs-review`. A weekly cron acts as a safety net. Requires `PAT` secret on this repo (for PR creation) and `IDO4DEV_DISPATCH_TOKEN` secret on the ido4 monorepo (for dispatch).

**Release gate:** `scripts/release.sh` runs `check_bundle` in Layer 1 pre-flight: refuses to release if the bundle is missing or missing its version header, warns interactively on drift against npm (`--yes` flag skips the prompt).

The purpose is to close the "parses upstream in `ido4specs:validate-spec` but fails downstream in `ido4dev:ingest-spec`" seam — same parser, same version on both sides of the trust boundary.

## Hook Architecture

The plugin's hook layer — delivered by Phase 3 — is a deterministic rule-runner with YAML rule files evaluated against live hook events, backed by a small `state.json` substrate. Full details: **`~/dev-projects/ido4dev/docs/hook-architecture.md`** (canonical reference, extension procedure, failure modes, current rule inventory).

**What lives where:**
- `hooks/hooks.json` — Claude Code hook entries (SessionStart/SessionEnd + PreToolUse + PostToolUse)
- `hooks/lib/rule-runner.js` — the pure-Node evaluator (zero runtime npm deps)
- `hooks/lib/state.js` — `state.json` read/write wrapper
- `hooks/lib/vendored/` — version-locked js-yaml + mustache UMD bundles
- `hooks/rules/*.rules.yaml` — one rule file per matcher group; sibling `*.test.yaml` fixtures
- `hooks/scripts/*.{sh,js}` — hook-entry shims (SessionStart install/bundle/banner; SessionEnd state)

**Design principles (enforced, not aspirational):**
- **§3.1 — BRE is deterministic; LLM is for judgment, not enforcement.** The rule-runner never invokes an LLM. Rule files process structured tool responses through deterministic expressions (`when:`), templated output (Mustache `emit:`), and advisory escalation (`escalate_to:` recommending delegation to a named agent).
- **§3.9 — Institutional memory as the operating substrate.** Every rule passes the "earn its slot" test: does it operationalize memory the system has that the user or agent needs imposed now? If not, it's noise.
- **Distribution by signal origin.** Cascade rules live on `complete_and_handoff` (where the signal exists), not on `validate_transition` (which never returns cascade info). Always verify the signal shape before writing rules — four Phase 3 stages had research corrections on brief-assumed fields that didn't exist.
- **Silence is a feature.** Fewer rules with higher signal > many rules with low specificity. Stage 4 audit cut 2 of 7 sketched rules as noise.

**Extension procedure (adding a rule):** see `docs/hook-architecture.md` §"How to add a new rule file" — choose matcher, verify signal shape in `@ido4/mcp`, write rules against real fields, use triple-brace Mustache for prose, create sibling test fixture, wire hooks.json, update MIGRATED_MATCHERS in `validate-plugin.sh`, run tests.

**Standing reference for design decisions:** `~/dev-projects/ido4-suite/docs/hook-and-rule-strategy.md` defines suite-level principles, canonical patterns (§4), and anti-patterns (§5). Read that doc to decide *whether* a new pattern earns its slot; read `docs/hook-architecture.md` to figure out *how* to implement it in this plugin.

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

When monitoring a live ido4dev session (any plugin skill like ingest-spec/sandbox-explore/guided-demo, or any MCP ceremony like `/mcp__plugin_ido4dev_ido4__standup`, `/mcp__plugin_ido4dev_ido4__plan`), follow this protocol.

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
