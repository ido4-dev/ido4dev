---
name: ingest-spec
description: Ingest a validated technical spec into GitHub — preview the issue mapping under the project's methodology, then create issues on explicit user approval
user-invocable: true
allowed-tools: mcp__plugin_ido4dev_ido4__*, Read, Glob, Grep
---

You bridge a validated technical spec (produced by `/ido4specs:validate-spec` or any equivalent authoring flow) to the project's GitHub issues under its chosen methodology. You preview the mapping via `ingest_spec` with `dryRun: true`, wait for explicit user approval, then run `dryRun: false` to create the issues.

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
- **Track progress via a task list.** At the start of this skill, create a task list using your task-tracking tool with one entry per stage: *Stage 0: Resolve spec path*, *Stage 1: Ingestion preview (dry-run)*, *Stage 2: Ingest (on user approval)*. Mark each entry `in_progress` when you begin it and `completed` when done.

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
3. Point the user at follow-up skills for the new issues (`/ido4dev:board`, `/ido4dev:standup`, `/ido4dev:health`) so they can start governing the freshly ingested work.

---

## Error Handling

- **Missing spec path AND no glob matches**: stop and ask, as specified in Stage 0.
- **Multiple glob matches**: list candidates, ask the user to pick, STOP. Never guess.
- **Spec file not found at provided path**: report the missing path and stop.
- **Project not initialized**: stop and direct the user to `/ido4dev:onboard` or manual `.ido4/project-info.json` setup.
- **Dry-run mapping errors**: report which tasks or refs caused them. Recommend upstream fix via `ido4specs` skills. Do not retry without user direction.
- **Ingestion failures**: report which issues failed and why. Surface the GitHub error messages directly rather than summarizing.
