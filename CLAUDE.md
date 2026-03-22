# CLAUDE.md — ido4dev Plugin

## What This Is

The Claude Code plugin for ido4 — the AI-hybrid development platform. This repo contains skills, agents, hooks, and configuration that orchestrate the [@ido4/mcp](https://www.npmjs.com/package/@ido4/mcp) server into intelligent development workflows.

## Architecture

```
ido4dev (this plugin)
  ├── Skills (21)     — Governance workflows (standup, planning, sandbox, etc.)
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
bash scripts/release.sh [patch|minor|major] "Release message"
```
This bumps the version in `.claude-plugin/plugin.json` and syncs to the `ido4-dev/ido4-plugins` marketplace.

## Related

- [@ido4/mcp](https://github.com/ido4-dev/ido4) — MCP server + core domain (the monorepo)
- [ido4shape](https://github.com/ido4-dev/ido4shape) — Creative specification plugin (upstream)
- [ido4-demo](https://github.com/ido4-dev/ido4-demo) — Demo codebase for sandbox
- [ido4-plugins](https://github.com/ido4-dev/ido4-plugins) — Plugin marketplace
