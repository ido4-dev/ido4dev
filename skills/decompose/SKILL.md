---
name: decompose
description: Phase 1 of the decomposition pipeline — parse a strategic spec, detect project mode, and produce a technical canvas via code analysis
user-invocable: true
allowed-tools: mcp__plugin_ido4dev_ido4__*, Read, Write, Glob, Grep
---

You are phase 1 of the decomposition pipeline. You take a strategic spec (produced by ido4shape), validate it, detect the project mode, and spawn the code-analyzer agent to produce a **technical canvas** — a markdown artifact mapping strategic capabilities to concrete codebase knowledge.

## Pipeline Context

Decomposition runs in three user-invocable phases, each producing a review-worthy artifact. Each phase ends at its natural boundary so the user can review before proceeding.

| Phase | Skill | Produces |
|---|---|---|
| 1 (this skill) | `/ido4dev:decompose` | Technical canvas |
| 2 | `/ido4dev:decompose-tasks` | Technical spec |
| 3 | `/ido4dev:decompose-validate` | Validation report + optional ingestion |

## Behavioral Guardrail

When something is missing (spec file path, methodology choice, project configuration), ASK the user and STOP. Never auto-search, auto-initialize, or auto-resolve. The user knows which spec they want to decompose.

## Communication

- Report progress at stage boundaries, not individual tool calls.
- Report DECISIONS and FINDINGS.
- Be concise — highlight surprises, not expected patterns.
- **Track progress via a task list.** At the start of this skill, create a task list (using `TodoWrite` or your equivalent task-tracking tool) with one entry per stage and sub-stage: *Stage 0: Parse strategic spec*, *Stage 0.5: Determine artifact dir and project mode*, *Stage 1a: Explore integration targets in parallel*, *Stage 1b: Read the strategic spec*, *Stage 1c: Synthesize technical canvas*, *Stage 1d: Verify and write canvas*. Mark each entry `in_progress` when you begin it and `completed` when done. This gives the user visible progress through long-running work.

Use `$ARGUMENTS` as the path to the strategic spec file.

---

## Stage 0: Parse the Strategic Spec

If `$ARGUMENTS` is empty, output exactly:

> I need the path to the strategic spec file. Usage: `/ido4dev:decompose <path-to-spec.md>`

...and STOP. Do not search for spec files yourself — the user knows which spec they want.

Otherwise:

1. Read the strategic spec file at `$ARGUMENTS` with the `Read` tool. If the file does not exist, report the missing path and STOP.
2. Your next action MUST be to call `parse_strategic_spec` with the file contents. Do not summarize the spec before calling the parser — the parser is the only authoritative source of structured data (groups, capabilities, dependencies, priorities).
3. Review the parse result:
   - If there are **errors**, stop and report them. The strategic spec must be fixed before Phase 1 can proceed.
   - If there are **warnings**, report them but continue.
4. Present the Stage 0 summary to the user with all of the following:
   - Project name
   - Capabilities grouped by ido4shape groups (with count per group)
   - Group priorities (must-have / should-have / nice-to-have)
   - Dependency structure summary (number of edges, any cross-group dependencies)

---

## Stage 0.5: Determine Artifact Directory and Detect Project Mode

### Artifact directory

Determine the directory where Phase 1 and Phase 2 artifacts will be written:

1. If `specs/` exists in the project root, use it
2. Else if `docs/specs/` exists, use it
3. Else if `docs/` exists, use `docs/specs/` (create it)
4. Else create `specs/`

State the chosen directory explicitly to the user:

> Artifacts will be written to `{dir}/`.

### Project mode

Determine the project mode:

1. Glob for source directories (`src/`, `app/`, `lib/`, `packages/`)
2. Check for project manifest files with dependencies (`package.json` with `dependencies`, `go.mod`, `Cargo.toml`, `pyproject.toml`)
3. Count non-config source files

**Mode assignment:**

- Source code exists → `existing`
- No source code, but the parsed strategic spec references integration targets (external systems, APIs, existing repos, named services in project context, cross-cutting concerns, or capability descriptions) → `greenfield-with-context`
- No source code, no integration targets → `greenfield-standalone`

State the mode explicitly to the user using the exact taxonomy name:

> Detected mode: `{existing | greenfield-with-context | greenfield-standalone}`. {One sentence of explanation.}

---

## Stage 1: Analyze Integration Targets and Write the Canvas

`agents/code-analyzer.md` is a **canvas template and rules reference** — read it for the canvas structure, per-capability template, context-preservation rules, and mode-specific guidance. Do NOT spawn it as a subagent; you are the orchestrator AND synthesizer for Stage 1.

### Stage 1a: Gather integration target summaries (parallel)

Determine integration targets based on the detected project mode:

- **`existing`**: the current project's codebase is the target
- **`greenfield-with-context`**: targets are the external systems, repos, or services the strategic spec references (e.g., sibling plugin repos, upstream APIs, shared libraries)
- **`greenfield-standalone`**: no integration targets — skip to Stage 1b

Spawn **parallel `Explore` subagents** (Claude Code's built-in subagent type), one per target. Each brief MUST be **under 300 tokens** and contains:

1. Target path and name
2. One sentence explaining why it matters (e.g., "The PLUG group of capabilities modifies this plugin")
3. Exactly what to return: tech stack, directory structure, key modules with file paths, architectural patterns, relevant conventions, and anything specifically relevant to the strategic spec's requirements
4. Size cap: "Return in under 2000 words"

Do NOT pass the full strategic spec or the code-analyzer template into the Explore briefs — keep them lean and focused. The subagents only need enough context to explore their target intelligently.

Run all Explore subagents in a **single message with multiple tool uses** for true parallelism.

### Stage 1b: Read the strategic spec

Use the `Read` tool to load the strategic spec text directly. You need the raw text for verbatim context preservation — capability descriptions, success conditions, stakeholder attributions, group descriptions, constraints, non-goals. Summarizing is not sufficient; the downstream spec-writer receives ONLY the canvas and needs strategic context preserved word-for-word.

### Stage 1c: Synthesize the canvas inline

Compose the complete technical canvas following the template in `agents/code-analyzer.md`:

- Use the Explore subagents' summaries for **Ecosystem Architecture** / **Codebase Overview** and for **Integration Target Analysis** / **Codebase Analysis** per capability
- Use the strategic spec text (from Stage 1b) for verbatim context preservation — do NOT summarize or rephrase capability descriptions, success conditions, stakeholder attributions, or group descriptions
- Use your own analysis for **Cross-Cutting Concern Mapping**, **Dependency Layers**, **Risk Assessment Summary**, **Discoveries & Adjustments**, and the project-level **What Exists vs What's Built** rollup

**Every strategic capability MUST have its own `## Capability:` section.** No summary tables, no collapsing, no shortcuts. The canvas is the context preservation layer for the entire pipeline — Phase 2 (`decompose-tasks`) receives ONLY this canvas, not the strategic spec. If the canvas loses context, everything downstream fails.

Write the complete canvas to `{artifact-dir}/{spec-name}-canvas.md` using the `Write` tool.

### Stage 1d: Verify and summarize

1. Verify the canvas file was written to the expected path.
2. Count `## Capability:` sections in the written canvas using `grep -c '^## Capability:' {path}`. The count MUST match the strategic capability count from Stage 0. If it doesn't, the canvas is incomplete — report the mismatch and ask the user whether to retry Stage 1c or abort.
3. On successful verification, present the Stage 1 summary to the user:
   - Canvas file path and line count
   - Number of capabilities analyzed
   - Key findings: what exists vs what's new
   - Shared infrastructure discovered across capabilities
   - Any surprises or adjustments to the strategic dependency order
   - Cross-cutting concern coverage

---

## End of Phase 1

Phase 1 is complete. Your FINAL output to the user must be exactly this guidance (substituting the canvas path):

> ✓ Canvas ready at `{canvas-path}`. Review it, then run `/ido4dev:decompose-tasks {canvas-path}` when you're ready to produce the technical spec.

Then STOP. Do not invoke `/ido4dev:decompose-tasks` yourself — the user re-invokes it when ready. This is a hard boundary: Phase 1's responsibility ends at the canvas. Phase 2 is a separate user decision.

---

## Error Handling

- **Missing strategic spec path**: stop and ask, as specified in Stage 0.
- **Strategic spec file not found**: report the missing path and stop.
- **Strategic spec parse errors**: stop. Report errors. User must fix the strategic spec.
- **Subagent or synthesis failure**: If an Explore subagent fails, or the canvas synthesis is incomplete (missing capability sections, truncated content), report the failure with specifics. Do not retry automatically — ask the user if they want to re-run Stage 1 or abort.
- **Codebase exploration gaps**: The code-analyzer will note gaps in the canvas. Phase 2's spec-writer will create research tasks for those gaps.

## Files Produced

| File | Lifecycle |
|---|---|
| `{artifact-dir}/{spec-name}-canvas.md` | Permanent (kept for history and re-decomposition) |
