# ido4dev — AI-Hybrid Development Platform

The Claude Code plugin for [ido4](https://ido4.dev) — the platform that makes AI-hybrid software development work at scale. Specs-driven, methodology-aware, with full project context for every AI coding session.

## What It Does

ido4dev gives AI coding agents the understanding to build correctly:

- **Context intelligence** — every session starts with full project context (upstream decisions, downstream needs, sibling progress)
- **Quality enforcement** — 34-step Business Rule Engine validates every state transition. Deterministic, not AI reasoning.
- **Institutional memory** — audit trails, context comments, and accumulated knowledge compound across sessions
- **Multi-agent coordination** — work distribution, task locking, handoff protocols
- **Methodology support** — Hydro (wave-based), Scrum (sprint-based), Shape Up (cycle-based). The engine is code; methodologies are profiles.

7 plugin skills — 6 user-facing stateful workflows (onboarding, sandbox lifecycle, spec ingestion, governance status) plus 1 dev-only test harness — and methodology-aware MCP ceremony prompts (`/mcp__plugin_ido4dev_ido4__standup`, `/mcp__plugin_ido4dev_ido4__plan`, `/mcp__plugin_ido4dev_ido4__retro`, etc.) served directly by the [@ido4/mcp](https://www.npmjs.com/package/@ido4/mcp) server. 1 agent (project-manager, an AI-work-product auditor), and a deterministic governance hook layer: SessionStart/SessionEnd lifecycle hooks plus PreToolUse gates and PostToolUse rules producing 14 deterministic findings — no LLM anywhere in the enforcement path. For technical spec authoring, install the companion plugin `ido4specs` alongside this one.

## Installation

```bash
# Add the ido4 plugin marketplace
/plugin marketplace add ido4-dev/ido4-plugins

# Install ido4dev
/plugin install ido4dev@ido4-plugins
```

The MCP server (`@ido4/mcp`) is installed automatically on first session start — no manual setup needed.

## Quick Start

```bash
# Set your GitHub token
export GITHUB_TOKEN=$(gh auth token)

# Start Claude Code, then:
/ido4dev:onboard
```

The onboarding skill auto-clones a [demo codebase](https://github.com/ido4-dev/ido4-demo), creates a governed sandbox with embedded violations, and walks you through governance discovery in ~10 minutes.

## Commands

Plugin skills (stateful workflows):

| Category | Slash command |
|----------|---------------|
| **Onboarding** | `/ido4dev:onboard`, `/ido4dev:guided-demo`, `/ido4dev:sandbox-explore` |
| **Spec Ingestion** | `/ido4dev:ingest-spec` (authoring lives upstream in `ido4specs`) |
| **Sandbox** | `/ido4dev:sandbox` (incl. orphan cleanup: `/ido4dev:sandbox cleanup-orphans`) |
| **Governance Status** | `/ido4dev:status` — on-demand resume banner: compliance grade, open audit findings, recent AI-audit activity |

MCP ceremony prompts (methodology-aware — adapt to Hydro/Scrum/Shape Up based on the active profile):

| Category | Slash command |
|----------|---------------|
| **Project Intelligence** | `/mcp__plugin_ido4dev_ido4__standup`, `/mcp__plugin_ido4dev_ido4__board`, `/mcp__plugin_ido4dev_ido4__health`, `/mcp__plugin_ido4dev_ido4__compliance` |
| **Planning & Retros** | `/mcp__plugin_ido4dev_ido4__plan`, `/mcp__plugin_ido4dev_ido4__retro` |
| **Per-container** | `/mcp__plugin_ido4dev_ido4__review`, `/mcp__plugin_ido4dev_ido4__execute-task` |

Ceremony commands live in the MCP server rather than the plugin so they ship with the methodology-aware prompt generators as a single source of truth. In Claude Code's autocomplete these appear in their display form as `/plugin:ido4dev:ido4:<name>` — select from autocomplete (type `/<name>` + tab, e.g. `/standup` + tab); the command resolves to the `/mcp__plugin_ido4dev_ido4__<name>` execution form listed above. Direct typing of the execution form also works.

## What changed in v1.0

- **Audit log now records all attempted transitions, not just committed ones.** Every non-dryRun transition attempt is persisted to `.ido4/audit-log.jsonl` with a new `executed: boolean` flag. An attempted-but-rejected transition (e.g., a BRE validation failure) is meaningful governance signal and no longer disappears from the trail. Consumers that want committed-only views filter `executed === true` — the same flag now present on every transition tool response.
- **New MCP tools:** `get_methodology_profile` (runtime profile fetch for subagents), `get_task_comments` + `get_task_lineage` (content-quality audit surface), `list_orphan_sandboxes` + `delete_orphan_sandbox` (cleanup of sandbox projects whose repo is gone).
- **Sandbox creation is transactional in spirit:** pre-flight validates repo, auth, and default branch before any mutation; on mid-flight failure a best-effort rollback closes/deletes everything that was created. No more orphan issues on your repo from a failed setup.
- **The project-manager agent audits with minimum sufficient evidence** (small, prescribed tool sequences per audit pattern) and covers content quality (PR descriptions, comment trails, spec-to-task lineage) alongside state-shape checks.
- **New `/ido4dev:status` skill** — see your governance state on demand.

## Known platform constraints

These are properties of Claude Code that ido4dev works around, not bugs:

- **SessionStart banner not visible in terminal** (anthropics/claude-code#24425, #11120) — Claude Code injects SessionStart hook stdout into the AI's context but does not display it in the user's terminal. Plugin workaround: `/ido4dev:status` shows the banner content on demand.
- **`CLAUDE_PLUGIN_DATA` may be empty in Bash-tool context** — the env var is set for SessionStart hook subprocesses but not always for Bash-tool invocations made by the model. Plugin workaround: skills that invoke bundled scripts derive the data directory from `~/.claude/plugins/data/` when the variable is unset.
- **GitHub Project v2 does not cascade-delete with its repo** — Projects are repo-independent at the GitHub API level. If you delete a sandbox repo directly, the project board survives as an orphan. Plugin workaround: `/ido4dev:sandbox cleanup-orphans` finds and deletes them.
- **Single-project scope** — ido4dev assumes one ido4 project per directory. Multi-project / org-wide governance is not supported in v1.0.
- **Methodology switching mid-project not supported** — changing `.ido4/methodology-profile.json` from one methodology to another mid-project leaves existing tasks in invalid states. v1.0 does not provide a migration path.

## Part of the ido4 Suite

- **[ido4shape](https://github.com/ido4-dev/ido4shape)** — Creative specification through conversation. Shapes what to build.
- **ido4specs** — Technical specification authoring. Takes a strategic spec + codebase and produces an ingestion-ready technical spec (`*-tech-spec.md`). Upstream of `ido4dev`.
- **ido4dev** (this plugin) — Governance for AI-hybrid development. Ingests technical specs into methodology-shaped GitHub issues, then runs compliance, standups, planning, and retrospectives on them.

All available from the same marketplace: `/plugin marketplace add ido4-dev/ido4-plugins`

## Links

- [ido4.dev](https://ido4.dev) — Product website
- [Documentation](https://hydro-dev.gitbook.io/ido4) — GitBook docs
- [@ido4/mcp on npm](https://www.npmjs.com/package/@ido4/mcp) — MCP server
- [ido4-demo](https://github.com/ido4-dev/ido4-demo) — Demo codebase for sandbox

## License

MIT
