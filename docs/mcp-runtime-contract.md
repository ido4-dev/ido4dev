# Interface Contract #5: MCP Runtime Dependency

**Status:** Active
**Producer:** `@ido4/mcp` (the MCP server, published to npm)
**Consumer:** `ido4dev` plugin (the sole runtime consumer in the ido4 ecosystem)
**Verification:** `~/dev-projects/ido4dev/tests/compatibility.mjs`

This is the canonical specification for contract #5 in the ido4 interface-contracts index. It defines the runtime dependency between the `ido4dev` Claude Code plugin and the `@ido4/mcp` MCP server, including what counts as a breaking change to the contract and how it is verified.

---

## What this contract defines

The set of MCP tools, response shapes, and behavioral guarantees that `ido4dev` depends on at runtime. Unlike the bundled-validator contracts (#1 strategic spec format, #6 technical spec format), this contract is **not enforced through vendored binaries** — instead, `ido4dev`'s `SessionStart` hook installs `@ido4/mcp` from npm into `${CLAUDE_PLUGIN_DATA}/node_modules/`, and `ido4dev`'s `.mcp.json` invokes the installed binary as the `ido4` MCP server.

After the Phase 9 ido4specs extraction (2026-04-15), `ido4dev` is the **sole runtime MCP consumer** in the ido4 ecosystem. `ido4shape` and `ido4specs` are both MCP-free — they use bundled validators (contract #3) for all parsing and validation needs. This makes contract #5 architecturally exceptional: it is the only contract enforced via runtime npm dependency rather than vendored bundles.

---

## CLI surfaces (added Phase 2.1, 2026-04-17)

In addition to MCP tools, the contract now also covers **CLI binaries** shipped in `@ido4/mcp`'s `package.json` `bin` field. Plugin shell skills depend on these binaries existing at the expected path under `${CLAUDE_PLUGIN_DATA}/node_modules/@ido4/mcp/dist/` after the SessionStart hook installs the package.

Current CLI surface:

| Bin name | Compiled path | Used by |
|---|---|---|
| `ido4-mcp` | `dist/index.js` | `.mcp.json` (the MCP server itself) |
| `mcp` | `dist/index.js` | Alias for `ido4-mcp` |
| `ido4-render-prompt` | `dist/render-prompt-cli.js` | Plugin shell skills (`/ido4dev:standup`, `/ido4dev:review`, `/ido4dev:execute-task`, etc.) via bash injection — calls `renderPrompt()` from `dist/render-prompt.js` to dispatch over methodology × ceremony and print the rendered prompt to stdout |

**What counts as a breaking change for the CLI surface:**

- Removing a bin entry the plugin uses
- Renaming a bin (would break the bash-injection paths in shell skills)
- Changing the CLI's argv interface in a way that breaks existing callers (removing required positional, renaming flags, changing exit-code semantics)
- Changing stdout output format such that the consumer (Claude, via skill body substitution) no longer receives the expected content
- Changing CLI dependencies to require something not present in the plugin install (e.g., a new env var the plugin doesn't set)

**Verification:** `~/dev-projects/ido4dev/tests/shell-skills-render.mjs` exercises the CLI as a subprocess against fixture profiles for all three methodologies, validating output content markers, suffix propagation, and empty-`$ARGUMENTS` handling. Plus `~/dev-projects/ido4/packages/mcp/tests/render-prompt-cli.test.ts` (39 vitest unit tests covering the CLI's argument parsing).

## The criticalTools surface

The contract surface is defined by the `criticalTools` allowlist in `~/dev-projects/ido4dev/tests/compatibility.mjs`. Tools on this list must exist with stable names, parameter signatures, and response shapes for `ido4dev` to function.

As of `ido4dev@0.8.0` paired with `@ido4/mcp@^0.8.0`, the criticalTools are:

| Domain | Tools |
|---|---|
| Sandbox lifecycle | `create_sandbox`, `destroy_sandbox`, `reset_sandbox` |
| Composite aggregators | `get_standup_data`, `get_health_data`, `get_compliance_data`, `get_board_data` |
| Task governance | `get_next_task`, `validate_transition`, `list_agents` |
| PR integration | `find_task_pr`, `get_pr_reviews` |
| Spec ingestion | `ingest_spec` |

The composite aggregators are the heaviest dependency — they return full skill-context payloads (containerStatus, tasks, reviewStatuses, blockerAnalyses, auditTrail, analytics, agents, compliance) so plugin skills can issue one tool call instead of N+1 individual calls. Their response shape stability matters as much as their existence.

The list is consumer-driven: `ido4dev` declares what it needs, the engine MUST provide it. The list is updated by editing `compatibility.mjs` whenever ido4dev adds a new skill or feature that depends on a previously non-critical tool.

---

## What counts as a change to the contract

### Breaking change (requires major version bump in `@ido4/mcp`, coordination with ido4dev)

A change is **breaking** if it:

1. Removes a tool from the criticalTools list
2. Renames a tool in the criticalTools list
3. Changes a criticalTools tool's parameter signature in a way that breaks existing callers — removing a required parameter, renaming a parameter, changing a parameter from optional to required, narrowing a type
4. Changes a criticalTools tool's response shape such that ido4dev's parsing breaks — removing a documented field, renaming a field, narrowing a type, restructuring a payload
5. Changes implicit behavior the consumer relies on — for example, `ingest_spec` with `dryRun=true` no longer returning the methodology preview, or `validate_transition` no longer returning the unblock-cascade information

### Additive change (non-breaking, ships with minor version)

A change is **additive** if it:

- Adds a new tool not in criticalTools
- Adds new optional parameters to a criticalTools tool
- Adds new fields to a criticalTools tool's response payload (consumers ignore unknown fields)
- Adds new behavior that complements existing semantics without contradicting them

### Behavior-preserving change (ships with patch version)

A change is **behavior-preserving** if it:

- Refactors implementation without altering tool names, signatures, or documented response shapes
- Improves performance, error messages, log output, or internal abstractions
- Fixes bugs that brought behavior back into compliance with documented intent

---

## Verification mechanism

`~/dev-projects/ido4dev/tests/compatibility.mjs` runs as part of the plugin's release pre-flight (`scripts/release.sh` → `tests/validate-plugin.sh`) and on every push via CI. It checks:

1. **Importability** — the `@ido4/mcp` package can be imported
2. **Critical exports** — `@ido4/core` exports the symbols the MCP server needs (`SandboxService`, `ServiceContainer`, `IngestionService`, `ProfileRegistry`, `ConsoleLogger`, `CredentialManager`, `GitHubGraphQLClient`)
3. **Critical tools registration** — every tool in the criticalTools allowlist is registered in the installed `@ido4/mcp` (read from compiled `dist/tools/*.js` source via regex extraction of `server.tool('name', ...)` calls)

### Limitation: name-level testing

`compatibility.mjs` is a **name-level** test, not a behavior-level test. It checks that tools EXIST but does not exercise them. A behavior-drift bug — like the 2026-04-12 wildcard-dep incident, where `@ido4/mcp`'s `package.json` declared `"@ido4/core": "*"` and npm froze it at 0.5.0 while 0.7.x shipped suffix-aware task-ref parsing — would not be caught by `compatibility.mjs`. The names matched, but the behavior diverged.

### Behavior-level tests (defense in depth)

To catch behavior drift, two additional tests run alongside `compatibility.mjs`:

- `~/dev-projects/ido4dev/tests/round3-agent-artifact.mjs` — exercises full pipeline with a representative spec, would have caught the wildcard-dep bug (went from 19/2 failing against stale 0.5.0 to 22/0 passing against fresh 0.8.0 post-fix)
- `~/dev-projects/ido4dev/tests/enforcement-probes.mjs` — exercises BRE enforcement at runtime against representative scenarios

---

## How to extend the contract

### When `ido4dev` adds a new dependency

When a new ido4dev skill or feature requires a previously non-critical tool, or when an entirely new tool is needed:

1. Add the tool name to `criticalTools` in `~/dev-projects/ido4dev/tests/compatibility.mjs`
2. Update the criticalTools table in this file
3. Verify the tool exists in `@ido4/mcp` (it must already be on the registered tool list, or coordinate with engine maintainers to add it)

### When `@ido4/mcp` changes a critical tool

When the engine plans a change to a tool in the criticalTools list:

1. The change requires explicit coordination with `ido4dev` consumer
2. Decide the change classification (breaking / additive / behavior-preserving) using the criteria above
3. If breaking: bump `@ido4/mcp` major version, update `compatibility.mjs` criticalTools list, update affected ido4dev skills, update this contract file, document the migration
4. If additive: minor version, no contract changes required
5. If behavior-preserving: patch version, no contract changes required

---

## Failure modes

| Symptom | Likely cause | Diagnostic / fix |
|---|---|---|
| `compatibility.mjs` fails — critical tool not registered | Tool was renamed or removed in `@ido4/mcp` without updating `criticalTools` | Compare current `criticalTools` array against `dist/tools/*.js` exports; update list to match current MCP surface, then update affected ido4dev skills |
| Skill calls a tool, gets unexpected response shape | Behavior drift between consumer and producer (silent contract violation) | Run behavior-level tests (`round3-agent-artifact.mjs`, `enforcement-probes.mjs`); if not caught, add a behavior probe for the affected tool |
| MCP server fails to start at SessionStart | `npm install --production` failed in `${CLAUDE_PLUGIN_DATA}`, or `dist/index.js` path doesn't exist | Inspect SessionStart hook stderr; verify `${CLAUDE_PLUGIN_DATA}/node_modules/@ido4/mcp/dist/index.js` exists; rerun `npm install` manually |
| Plugin loads, MCP tools "not found" by Claude | `.mcp.json` `command` or `args` mismatch with installed binary location | Verify `.mcp.json` paths against actual `node_modules/` layout; check Claude Code MCP server logs |
| Spec parses upstream in `ido4specs:validate-spec` but fails at `ido4dev:ingest-spec` | Parser version skew between `ido4specs`'s bundled validator and `@ido4/core`'s installed parser (the wildcard-dep failure mode) | Compare `ido4specs/dist/.tech-spec-format-version` against `ido4dev/node_modules/@ido4/core/node_modules/@ido4/tech-spec-format/package.json`; fix is fresh `npm install` in ido4dev or trigger auto-update PR. Closed structurally by Phase 9.5.1 release-script auto-pinning, but worth knowing |

See `~/dev-projects/ido4-suite/docs/cross-repo-connections.md` "When a connection breaks" table for the full failure-mode index.

---

## Why this contract is the lone runtime-dependency exception

Contracts #1 (strategic spec format) and #6 (technical spec format) are enforced via vendored, bundled parser binaries — the parser ships inside the consumer plugin as a zero-dependency JavaScript bundle. This makes those contracts portable, version-locked at the consumer side, offline-capable, and immune to npm registry availability or version drift.

Contract #5 (this one) is enforced via runtime npm install. This is the architectural exception — `ido4dev` was originally a CLI tool (pre-MCP) that grew an MCP server when the plugin/server split happened. The runtime dependency pattern is a fossil of that history rather than an intentional design choice.

Whether contract #5 should evolve toward the bundled pattern (vendoring `@ido4/mcp` into `ido4dev`) is an open architectural question discussed in `~/dev-projects/ido4dev/docs/architecture-evolution-plan.md` §3.5 (single source of truth principle). A bundled runtime would close the failure modes listed above (no SessionStart npm install, no version skew, no registry availability dependency) but introduces release coupling — every `@ido4/mcp` release would require a corresponding `ido4dev` release to refresh the bundle.

For now, runtime npm dependency remains the architecture and contract #5 codifies its surface and constraints.

---

## Related reading

- `~/dev-projects/ido4-suite/docs/interface-contracts.md` — the full contract index this file extends
- `~/dev-projects/ido4-suite/docs/cross-repo-connections.md` — dispatch map and shared credentials, including detailed failure modes
- `~/dev-projects/ido4-suite/docs/release-architecture.md` — the four-layer release pattern and invariants
- `~/dev-projects/ido4dev/docs/architecture-evolution-plan.md` — the active plan reshaping ido4dev
- `~/dev-projects/ido4dev/tests/compatibility.mjs` — the verification implementation
