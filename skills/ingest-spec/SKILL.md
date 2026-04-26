---
name: ingest-spec
description: Ingest a validated technical spec into GitHub — preview the issue mapping under the project's methodology, then create issues on explicit user approval
user-invocable: true
allowed-tools: mcp__plugin_ido4dev_ido4__*, Read, Glob, Grep, Bash(node *)
---

You bridge a validated technical spec (produced by `/ido4specs:validate-spec` or any equivalent authoring flow) to the project's GitHub issues under its chosen methodology. You preview the mapping via `ingest_spec` with `dryRun: true`, wait for explicit user approval, then run `dryRun: false` to create the issues.

**Execute immediately when invoked.** On skill activation, proceed through Stage 0 → Stage 0b → Stage 1 → Stage 2 in order without waiting for additional user instruction. Stop only at the explicit user-gates: (a) Stage 1's "does the mapping look correct?" preview approval before Stage 2, and (b) any condition where the skill's prose says STOP. Do not report "awaiting the skill's instructions" — the body below IS the instructions.

## Pipeline Context

The ido4 authoring pipeline lives in the `ido4specs` plugin, upstream of this one:

| Phase | Skill | Produces |
|---|---|---|
| 1 | `/ido4specs:create-spec` | Technical canvas (`*-tech-canvas.md`) |
| 2 | `/ido4specs:synthesize-spec` | Technical spec (`*-tech-spec.md`) |
| 3a | `/ido4specs:review-spec` | Qualitative review verdict |
| 3b | `/ido4specs:validate-spec` | Structural + content validation |
| **Ingest** | `/ido4dev:ingest-spec` (this skill) | GitHub issues under methodology |

Install `ido4specs` alongside `ido4dev` to run the full authoring flow. This skill only operates on specs that have already been produced and validated upstream — it is not a fallback for unvalidated files.

## Behavioral Guardrail

Never auto-resolve user decisions. The ingestion trigger is an explicit user decision after reviewing the dry-run preview. Do not initialize projects, fix specs, or pick between candidate files without asking.

## Communication

- Report progress at stage boundaries, not individual tool calls.
- Report verdicts, findings, and decisions.
- **Track progress via a task list.** At the start of this skill, create a task list using your task-tracking tool with one entry per stage: *Stage 0: Resolve spec path*, *Stage 0b: Bundled-validator pre-check*, *Stage 1: Ingestion preview (dry-run)*, *Stage 2: Ingest (on user approval)*. Mark each entry `in_progress` when you begin it and `completed` when done.

Use `$ARGUMENTS` as the path to the technical spec file.

---

## Stage 0: Resolve Spec Path and Check Project State

The canonical filename for an `ido4specs`-produced technical spec is `*-tech-spec.md` (see the filename convention in `~/dev-projects/ido4specs/docs/phase-2-execution-plan.md` section 5).

### Resolve the spec path

1. If `$ARGUMENTS` is non-empty, use it as the spec path. Verify the file exists with `Read`. If it does not, report the missing path and STOP.

2. If `$ARGUMENTS` is empty, glob for `specs/*-tech-spec.md` in the current working directory:
   - **No matches**: output exactly
     > I need the path to a validated technical spec. Usage: `/ido4dev:ingest-spec <path-to-spec.md>`. If you haven't produced one yet, install `ido4specs` and run `/ido4specs:synthesize-spec` followed by `/ido4specs:validate-spec`.
     Then STOP.
   - **Exactly one match**: use it. Tell the user: *"Found one technical spec: `{path}`. Proceeding."*
   - **Multiple matches**: list all candidates and ask the user to pick one, then STOP. Do not guess.

### Stage 0b: Bundled-Validator Pre-Check

Once the spec path is resolved — regardless of whether the project is initialized — run the bundled `tech-spec-validator.js` locally to fail fast on structural errors. The validator is a zero-dependency Node CLI that ships with the plugin and is copied to `${CLAUDE_PLUGIN_DATA}/tech-spec-validator.js` by the `SessionStart` hook. This is defense in depth — same parser `ido4specs` used upstream, same result — so format drift between the two plugins is caught before any MCP tool call is made, and independently of project-init state (the user learns structural errors and project-init status in one pass rather than two round trips).

**Preferred invocation:**

```bash
node "${CLAUDE_PLUGIN_DATA}/tech-spec-validator.js" <spec-path>
```

**Fallback if `${CLAUDE_PLUGIN_DATA}` expands to empty** (observed in some Claude Code Bash-tool contexts, especially `--plugin-dir` local-dev mode — the variable is reliably set for `SessionStart` hooks but may not propagate to every Bash tool invocation). Discover the installed bundle and invoke it directly:

```bash
BUNDLE=$(ls ~/.claude/plugins/data/*/tech-spec-validator.js 2>/dev/null | head -1)
node "$BUNDLE" <spec-path>
```

The `SessionStart` hook copies the bundle to `~/.claude/plugins/data/<plugin-dir-name>/tech-spec-validator.js` (where `<plugin-dir-name>` is typically `ido4dev-inline` for local-dev installs or `ido4dev` for marketplace installs). The glob above finds it regardless.

The validator prints a JSON object to stdout with shape `{valid, meta, metrics, project, groups, errors, warnings}`.

**If `valid: true`:** report a concise one-liner ("Structural validation passed: N capabilities, M tasks"), run the silent-failure scan below, then proceed to the project-init check.

**If `valid: false`:** present the errors with task refs. Tell the user to fix the spec upstream (via `/ido4specs:refine-spec` or another `/ido4specs:validate-spec` pass) and re-run. Also perform the project-init check below so the user sees both issues in one pass, then STOP. Do NOT proceed to `ingest_spec` — passing a malformed spec to the ingestion pipeline wastes a tool call and produces a confusing error that originates from a different layer than the root cause.

### Silent-failure scan

The upstream `tech-spec-format` parser is lenient on three input shapes — it emits no errors, but the downstream mapping silently drops or downgrades the affected content. Before you proceed to the dry-run preview, scan the spec for each pattern and surface a warning per match. The user reads the warnings and decides whether to proceed; the skill does not block on them (these are *warnings*, not validation failures).

Run this scan via Bash on the resolved spec path:

```bash
SPEC="<spec-path>"

# Pattern 1 — XL effort buckets to L silently in the mapper.
grep -nE "^[[:space:]]*[Ee]ffort:[[:space:]]*XL\b" "$SPEC" || true

# Pattern 2 — "## Group:" is not recognized; tasks under it become orphans.
# The recognized heading is "## Capability:".
grep -nE "^##[[:space:]]+Group:" "$SPEC" || true

# Pattern 3 — task headings that don't match <PREFIX>-<NN>: get absorbed
# into the previous section's body instead of becoming tasks.
grep -nE "^###[[:space:]]+" "$SPEC" | grep -vE "^[0-9]+:###[[:space:]]+[A-Z]+-[0-9]+:" || true
```

Format any matches as one warning per match in the form `WARN <pattern> at <spec-path>:<line>: <hint>`:

- **XL effort** → `WARN XL effort at <path>:<line>: XL maps to L (Large) silently. Either accept the bucket or split the task before ingestion.`
- **`## Group:` heading** → `WARN unrecognized heading at <path>:<line>: "## Group:" is not parsed; tasks below it will be ingested as orphans (no capability container). Use "## Capability:" instead.`
- **Malformed task heading** → `WARN malformed task ref at <path>:<line>: heading does not match \`### PREFIX-NN: Title\`; the line will be absorbed into the surrounding body and no task will be created.`

If any warnings fire, surface them all and ask the user: *"Spec passed structural validation but {N} silent-failure pattern(s) detected. Proceed to dry-run preview anyway, or fix upstream first?"* The user makes the call.

If no warnings fire, say nothing about the scan — silence is a feature.

**If the bundled validator is unavailable** (`${CLAUDE_PLUGIN_DATA}/tech-spec-validator.js` missing, `node` not in PATH, or the copy step failed silently): report the problem once, note that the pre-check is being skipped, and continue to the project-init check. The MCP tool will still structurally validate the spec at Stage 1; the pre-check just fails slower.

### Check that the project is initialized

Check for `.ido4/project-info.json`. If it does not exist, output:

> The spec is ready but this ido4 project isn't initialized yet (no `.ido4/project-info.json`). Run `/ido4dev:onboard` to initialize — or set up the methodology choice manually — then re-run `/ido4dev:ingest-spec {spec-path}`.

Then STOP. Do NOT initialize the project yourself — methodology choice is a user decision.

---

## Stage 1: Ingestion Preview (dry-run)

1. Call `ingest_spec` with `dryRun: true`, passing the technical spec file path.
2. Present the preview to the user:
   - Methodology detected (from `.ido4/project-info.json`)
   - Number of issues that would be created (capabilities + tasks)
   - Methodology-shaped hierarchy (epics / bets / stories / whatever the active profile uses)
   - Dependency graph summary (root tasks, critical path, cross-capability edges)
   - Any mapper warnings or errors (unresolved `depends_on` refs, unknown metadata values, silent downgrades like `critical` → `High`)
3. Ask: *"The dry-run shows {N} issues would be created under {methodology}. Does the mapping look correct? Proceed to ingestion?"*

Then STOP and wait for the user's explicit approval.

### If the dry-run surfaces errors

`ingest_spec` may return structural or mapping errors even from a spec that passed `/ido4specs:validate-spec` — for example, when the project's methodology profile doesn't support a metadata value the spec uses, or when dependency refs across capabilities fail to resolve in the mapper's topological sort. Report the errors with task refs and ask the user whether to fix the spec upstream (via `/ido4specs:refine-spec` or another `/ido4specs:validate-spec` pass) or abort.

Do NOT attempt to edit the spec from within this skill. Authoring belongs to `ido4specs`; ingestion belongs here.

---

## Stage 2: Ingest (only on explicit user approval)

Only proceed if the user explicitly approved the Stage 1 preview with "yes", "proceed", or equivalent. Ambiguous responses ("looks ok, I guess") mean STOP and re-ask.

1. Call `ingest_spec` with `dryRun: false`, passing the technical spec file path.
2. Report results:
   - Issues created (count, with URLs if available)
   - Any creation failures and their causes (GitHub API errors, rate limits, permission issues)
   - Sub-issue relationships established (parent container → task linkage)
3. Point the user at follow-up ceremonies for the new issues (`/mcp__plugin_ido4dev_ido4__board`, `/mcp__plugin_ido4dev_ido4__standup`, `/mcp__plugin_ido4dev_ido4__health`) so they can start governing the freshly ingested work.

---

## Error Handling

- **Missing spec path AND no glob matches**: stop and ask, as specified in Stage 0.
- **Multiple glob matches**: list candidates, ask the user to pick, STOP. Never guess.
- **Spec file not found at provided path**: report the missing path and stop.
- **Project not initialized**: stop and direct the user to `/ido4dev:onboard` or manual `.ido4/project-info.json` setup.
- **Dry-run mapping errors**: report which tasks or refs caused them. Recommend upstream fix via `ido4specs` skills. Do not retry without user direction.
- **Ingestion failures**: report which issues failed and why. Surface the GitHub error messages directly rather than summarizing.
