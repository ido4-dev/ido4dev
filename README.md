# ido4dev — AI-Hybrid Development Platform

The Claude Code plugin for [ido4](https://ido4.dev) — the platform that makes AI-hybrid software development work at scale. Specs-driven, methodology-aware, with full project context for every AI coding session.

## What It Does

ido4dev gives AI coding agents the understanding to build correctly:

- **Context intelligence** — every session starts with full project context (upstream decisions, downstream needs, sibling progress)
- **Quality enforcement** — 34-step Business Rule Engine validates every state transition. Deterministic, not AI reasoning.
- **Institutional memory** — audit trails, context comments, and accumulated knowledge compound across sessions
- **Multi-agent coordination** — work distribution, task locking, handoff protocols
- **Methodology support** — Hydro (wave-based), Scrum (sprint-based), Shape Up (cycle-based). The engine is code; methodologies are profiles.

21 skills, 1 agent (project-manager), 2 governance hooks. Built on the [@ido4/mcp](https://www.npmjs.com/package/@ido4/mcp) server. For technical spec authoring, install the companion plugin `ido4specs` alongside this one.

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

## Skills

| Category | Skills |
|----------|--------|
| **Onboarding** | `/ido4dev:onboard`, `/ido4dev:guided-demo`, `/ido4dev:sandbox-explore` |
| **Project Intelligence** | `/ido4dev:standup`, `/ido4dev:board`, `/ido4dev:health`, `/ido4dev:compliance` |
| **Planning** | `/ido4dev:plan-wave`, `/ido4dev:plan-sprint`, `/ido4dev:plan-cycle` |
| **Retrospectives** | `/ido4dev:retro-wave`, `/ido4dev:retro-sprint`, `/ido4dev:retro-cycle` |
| **Spec Ingestion** | `/ido4dev:ingest-spec` (authoring lives upstream in `ido4specs`), `/ido4dev:spec-validate`, `/ido4dev:spec-quality` |
| **Sandbox** | `/ido4dev:sandbox`, `/ido4dev:pilot-test` |

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
