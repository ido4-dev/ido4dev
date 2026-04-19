# ido4dev — AI-Hybrid Development Platform

The Claude Code plugin for [ido4](https://ido4.dev) — the platform that makes AI-hybrid software development work at scale. Specs-driven, methodology-aware, with full project context for every AI coding session.

## What It Does

ido4dev gives AI coding agents the understanding to build correctly:

- **Context intelligence** — every session starts with full project context (upstream decisions, downstream needs, sibling progress)
- **Quality enforcement** — 34-step Business Rule Engine validates every state transition. Deterministic, not AI reasoning.
- **Institutional memory** — audit trails, context comments, and accumulated knowledge compound across sessions
- **Multi-agent coordination** — work distribution, task locking, handoff protocols
- **Methodology support** — Hydro (wave-based), Scrum (sprint-based), Shape Up (cycle-based). The engine is code; methodologies are profiles.

11 plugin skills for stateful workflows (onboarding, sandbox lifecycle, spec ingestion), plus methodology-aware MCP ceremony prompts (`/mcp__plugin_ido4dev_ido4__standup`, `/mcp__plugin_ido4dev_ido4__plan`, `/mcp__plugin_ido4dev_ido4__retro`, etc.) served directly by the [@ido4/mcp](https://www.npmjs.com/package/@ido4/mcp) server. 1 agent (project-manager), 2 governance hooks. For technical spec authoring, install the companion plugin `ido4specs` alongside this one.

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
| **Sandbox** | `/ido4dev:sandbox` |

MCP ceremony prompts (methodology-aware — adapt to Hydro/Scrum/Shape Up based on the active profile):

| Category | Slash command |
|----------|---------------|
| **Project Intelligence** | `/mcp__plugin_ido4dev_ido4__standup`, `/mcp__plugin_ido4dev_ido4__board`, `/mcp__plugin_ido4dev_ido4__health`, `/mcp__plugin_ido4dev_ido4__compliance` |
| **Planning & Retros** | `/mcp__plugin_ido4dev_ido4__plan`, `/mcp__plugin_ido4dev_ido4__retro` |
| **Per-container** | `/mcp__plugin_ido4dev_ido4__review`, `/mcp__plugin_ido4dev_ido4__execute-task` |

Ceremony commands live in the MCP server rather than the plugin so they ship with the methodology-aware prompt generators as a single source of truth. In Claude Code's autocomplete these appear in their display form as `/plugin:ido4dev:ido4:<name>` — select from autocomplete (type `/<name>` + tab, e.g. `/standup` + tab); the command resolves to the `/mcp__plugin_ido4dev_ido4__<name>` execution form listed above. Direct typing of the execution form also works.

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
