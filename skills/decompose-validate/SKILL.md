---
name: decompose-validate
description: Phase 3 of the decomposition pipeline — validate a technical spec structurally, preview ingestion, and optionally create GitHub issues
user-invocable: true
allowed-tools: mcp__plugin_ido4dev_ido4__*, Read, Glob, Grep
---

You are phase 3 of the decomposition pipeline. You take a technical spec (produced by Phase 2, `/ido4dev:decompose-tasks`) and run it through structural review, ingestion preview, and optional ingestion to GitHub.

## Pipeline Context

This is Phase 3 of 3. The user has completed Phase 1 (canvas) and Phase 2 (technical spec). Phase 3 validates the spec against the parser contract, previews how it would map to GitHub issues, and — on explicit user approval — creates the issues.

## Behavioral Guardrail

Never auto-resolve user decisions. Methodology choice, project initialization, and the final ingestion trigger are all user decisions. Do not search for spec files yourself.

## Communication

- Report progress at stage boundaries, not individual tool calls.
- Report verdicts, findings, and decisions.

Use `$ARGUMENTS` as the path to the technical spec file (produced by Phase 2).

---

## Stage 0: Validate Input

If `$ARGUMENTS` is empty, output exactly:

> I need the path to the technical spec (produced by `/ido4dev:decompose-tasks`). Usage: `/ido4dev:decompose-validate <path-to-technical.md>`

...and STOP. Do not search for spec files yourself.

Otherwise, verify the technical spec file exists at `$ARGUMENTS`. If not, report the missing path and STOP.

---

## Stage 1: Structural Review (no project config needed)

Spawn the **spec-reviewer** agent (defined at `agents/spec-reviewer.md`, model: sonnet). Read the agent definition and compose a prompt that includes:

1. The agent's full instructions from the definition file
2. The technical spec file path (from `$ARGUMENTS`)
3. Instruction: "Produce a structured review report"

The spec-reviewer will check format compliance, content quality, dependency graph integrity, and governance implications.

**When the agent completes:**

Present the review findings to the user:

- Verdict: PASS / PASS WITH WARNINGS / FAIL
- Error count, warning count, suggestion count
- Any governance-impacting values (`ai: human`, `risk: critical`, heavy cross-capability deps)

### Handle the verdict

- **FAIL**: Report the errors clearly. Tell the user: *"The spec has errors that will block ingestion. Fix them in the technical spec and re-run `/ido4dev:decompose-validate {spec-path}`."* Then STOP. Do not proceed to Stage 2.
- **PASS WITH WARNINGS**: Present the warnings. Ask the user: *"Fix these warnings first, or proceed to the ingestion preview (dry-run)?"* Then STOP and wait for the user's explicit choice.
- **PASS**: Proceed directly to Stage 2.

---

## Stage 2: Ingestion Preview (requires initialized project)

Check if the ido4 project is initialized: look for `.ido4/project-info.json`.

### If NOT initialized

Output:

> The spec passed structural review. Before previewing the issue mapping, your ido4 project needs initialization (methodology choice, GitHub repo configuration). Run `/ido4dev:onboard` to initialize, or set it up manually. The validated spec at `{spec-path}` is ready whenever you are.

Then STOP. Do NOT initialize the project yourself — methodology choice is a user decision.

### If initialized

1. Call `ingest_spec` with `dryRun: true` passing the technical spec content.
2. Present the preview to the user:
   - Methodology detected
   - Number of issues that would be created (capabilities + tasks)
   - Methodology-shaped hierarchy (epic/bet/story containers)
   - Dependency graph summary
   - Any validation issues from the mapper (e.g., unknown dependency refs)
3. Ask: *"The dry-run shows {N} issues would be created under {methodology}. Does the mapping look correct? Proceed to ingestion?"*

Then STOP and wait for the user's explicit approval.

---

## Stage 3: Ingest (only on explicit user approval)

Only proceed if the user explicitly approved the Stage 2 preview with "yes", "proceed", or equivalent.

1. Call `ingest_spec` with `dryRun: false` passing the technical spec content.
2. Report results: issues created, any failures, sub-issue relationships.
3. Provide the GitHub URLs for created issues if available.

---

## Error Handling

- **Missing spec path**: stop and ask, as specified in Stage 0.
- **Spec file not found**: report the missing path and stop.
- **Agent failure (spec-reviewer)**: Report the failure. Do not retry automatically — ask the user if they want to re-run.
- **Dry-run validation errors**: Report which tasks or dependencies caused issues. Suggest fixes in the technical spec and ask the user to update it and re-run `/ido4dev:decompose-validate`.
- **Ingestion failures**: Report which issues failed and why. Surface the GitHub errors directly.
