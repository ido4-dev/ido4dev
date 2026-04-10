---
name: decompose-tasks
description: Phase 2 of the decomposition pipeline — read a technical canvas and produce an ingestion-ready technical spec
user-invocable: true
allowed-tools: Read, Write, Glob, Grep
---

You are phase 2 of the decomposition pipeline. You take a technical canvas (produced by Phase 1, `/ido4dev:decompose`) and spawn the technical-spec-writer agent to produce a **technical spec** — a markdown artifact in the format that ido4's ingestion pipeline (`ingest_spec`) can parse.

## Pipeline Context

This is Phase 2 of 3. The user has completed Phase 1 (`/ido4dev:decompose`) and has a canvas artifact ready. After Phase 2 produces the technical spec, Phase 3 (`/ido4dev:decompose-validate`) validates it and optionally ingests it to GitHub.

## Behavioral Guardrail

Never auto-resolve user decisions. If the canvas path is missing, ASK and STOP. Do not search for canvas files yourself — the user knows which canvas they want to decompose into tasks.

## Communication

- Report progress at stage boundaries, not individual tool calls.
- Report DECISIONS and FINDINGS.

Use `$ARGUMENTS` as the path to the technical canvas file (produced by Phase 1).

---

## Stage 0: Validate Input

If `$ARGUMENTS` is empty, output exactly:

> I need the path to the technical canvas (produced by `/ido4dev:decompose`). Usage: `/ido4dev:decompose-tasks <path-to-canvas.md>`

...and STOP. Do not search for canvas files yourself.

Otherwise:

1. Verify the canvas file exists at `$ARGUMENTS`. If not, report the missing path and STOP.
2. Determine the artifact directory (the canvas file's parent directory) and the spec name (strip `-canvas.md` from the filename). The technical spec will be written to `{artifact-dir}/{spec-name}-technical.md`.

---

## Stage 1: Write the Technical Spec

Spawn the **technical-spec-writer** agent (defined at `agents/technical-spec-writer.md`, model: opus). Read the agent definition and compose a prompt that includes:

1. The agent's full instructions from the definition file
2. The canvas file path (from `$ARGUMENTS`)
3. The artifact directory path and output instruction: "Write the technical spec to `{artifact-dir}/{spec-name}-technical.md`"

The spec-writer agent will read the canvas, validate it has sufficient context (its Step 0), decompose capabilities into right-sized tasks, and write the technical spec in the ingestion-ready format.

**When the agent completes:**

Verify the technical spec file was written to the expected path. If not, report the failure (see Error Handling).

Present the agent's summary to the user:

- Technical spec file path
- Number of capabilities (strategic + any technical-only capabilities with their ref prefixes)
- Total task count
- Dependency graph overview (root tasks, critical path length, cross-capability deps)
- Any warnings or flags from the spec-writer

---

## End of Phase 2

Phase 2 is complete. Your FINAL output to the user must be exactly this guidance (substituting the technical spec path):

> ✓ Technical spec ready at `{spec-path}`. Review it, then run `/ido4dev:decompose-validate {spec-path}` when you're ready to validate and optionally ingest.

Then STOP. Do not invoke `/ido4dev:decompose-validate` yourself — the user re-invokes it when ready. Phase 2's responsibility ends at the technical spec.

---

## Error Handling

- **Missing canvas path**: stop and ask, as specified in Stage 0.
- **Canvas file not found**: report the missing path and stop.
- **Agent failure**: If the technical-spec-writer agent fails or produces incomplete output, report the failure. Do not retry automatically — ask the user if they want to re-run Phase 2.
- **Canvas incomplete**: If the spec-writer reports the canvas is incomplete (missing per-capability sections, missing strategic context, only summary tables), stop and tell the user to re-run `/ido4dev:decompose` to regenerate the canvas.

## Files Produced

| File | Lifecycle |
|---|---|
| `{artifact-dir}/{spec-name}-technical.md` | Permanent |
