---
name: decompose-tasks
description: Phase 2 of the decomposition pipeline — read a technical canvas and produce an ingestion-ready technical spec
user-invocable: true
allowed-tools: Read, Write, Glob, Grep
---

You are phase 2 of the decomposition pipeline. You take a technical canvas (produced by Phase 1, `/ido4dev:decompose`) and produce a **technical spec** — a markdown artifact in the format that ido4's ingestion pipeline (`ingest_spec`) can parse. Phase 2 is a pure transform: canvas in, technical spec out. You do the work inline, following the template and rules in `agents/technical-spec-writer.md`.

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

## Stage 1: Write the Technical Spec (inline)

`agents/technical-spec-writer.md` is a **template and rules reference**, not a subagent to spawn. Read it now to internalize:

1. The technical spec output format (exact structure the `spec-parser.ts` parser consumes — project header, capability headings, task metadata format, task-ref pattern)
2. The Goldilocks principle for task sizing (not too small, not too big, one coherent concept per task)
3. Metadata assessment rules (effort S/M/L/XL, risk low/medium/high/critical, type feature/bug/research/infrastructure, ai full/assisted/pair/human — all grounded in the canvas's complexity assessment)
4. Technical capability rules (when to create PLAT-/INFRA-/TECH- prefixed capabilities for shared infrastructure that doesn't map to strategic capabilities)
5. The critical rules — every metadata value traceable to canvas, stakeholder attributions preserved, success conditions code-verifiable, output parseable by `spec-parser.ts`

Phase 2 is a pure transform — canvas in, technical spec out. No exploration needed. No subagents needed. Main Claude (you) does the work directly.

### Stage 1a: Read and validate the canvas

Read the canvas file at `$ARGUMENTS` using the `Read` tool. Before decomposing anything, verify the canvas has:

- Per-capability sections (`## Capability:` headings — not just summary tables)
- Strategic context carried forward in each capability (descriptions + success conditions from the strategic spec, not one-line summaries)
- Cross-cutting concern mapping with per-concern detail (not just a summary table)
- Dependency layers or ordering information

If any are missing, STOP and report: *"Canvas is incomplete — [specific missing element]. Re-run `/ido4dev:decompose` to regenerate the canvas before continuing Phase 2."* Do NOT attempt to produce tasks from an incomplete canvas — the quality will be unacceptable and the downstream validation in Phase 3 will flag it anyway.

### Stage 1b: Decompose and write the technical spec

Following the template and rules in `agents/technical-spec-writer.md`:

1. **Identify shared infrastructure** across capabilities — types, interfaces, services, database changes that multiple capabilities need. Create infrastructure tasks in the most-relevant capability (the earliest in the dependency chain). If the canvas reveals shared infrastructure that does NOT map to any strategic capability, create a technical-only capability with a `PLAT-`, `INFRA-`, or `TECH-` prefix placed BEFORE strategic capabilities.

2. **Decompose each strategic capability** in strategic dependency order (must-have groups first, then should-have, then nice-to-have; within priority, leaves first). For each capability:
   - Review the canvas analysis: relevant modules/integration targets, patterns found, complexity assessment, risk factors
   - Determine task granularity using the Goldilocks principle
   - Write each task with:
     - Specific file paths and patterns from the canvas (not vague like "update the service")
     - Stakeholder context carried forward verbatim ("Per Marcus: needs idempotency key")
     - Cross-cutting constraints woven in (performance, security, observability)
     - Code-verifiable success conditions (at least 2 per task)
   - Assign metadata grounded in the canvas complexity assessment — do NOT guess
   - Set dependencies (functional from strategic spec + code-level from canvas)

3. **Validate the dependency graph** before writing:
   - No circular dependencies
   - All `depends_on` references point to tasks that exist in the spec
   - Topological order makes sense (can you actually build this in this order?)
   - Shared infrastructure tasks appear before the tasks that need them

4. **Final quality check per task**:
   - Description ≥200 characters with substantive content
   - At least 2 success conditions
   - Effort/risk consistent with canvas complexity assessment
   - Type correct (don't classify infrastructure as feature)
   - AI suitability reflects actual code patterns (not wishful thinking)
   - Every capability description includes group context (*"Part of [Group Name] ({priority}) — [why this group matters]"*)
   - Every task with applicable cross-cutting concerns references them

Use the `Write` tool to write the complete technical spec to `{artifact-dir}/{spec-name}-technical.md`. The output MUST be parseable by `spec-parser.ts` — exact heading patterns, exact metadata keys and allowed values, exact blockquote conventions.

### Stage 1c: Verify and summarize

1. Verify the technical spec file was written to the expected path.
2. Count capabilities and tasks in the written file:
   - `grep -c '^## Capability:' {path}` — capability count (should match canvas count, plus any technical-only capabilities you added)
   - `grep -c '^### [A-Z]' {path}` — task count
3. Present the Stage 1 summary to the user:
   - Technical spec file path and line count
   - Number of capabilities (strategic + any technical-only with their ref prefixes)
   - Total task count
   - Dependency graph overview: root tasks (no deps), critical path length, any cross-capability dependencies
   - Any warnings or flags you surfaced during synthesis (e.g., "STOR-05 is marked high-risk — limited chaos-test bandwidth is a scoping concern for scheduling")

---

## End of Phase 2

Phase 2 is complete. Your FINAL output to the user must be exactly this guidance (substituting the technical spec path):

> ✓ Technical spec ready at `{spec-path}`. Review it, then run `/ido4dev:decompose-validate {spec-path}` when you're ready to validate and optionally ingest.

Then STOP. Do not invoke `/ido4dev:decompose-validate` yourself — the user re-invokes it when ready. Phase 2's responsibility ends at the technical spec.

---

## Error Handling

- **Missing canvas path**: stop and ask, as specified in Stage 0.
- **Canvas file not found**: report the missing path and stop.
- **Synthesis failure**: If the technical spec you produce is incomplete (missing capability sections, missing task metadata, malformed), report the failure. Do not retry automatically — ask the user if they want to re-run Phase 2 or abort.
- **Canvas incomplete**: If Stage 1a's canvas validation fails (missing per-capability sections, missing strategic context, only summary tables), stop and tell the user to re-run `/ido4dev:decompose` to regenerate the canvas.

## Files Produced

| File | Lifecycle |
|---|---|
| `{artifact-dir}/{spec-name}-technical.md` | Permanent |
