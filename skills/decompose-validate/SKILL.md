---
name: decompose-validate
description: Phase 3 of the decomposition pipeline — validate a technical spec structurally, preview ingestion, and optionally create GitHub issues
user-invocable: true
allowed-tools: mcp__plugin_ido4dev_ido4__*, Read, Glob, Grep
---

You are phase 3 of the decomposition pipeline. You take a technical spec (produced by Phase 2, `/ido4dev:decompose-tasks`) and run it through structural review, ingestion preview, and optional ingestion to GitHub. Phase 3 Stage 1 (structural review) is pure validation — format compliance, content quality, and dependency graph integrity. You do the review inline, following the rules in `agents/spec-reviewer.md`.

## Pipeline Context

This is Phase 3 of 3. The user has completed Phase 1 (canvas) and Phase 2 (technical spec). Phase 3 validates the spec against the parser contract, previews how it would map to GitHub issues, and — on explicit user approval — creates the issues.

## Behavioral Guardrail

Never auto-resolve user decisions. Methodology choice, project initialization, and the final ingestion trigger are all user decisions. Do not search for spec files yourself.

## Communication

- Report progress at stage boundaries, not individual tool calls.
- Report verdicts, findings, and decisions.
- **Track progress via a task list.** At the start of this skill, create a task list (using `TodoWrite` or your equivalent task-tracking tool) with one entry per sub-stage: *Stage 1a: Read technical spec*, *Stage 1b: Format compliance review*, *Stage 1c: Quality assessment review*, *Stage 1d: Governance implications check*, *Stage 1e: Produce review report*, and (if the verdict is PASS and the skill proceeds) *Stage 2: Ingestion preview*, *Stage 3: Ingest (only on explicit user approval)*. Mark each entry `in_progress` when you begin it and `completed` when done. This gives the user visible progress through long-running work.

Use `$ARGUMENTS` as the path to the technical spec file (produced by Phase 2).

---

## Stage 0: Validate Input

If `$ARGUMENTS` is empty, output exactly:

> I need the path to the technical spec (produced by `/ido4dev:decompose-tasks`). Usage: `/ido4dev:decompose-validate <path-to-technical.md>`

...and STOP. Do not search for spec files yourself.

Otherwise, verify the technical spec file exists at `$ARGUMENTS`. If not, report the missing path and STOP.

---

## Stage 1: Structural Review (inline, no project config needed)

`agents/spec-reviewer.md` is a **review protocol and rules reference**, not a subagent to spawn. Read it now to internalize:

1. The two-stage review protocol (format compliance first, then quality assessment)
2. Format compliance checks (project header, capability headings, task headings, ref pattern, metadata keys and values, `depends_on` references, no circular dependencies)
3. Quality assessment checks (description substance, code-grounding, success condition specificity, effort/risk grounding, AI-suitability appropriateness, capability coherence, dependency graph sense)
4. Governance implications check (`ai: human`, `risk: critical`, cross-capability deps)
5. Validation rules (classify issues as Error / Warning / Suggestion, independently verify each issue before reporting)
6. Output format (Spec Review Report with summary, errors, warnings, suggestions, governance notes, dependency graph)

Phase 3 Stage 1 is pure validation — format + quality + graph integrity. No synthesis. No subagents. Main Claude (you) does the review directly.

### Stage 1a: Read the technical spec

Read the technical spec file at `$ARGUMENTS` using the `Read` tool. You will analyze it against the review protocol in `agents/spec-reviewer.md`.

### Stage 1b: Format compliance review

Systematically check every structural element against the parser's exact expectations (from `agents/spec-reviewer.md` Stage 1: Format Compliance):

- Project header: exactly one `#` heading with `>` description
- Capability headings: `## Capability: Name` format, `>` metadata with `size` and `risk`
- Task headings: `### REF: Title` where REF matches `[A-Z]{2,5}-\d{2,3}[A-Z]?` (letters + optional suffix per `@ido4/mcp` 0.7.1)
- Task prefix matches parent capability prefix (e.g., `NCO-` tasks under "Notification Core")
- Metadata keys (exact, lowercase): `effort`, `risk`, `type`, `ai`, `depends_on`
- Metadata values from allowed sets: effort (S/M/L/XL), risk (low/medium/high/critical), type (feature/bug/research/infrastructure), ai (full/assisted/pair/human)
- All `depends_on` references point to existing task IDs in the document
- No circular dependency chains (trace the full graph)

Use `Grep` to verify counts and catch regex violations quickly. Use `Read` with line offsets to spot-check specific sections.

### Stage 1c: Quality assessment review

From `agents/spec-reviewer.md` Stage 2: Quality Assessment. For each task:

- Description ≥200 characters with substantive content (not just title restatement)
- Descriptions reference specific code paths, services, or patterns (technical specs should be codebase-grounded)
- Success conditions present, specific, independently verifiable, code-testable
- Effort estimates grounded in code reality
- Risk assessments reflect actual codebase complexity
- AI suitability appropriate (external integrations shouldn't be `full`; schema definitions can be `full`)
- Capabilities coherent (2-8 tasks, tasks related to capability purpose)
- Dependency graph sensible (critical path makes sense, minimal cross-capability deps)

### Stage 1d: Governance implications check

Review values with downstream governance impact:

- `ai: human` blocks start transition — is this intentional and justified?
- `risk: critical` maps to High + label — does it truly warrant elevated attention?
- Cross-capability dependencies create coordination requirements — are they minimized?
- Effort distribution across capabilities — any capability disproportionately heavy?

### Stage 1e: Produce the review report

Classify each issue found as **Error** (will cause ingestion to fail), **Warning** (won't fail but indicates a quality problem), or **Suggestion** (not wrong but could be better). Before reporting any issue, independently verify it — false positives erode trust.

Present the review report to the user in the exact format from `agents/spec-reviewer.md`:

```markdown
# Spec Review Report

## Summary
- File: [path]
- Capabilities: [N] | Tasks: [N]
- Errors: [N] | Warnings: [N] | Suggestions: [N]
- Verdict: [PASS | PASS WITH WARNINGS | FAIL]

## Errors
[Each error with task ref, line reference, explanation, fix suggestion]

## Warnings
[Each warning with context and recommendation]

## Suggestions
[Each suggestion with reasoning]

## Governance Notes
[Values that will trigger specific BRE behavior]

## Dependency Graph
- Root tasks: [list]
- Critical path: [chain]
- Cross-capability deps: [list]
- Cycles: [none | details]
```

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
- **Review synthesis failure**: If the review report is incomplete or you cannot reach a verdict, report the failure specifically. Do not retry automatically — ask the user if they want to re-run Phase 3 or abort.
- **Dry-run validation errors**: Report which tasks or dependencies caused issues. Suggest fixes in the technical spec and ask the user to update it and re-run `/ido4dev:decompose-validate`.
- **Ingestion failures**: Report which issues failed and why. Surface the GitHub errors directly.
