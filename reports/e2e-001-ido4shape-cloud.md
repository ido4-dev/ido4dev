# E2E Test Report: e2e-001-ido4shape-cloud

**Skill tested:** `/ido4dev:decompose`
**Project:** ido4shape-enterprise-cloud
**Date:** 2026-04-09
**Status:** Findings implemented (2026-04-09). Pending E2E re-test to validate fixes.

---

## Test Setup

- **Test session:** `/Users/bogdanionutcoman/dev-projects/ido4shape-cloud/` with ido4dev plugin loaded
- **Monitor session:** `/Users/bogdanionutcoman/dev-projects/ido4dev/` (this repo)
- **Strategic spec:** `ido4shape-enterprise-cloud-spec.md`

---

## Pipeline Summary

| Stage | Status | Notes |
|-------|--------|-------|
| Stage 0: Parse Strategic Spec | Complete | Clean parse: 0 errors, 0 warnings. 5 groups, 25 capabilities, 45 edges. |
| Stage 1: Analyze Codebase | Complete | Greenfield — analyzed ido4shape plugin + ido4-MCP for integration context. Canvas written (333 lines). |
| Stage 2: Write Technical Spec | Complete | 660 lines, 36 tasks across 26 capabilities. No review offered before Stage 3. |
| Stage 3a: Parse Validation | Not run | Tool doesn't exist yet — needs `validate_spec` MCP tool (OBS-20). |
| Stage 3b: Dry-run Ingestion | Failed | `CONFIGURATION_ERROR` — project not initialized. Skill tried to auto-fix (OBS-21). |
| Stage 4: Ingest | Not started | Blocked on project initialization (methodology choice). |

---

## Observations

### OBS-01 — Behavioral Drift — Medium

- **When:** Skill startup, before Stage 0
- **What happened:** No `$ARGUMENTS` path was provided. The skill said "I need the path to the strategic spec file" then immediately searched for it on its own.
- **What was expected:** Per `skills/decompose/SKILL.md:28` — *"If no path is provided, ask the user for it."* The skill should have asked the user, not auto-searched.
- **Evidence:** Skill output: "I need the path to the strategic spec file to start the decomposition pipeline. Let me check what's available in the project." — then ran a search instead of prompting the user.
- **Fix candidate:** Skill definition at `skills/decompose/SKILL.md:28`. The instruction "If no path is provided, ask the user for it" may need stronger phrasing (e.g., "You MUST ask the user and WAIT for their response") to prevent Claude from auto-resolving.

### OBS-02 — Quality Issue — Low

- **When:** Stage 0, reading the spec
- **What happened:** The skill used `cat` via Bash to read the spec file (`$ cat /Users/.../ido4shape-enterprise-cloud-spec.md`) instead of the `Read` tool.
- **What was expected:** The skill's `allowed-tools` list includes `Read`. Claude Code best practices require using `Read` over `cat`.
- **Evidence:** Tool call shown as `$ cat /Users/bogdanionutcoman/dev-projects/ido4shape-cloud/ido4shape-enterprise-cloud-spec.md`
- **Fix candidate:** Not a skill definition issue — this is Claude's tool selection behavior. Could add explicit instruction in skill: "Use the Read tool to read files, never cat."

### OBS-03 — Quality Issue — Medium

- **When:** Stage 0 (before calling `parse_strategic_spec`) and Stage 3 (before calling `ingest_spec`)
- **What happened:** The skill ran a Node.js script via Bash (`node -e "const fs = require('fs')…"`) — appears to be writing the spec content to a temp file. Multiple intermediate reads happened before the MCP call (Read 2 files, Read 1 file, Bash node, cat, then finally MCP call). **Recurred in Stage 3:** same pattern — `cat` via Bash to read the technical spec into a shell variable before calling `ingest_spec`.
- **What was expected:** Per `skills/decompose/SKILL.md:21-22` — Stage 0 is: (1) Read the spec, (2) Call `parse_strategic_spec` with the content. Two steps. The actual behavior shows 5-6 intermediate steps. Same for Stage 3: read the spec, call `ingest_spec` with content and `dryRun: true`.
- **Evidence:** Stage 0 sequence: "Read 1 file" -> "Read 2 files" -> "Read 1 file" -> "Bash(node -e ...)" -> "$ cat ..." -> "parse_strategic_spec (MCP)". Stage 3: `Bash(SPEC_CONTENT=$(cat .../ido4shape-enterprise-cloud-technical.md) && echo "Read ${#SPEC_CONTENT} chars")` before calling `ingest_spec`.
- **Pattern:** This is a **recurring behavior** — the skill consistently uses Bash/cat workarounds to read file content before passing it to MCP tools. Suggests a systematic issue with how Claude passes large content to MCP tool parameters, not a one-off.
- **Fix candidate:** Investigate whether MCP tools can accept a file path instead of inline content (reduces payload size). Also add explicit instruction in the skill: "Use the Read tool to read files, then pass the content directly to the MCP tool — do not use Bash, cat, or shell variables as intermediaries."

### OBS-04 — Design Gap — High

- **When:** Cross-stage architecture (applies to Stages 1–3)
- **What happened:** The decompose skill describes all stage work inline — the orchestrator executes everything itself within a single context.
- **What was expected:** Three agents exist that describe themselves as stages of the decompose pipeline:
  - `agents/code-analyzer.md` — *"Use this agent as Stage 1 of the decomposition pipeline"* (specifies `model: opus`)
  - `agents/technical-spec-writer.md` — Stage 2
  - `agents/spec-reviewer.md` — Stage 3
  
  But `skills/decompose/SKILL.md` never instructs the orchestrator to spawn these agents. The wiring is missing.
- **Impact:**
  - **Context bloat:** Stage 1 (code-analyzer) reads many files — without agent isolation, this bloats the orchestrator's context window, degrading quality in later stages.
  - **Model selection ignored:** code-analyzer specifies `model: opus` but the orchestrator may run on a different model.
  - **Review boundaries blurred:** The skill defines user review points between stages (e.g., "ask the user if they want to review the canvas before proceeding"). These are natural agent handoff points that aren't being used as such.
- **Fix candidate:** `skills/decompose/SKILL.md` — Stages 1, 2, and 3 should explicitly instruct: "Spawn the `code-analyzer` / `technical-spec-writer` / `spec-reviewer` agent" with context passing between stages. Stage 0 (parse) and Stage 4 (ingest) are lightweight enough to stay in the orchestrator.

### OBS-05 — Quality Issue — Medium

- **When:** Stage 0, after `parse_strategic_spec` returned
- **What happened:** The skill used `cat` via Bash to read internal Claude tool-result cache files (`cat /Users/.../.claude/projects/.../tool-results/toolu_01NTZa…`) — three separate `cat` calls to inspect the MCP response.
- **What was expected:** The MCP tool result should be directly available in the conversation context. The skill shouldn't need to read internal cache files to access a tool's return value.
- **Evidence:** Three `Bash(cat ...)` calls to the same internal tool-results path, extracting different parts of the parse result.
- **Fix candidate:** Likely a context window or tool result size issue. If `parse_strategic_spec` returns a large structured object, the result may be getting truncated or deferred. Worth investigating the MCP tool's response size and whether it should return a summary instead of the full parsed structure.

### OBS-06 — Design Gap Confirmed — High

- **When:** Stage 1, agent invocation
- **What happened:** The skill spawned 2 generic **Explore** agents ("Analyze ido4shape plugin codebase", "Analyze ido4-MCP codebase context") instead of the defined `code-analyzer` agent.
- **What was expected:** Per `agents/code-analyzer.md` — *"Use this agent as Stage 1 of the decomposition pipeline."* The code-analyzer agent has a specific canvas output format, specific analysis process (Steps 1-5), and specific rules (cite file paths, preserve strategic context, flag shared infrastructure). Generic Explore agents don't follow these.
- **Impact:** Confirms OBS-04. The canvas format may not match the code-analyzer's defined template. The specific rules (never guess about unread code, cite line numbers, don't design solutions) were not enforced.
- **Evidence:** Agent labels: "Analyze ido4shape plugin codebase · 49 tool uses" and "Analyze ido4-MCP codebase context · 35 tool uses" — these are Explore agents, not code-analyzer.
- **Fix candidate:** Same as OBS-04. The skill must explicitly instruct: "Spawn the code-analyzer agent with the parsed spec and codebase path as context."

### OBS-08 — Design Gap — Medium

- **When:** Stage 1, canvas file placement
- **What happened:** The canvas was written to the project root as `ido4shape-enterprise-cloud-canvas.md`. The skill definition says "alongside the strategic spec" which in practice means the working directory root.
- **What was expected:** The skill should first check for a conventional specs directory (`specs/`, `docs/`, `docs/specs/`) and place artifacts there. If none exists, create one. All decomposition artifacts (canvas, technical spec) should live in the same directory — not scattered in the project root alongside source code.
- **Impact:**
  - **Root pollution:** As the project grows, decomposition artifacts clutter the root alongside source files.
  - **No artifact grouping:** Canvas and technical spec could end up in different locations if the convention isn't explicit.
  - **Canvas lifecycle unclear:** The canvas is an intermediate artifact but has historical value — it should be kept, but in a predictable location.
- **Fix candidate:** `skills/decompose/SKILL.md` — Add to Stage 0 or Stage 1 preamble: "Before writing any artifacts, check if a specs directory exists (`specs/`, `docs/specs/`, `docs/`). If found, use it. If not, create `specs/`. All pipeline artifacts (canvas, technical spec) are written to this directory." Also update the Files Produced table to reflect the directory convention. The canvas should be explicitly marked as a permanent artifact kept for history.

### OBS-07 — Behavioral Drift — Low

- **When:** Stage 1, greenfield detection
- **What happened:** The skill correctly identified this as a greenfield project ("no existing codebase") and adapted by analyzing integration-relevant repos (ido4shape plugin, ido4-MCP) instead. This is reasonable but not covered by the skill definition.
- **What was expected:** The skill definition (`skills/decompose/SKILL.md:37-80`) assumes an existing codebase to analyze. Steps 1a-1d all reference reading existing code. No guidance for greenfield projects.
- **Evidence:** Skill output: "Since this is a greenfield project (no existing codebase), I'll analyze the related repos (ido4shape plugin, ido4-MCP, ido4dev) to understand the existing architecture that this cloud platform must integrate with."
- **Fix candidate:** `skills/decompose/SKILL.md` Stage 1 should add a greenfield path: "If the project is greenfield, analyze integration targets and architectural references instead of the project codebase. The canvas should document: tech stack decisions, integration points with existing systems, patterns to follow from reference codebases."

### OBS-09 — Canvas Quality: Wrong Structure — High

- **When:** Stage 1, canvas output
- **What happened:** The canvas uses a group-level table structure (5 group sections with summary tables) instead of the per-capability structure defined in `agents/code-analyzer.md`.
- **What was expected:** Per `agents/code-analyzer.md:43-75`, the canvas should have 25 individual `## Capability: [REF] — [Title]` sections, each with subsections: Strategic Context, Cross-Cutting Constraints, Codebase Analysis, Code-Level Dependencies Discovered, Complexity Assessment.
- **Actual structure:** `### Group: Auth, Organization & Roles` → table with columns Capability | Architecture | Complexity | Notes. This collapses per-capability depth into one-line summaries.
- **Impact:** The technical-spec-writer agent (`agents/technical-spec-writer.md:12`) expects a canvas with "per-capability analysis (relevant modules, patterns, complexity assessment)" and "code-level dependency discoveries." The group tables don't provide this granularity, forcing the spec-writer to either produce vague tasks or re-derive the analysis.
- **Root cause:** OBS-06 — generic Explore agents don't know the canvas format.
- **Fix candidate:** Resolved by OBS-04/OBS-06 fix (wire code-analyzer agent). The agent's template enforces the right structure.

### OBS-10 — Canvas Quality: Strategic Context Dropped — High

- **When:** Stage 1, canvas output
- **What happened:** The canvas drops ALL strategic context from the spec: capability descriptions, success conditions, stakeholder perspectives, group descriptions, open questions, constraints, non-goals. None of the 25 capability descriptions from the strategic spec are carried forward.
- **What was expected:** Per `agents/code-analyzer.md:47-49` — *"Capability description and success conditions from strategic spec — carried forward intact. Include relevant group context: why this capability belongs with its siblings, what the group delivers as a unit, any group-level stakeholder perspectives."* Per rule #3: *"Preserve strategic context intact. Don't rephrase — the stakeholder attribution matters."*
- **Impact:** The technical-spec-writer (`agents/technical-spec-writer.md:46-49`) needs this context to write capability descriptions that become GitHub epic/bet issue bodies — including stakeholder attributions ("Per Marcus: needs idempotency key") and group coherence context. Without it, the spec-writer must re-read the strategic spec or produce tasks without stakeholder grounding.
- **Evidence:** The strategic spec has detailed descriptions for all 25 capabilities (e.g., AUTH-01 has a full paragraph + 4 success conditions). The canvas has one-line entries like "AUTH-01: User Account + Sign-In | Clerk/WorkOS OAuth flow → users table | Low | Mostly vendor SDK integration."
- **Fix candidate:** Resolved by OBS-04/OBS-06 fix. The code-analyzer agent rule #3 explicitly requires verbatim preservation. Additionally, the spec-writer agent should validate that its input canvas contains strategic context — if missing, it should refuse and report the gap rather than producing vague tasks.

### OBS-11 — Canvas Quality: Cross-Cutting Concerns Collapsed — Medium

- **When:** Stage 1, canvas output (section 5)
- **What happened:** The strategic spec has 10 multi-paragraph cross-cutting concerns with decision references (D1, D5, D8, D9, D10, D11, D12, D13, etc.). The canvas collapses ALL of them into a one-line summary table — e.g., "Session Lock Mgmt | Postgres lock table, TTL refresh, email warning at 45 min, force-release. | High — distributed locking."
- **What was expected:** Per `agents/code-analyzer.md:38-39`, each concern should get its own section: `### [Concern Name] → Codebase Reality` with detail on "How this concern maps to existing infrastructure. What exists, what's missing."
- **Impact:** Cross-cutting concerns contain critical implementation constraints (e.g., "Email delivery is load-bearing for session locking — D8 consequence" or "Plugin version IS the canvas format version; no separate header needed — D12"). These constraints must flow into task descriptions. The summary table loses this.
- **Fix candidate:** Resolved by OBS-04/OBS-06 fix. Additionally, the canvas format should include BOTH: (1) a summary table for quick reference, and (2) detailed per-concern sections that preserve the strategic spec's decision references and constraint details.

### OBS-12 — Canvas Quality: Premature Solution Design — Medium

- **When:** Stage 1, canvas output (sections 3, 6, 7)
- **What happened:** The canvas includes a Tech Stack Decisions table (section 3), a full Database Schema Sketch with 10+ tables and column definitions (section 6), and an API Surface Sketch with ~30 REST endpoints (section 7).
- **What was expected:** Per `agents/code-analyzer.md` rule #5: *"Don't design solutions. You're analyzing, not implementing. Note what exists and what's needed — the technical spec writer will decide how to structure the work."*
- **Nuance:** For greenfield projects, some architectural projection is necessary (see OBS-13). But sections 6 and 7 go beyond projection into implementation detail. The schema sketch includes column types; the API sketch includes HTTP methods and URL patterns. This is the technical-spec-writer's domain.
- **Fix candidate:** The greenfield mode of code-analyzer (see OBS-13) should permit tech stack recommendations and high-level schema/API sketches, but with explicit boundaries: "Sketch table names and relationships, not column definitions. Sketch endpoint groups and resource patterns, not full URL paths with HTTP methods. The spec-writer will detail these."

### OBS-13 — Design Gap: Greenfield Mode Needed in Code-Analyzer — High

- **When:** Stage 1, entire canvas production
- **What happened:** The canvas adapted to a greenfield project by projecting architecture rather than analyzing existing code. This produced useful content (ecosystem diagram, integration analysis, tech stack, schema/API sketches) but violated multiple code-analyzer rules designed for existing codebases.
- **What was expected:** The code-analyzer agent has no greenfield path. All instructions assume an existing codebase: "cite file paths and line numbers," "search for relevant code," "what exists vs what's new."
- **Root cause:** The strategic spec targets a brand-new cloud platform. The code-analyzer was designed for existing codebases only.
- **Fix candidate:** Add a mode detection + conditional instruction system to the code-analyzer agent. Implementation details below.

**Implementation plan for greenfield mode:**

**Step 1: Mode detection in decompose skill (`skills/decompose/SKILL.md`)**

Add a new step between Stage 0 and Stage 1:

```markdown
## Stage 0.5: Detect Project Mode

After parsing the strategic spec, determine the project mode:
1. Glob for source directories (`src/`, `app/`, `lib/`, `packages/`)
2. Check for existing project files (package.json with dependencies, go.mod, Cargo.toml, etc.)
3. Count non-config source files

- If source code exists: **mode = existing**
- If no source code but the spec references integration targets (other repos, APIs, systems): **mode = greenfield-with-context**
- If no source code and no integration targets: **mode = greenfield-standalone**

Pass the detected mode to the code-analyzer agent.
```

**Step 2: Mode-specific instructions in code-analyzer (`agents/code-analyzer.md`)**

Add after the existing "## Rules" section:

```markdown
## Mode-Specific Instructions

The decompose orchestrator passes a mode. Follow the instructions for the detected mode.

### Mode: existing
[Current instructions unchanged — analyze real code, cite file:line, don't design solutions]

### Mode: greenfield-with-context
You are projecting architecture for a new project that integrates with existing systems.

**What changes:**
- "Codebase Analysis" → "Integration Target Analysis" — analyze the systems this project connects to
- Tech stack recommendations ARE permitted — ground them in constraints from the strategic spec and patterns from integration targets
- Schema/API sketches are permitted at a HIGH LEVEL — table names and relationships, not column types; endpoint groups, not full URL paths
- File references are PROPOSED paths (`src/services/auth.ts` (proposed)), not discovered paths
- No line numbers — there's no code to reference

**What stays the same:**
- Preserve strategic context intact (rule #3) — this is NON-NEGOTIABLE regardless of mode
- Per-capability sections with full subsections — every capability gets its own section
- Cross-cutting concern mapping — detailed, not summary tables
- Honest complexity assessment
- Flag shared infrastructure
- Never guess — if you haven't analyzed an integration target, say so

**Canvas output adaptations:**
- "Codebase Overview" → "Ecosystem Architecture" — diagram showing how this project fits with existing systems
- "Relevant modules" → "Integration Points" — what existing systems expose that this project consumes
- "Patterns found" → "Patterns to Follow" — conventions from integration targets to adopt
- "What exists vs what's new" → "What's Provided vs What's Built" — what integration targets provide vs what this project must create
- ADD: "Tech Stack Decisions" section — table with layer, choice, rationale (grounded in constraints)
- ADD: "Architecture Projection" section — high-level schema sketch (table names + relationships), API surface sketch (endpoint groups + resource model), proposed directory structure

### Mode: greenfield-standalone
Same as greenfield-with-context, but without integration target analysis. Focus on:
- Tech stack decisions grounded purely in strategic spec constraints
- Architecture projection from capability requirements
- Cross-cutting concern architecture (how to structure logging, auth, config, etc. from scratch)
```

**Step 3: Ensure spec-writer handles both canvas variants**

The technical-spec-writer (`agents/technical-spec-writer.md`) should work with both variants because:
- Per-capability sections are present in both modes (same structure)
- Strategic context is preserved in both modes
- The metadata fields (effort, risk, type, ai) apply to both

No changes needed to the spec-writer IF the canvas follows the format. Add one validation rule to the spec-writer:

```markdown
### Step 0: Validate Canvas Input
Before decomposing, verify the canvas contains:
- Per-capability sections (not just group tables)
- Strategic context carried forward (descriptions + success conditions)
- Cross-cutting concern mapping (detailed, not summary only)
If any are missing, STOP and report: "Canvas is incomplete — [missing element]. Re-run Stage 1."
```

**Step 4: Update the decompose skill's Files Produced table**

```markdown
| File | Stage | Purpose | Lifecycle |
|------|-------|---------|-----------|
| `specs/[name]-canvas.md` | Stage 1 | Technical canvas — intermediate artifact | Permanent (kept for history) |
| `specs/[name]-technical.md` | Stage 2 | Technical spec — ingestion-ready | Permanent |
```

**Estimated scope:** ~100 lines added to code-analyzer, ~15 lines added to decompose skill, ~5 lines added to spec-writer. Total agent stays under 250 lines (safe zone for quality).

### OBS-14 — Canvas Quality: Good Emergent Patterns to Formalize — Low

- **When:** Stage 1, canvas output
- **What happened:** Despite structural issues, the canvas produced several patterns worth formalizing into the code-analyzer agent.
- **Patterns to keep:**
  1. **Ecosystem architecture diagram** (section 2) — ASCII diagram showing system relationships (`plugin → cloud → MCP`). Clear, immediately useful. Should be required in greenfield mode, optional in existing mode.
  2. **Integration target analysis** (sections 2a, 2b) — Thorough analysis of the ido4shape plugin (hooks, file I/O, workspace structure) and ido4-MCP (patterns, conventions, DI approach). This is the greenfield equivalent of "Codebase Overview."
  3. **Dependency layers** (section 8) — Build order organized by dependency depth (Layer 0: foundation → Layer 7: final features). Not in the current code-analyzer template. Useful for both greenfield and existing codebases — tells the spec-writer what order to process capabilities.
  4. **Risk assessment table** (section 9) — Cross-capability risk view. The current template has per-capability complexity assessment but no aggregate risk view. Both are useful.
  5. **"What Exists vs What's New" summary** (section 10) — Project-level summary alongside the per-capability breakdown. Quick reference for scope sizing.
- **Fix candidate:** Formalize these into the canvas template:
  - Dependency layers → add as a required section in both modes
  - Risk assessment table → add as a required section (aggregate view complements per-capability complexity)
  - Ecosystem diagram → required for greenfield, optional for existing
  - "What Exists vs What's New" summary → required in both modes (project-level rollup of per-capability analysis)

### OBS-15 — Design Gap: Missing Review Checkpoint Between Stage 2 and Stage 3 — Medium

- **When:** Stage 2 → Stage 3 transition
- **What happened:** After writing the 660-line technical spec, the skill immediately said "Now proceeding to Stage 3: Validate" and attempted to run `ingest_spec` with `dryRun: true`. The user had to interrupt to prevent automatic progression.
- **What was expected:** The decompose skill has an explicit review checkpoint between Stage 1 and Stage 2 (`skills/decompose/SKILL.md:82` — "Ask the user if they want to review the full canvas before proceeding"). No equivalent checkpoint exists between Stage 2 and Stage 3, or between Stage 3 and Stage 4.
- **Impact:** The technical spec is the most consequential artifact — it defines the tasks that become GitHub issues. Skipping user review before validation means the user can't catch task decomposition issues, missing context, or granularity problems before the pipeline treats the spec as ready.
- **Fix candidate:** `skills/decompose/SKILL.md` — Add explicit review checkpoints at EVERY stage boundary:
  - After Stage 1 (canvas): "Would you like to review the canvas?" ← already exists
  - After Stage 2 (technical spec): "The technical spec is ready for review. Would you like to review it before validation, or should I proceed?" ← ADD
  - After Stage 3 (validation): Already has a checkpoint before ingestion (Stage 4 asks "Do you want to ingest?")
  
  General principle for the skill: **Every artifact-producing stage should offer the user review before the next stage consumes it.** This is co-creation, not a batch process.

### OBS-16 — Technical Spec: Invented Capability is Valuable — Positive

- **When:** Stage 2, technical spec output
- **What happened:** The spec-writer created a new `## Capability: Platform Foundation` (PLAT-01A/B/C) for shared infrastructure (monorepo scaffolding, API server + DB + middleware, GCS/email service clients) that doesn't exist in the strategic spec.
- **Why this is good:** The strategic spec doesn't know about monorepo scaffolding or API server setup — that's the whole point of technical decomposition. The spec-writer exercised technical judgment to identify that shared infrastructure needed its own capability. The PLAT- ref pattern clearly signals this is a technical addition, not a strategic capability.
- **What to formalize:** The spec-writer agent should be explicitly allowed (not just tolerated) to create technical-only capabilities. Add to `agents/technical-spec-writer.md`:
  ```
  ## Technical Capabilities
  If the codebase analysis reveals shared infrastructure that doesn't map to any
  strategic capability, you MAY create a technical-only capability. Rules:
  - Use a distinct ref prefix (e.g., PLAT-, INFRA-, TECH-) to signal it's not from the strategic spec
  - Place it before the strategic capabilities in the spec (it's foundational)
  - The capability description must explain WHY it exists and which strategic capabilities depend on it
  - Keep it minimal — only infrastructure that genuinely serves multiple capabilities
  ```
- **Fix candidate:** `agents/technical-spec-writer.md` — add Technical Capabilities section. No changes needed to `spec-parser.ts` if it already handles arbitrary capability refs.

### OBS-17 — Technical Spec: Canvas Context Resilience Problem — High

- **When:** Stage 2, spec writing behavior
- **What happened:** The spec-writer produced a surprisingly good technical spec (stakeholder attributions, specific file paths, accurate dependencies) despite the canvas dropping all strategic context (OBS-10). Investigation shows the orchestrator compensated by re-deriving context from the strategic spec, which was still in the same conversation context window.
- **Why this is a critical finding:** This compensation ONLY works because:
  1. No agent isolation — the orchestrator has both the strategic spec and canvas in context
  2. No session break — everything happened in one conversation
  3. No context compacting — the strategic spec hasn't been compressed yet
  
  With proper agent isolation (OBS-04 fix), the spec-writer agent would receive ONLY the canvas. With a new session, the strategic spec would be gone. With context compacting on long conversations, early content (the strategic spec) gets compressed first.
- **Architectural insight:** The canvas is not just an analysis artifact — it's the **context preservation layer**. It's the bridge that carries strategic context across agent boundaries, session boundaries, and context compaction boundaries. If the canvas is incomplete, everything downstream degrades.
- **Impact on OBS-10 severity:** This elevates OBS-10 (strategic context dropped from canvas) from a quality issue to an **architectural risk**. The canvas MUST carry forward: capability descriptions, success conditions, stakeholder attributions, cross-cutting concern details, constraints, non-goals, and group context. Without these, the spec-writer in an isolated agent cannot produce grounded tasks.
- **Fix candidate:** Already covered by OBS-10 and OBS-13 fixes. The code-analyzer's rule #3 ("Preserve strategic context intact") is the right rule — it just needs to be enforced via the agent wiring (OBS-04).

### OBS-18 — Technical Spec: File Location Repeats OBS-08 — Low

- **When:** Stage 2, file write
- **What happened:** Technical spec written to project root as `ido4shape-enterprise-cloud-technical.md`, same as the canvas (OBS-08).
- **Fix candidate:** Same as OBS-08 — `specs/` directory convention.

### OBS-19 — Technical Spec: Minor Format Issues — Low

- **When:** Stage 2, spec format
- **What happened:** The technical spec has minor deviations from the spec-writer agent's expected format:
  1. Missing `> Decomposed from: [strategic spec path]` line (expected per `agents/technical-spec-writer.md:31`)
  2. Group context not consistently woven into capability descriptions. The spec-writer says "Group knowledge flows into capability descriptions: 'Part of Notification Core (must-have)'" (`agents/technical-spec-writer.md:125`). Some capabilities include group context (e.g., AUTH-04 mentions D11), others don't.
  3. Cross-cutting concerns inconsistently integrated into task descriptions. Some tasks reference them well (PLUG-01A mentions standalone parity), others don't mention applicable concerns.
- **Impact:** Low — these don't break `ingest_spec` parsing but reduce traceability and context for the development agents that will execute these tasks.
- **Fix candidate:** The spec-writer agent's final quality check (Step 5, `agents/technical-spec-writer.md:166-173`) should explicitly verify: "Every capability description includes group context. Every task with applicable cross-cutting concerns references them."

### OBS-20 — Pipeline Design: Split Validation into Parse + Dry-Run — Design Decision (Revised)

- **When:** Stage 3 failure + discussion during test
- **What happened:** `ingest_spec(dryRun: true)` failed with `CONFIGURATION_ERROR: Project configuration not found at .ido4/project-info.json`. The tool requires project initialization (including methodology choice) even for dry-run validation. The skill then tried to auto-initialize the project, which the user interrupted (methodology is a user decision — same pattern as OBS-01).
- **Evidence:** Error response: `{"message": "Project configuration not found...", "code": "CONFIGURATION_ERROR", "remediation": "Run project initialization to create .ido4/project-info.json", "retryable": false}`
- **What was discussed:** Three key questions:
  1. When should methodology enter the pipeline?
  2. Does spec validation actually need the methodology?
  3. Should the skill auto-initialize the project?
  
- **Analysis:** The current `ingest_spec` tool gates ALL operations (including dry-run) behind project config. But spec validation has two distinct concerns:
  - **Structural validation** (methodology-agnostic): Are headings correct? Are metadata fields parseable? Do dependency refs resolve? No circular dependencies? Description length meets minimum? Capability/task count summary?
  - **Ingestion preview** (methodology-specific): How do capabilities map to epics/bets/stories? What does the issue hierarchy look like? How do tasks enter the funnel?
  
  Only the second requires methodology. The first is pure structural checking.

- **Decision:** Split validation into two distinct steps and introduce a new MCP tool:

  **Stage 3a: Parse validation** — New tool: `validate_spec` (or `ingest_spec(validateOnly: true)`)
  - Validates spec structure against `spec-parser.ts` format expectations
  - Checks: heading format, metadata fields (effort/risk/type/ai/depends_on), dependency graph (no cycles, no dangling refs), description length (≥200 chars), success conditions present
  - Returns: parse result with errors/warnings, capability count, task count, dependency graph summary
  - **No project config needed.** Pure structural validation.
  - This completes the methodology-agnostic portion of the pipeline.

  **Stage 3b: Dry-run ingestion** — Existing tool: `ingest_spec(dryRun: true)`
  - Previews the actual GitHub issue mapping with methodology-specific structure
  - Shows: how capabilities become epics/bets/stories, issue hierarchy, container assignments
  - **Requires project initialization** (methodology, GitHub repo)
  
  The pipeline becomes:
  ```
  Stage 0: Parse strategic spec (methodology-agnostic)
  Stage 1: Analyze codebase → canvas (methodology-agnostic)
  Stage 2: Write technical spec (methodology-agnostic)
  [review checkpoint — user reviews spec]
  Stage 3a: Parse validation (structural, methodology-agnostic, no project config)
  [review checkpoint — user reviews validation results]
  
  ← User initializes ido4 project: choose methodology, set up GitHub repo, configure governance
  ← This is a separate workflow — /ido4dev:onboard or manual setup
  
  Stage 3b: Dry-run ingestion (methodology-aware preview, needs project config)
  [review checkpoint — user reviews issue mapping]
  Stage 4: Ingest → creates methodology-shaped GitHub issues
           Hydro: Capabilities → Epics, Tasks → Issues
           Scrum: Capabilities → Features/Stories, Tasks → Work Items
           Shape Up: Capabilities → Bets, Tasks → Scopes
  ```

- **Rationale:**
  - **Modular pipeline:** Stages 0–3a can complete in one session without any project setup. The user gets a validated technical spec they can review, share, or iterate on before committing to a methodology.
  - **Reusable spec:** Same validated spec can be ingested under different methodologies.
  - **Clear separation:** "What to build" (Stages 0–3a) vs "how to organize the work" (Stages 3b–4).
  - **No auto-initialization:** Methodology choice is a user decision. The skill should NEVER auto-initialize — it should tell the user what's needed and wait.

- **Fix candidates:**

  **1. New MCP tool in `@ido4/mcp` (`validate_spec`)**
  ```typescript
  // Tool: validate_spec
  // Input: { specContent: string }
  // Output: {
  //   success: boolean,
  //   errors: Array<{ line: number, message: string }>,
  //   warnings: Array<{ line: number, message: string }>,
  //   summary: {
  //     capabilities: number,
  //     tasks: number,
  //     dependencyEdges: number,
  //     hasCircularDeps: boolean,
  //     orphanedRefs: string[],  // depends_on refs that don't exist
  //     metadataIssues: string[] // missing or invalid metadata fields
  //   }
  // }
  // Does NOT require project config. Uses spec-parser.ts for parsing.
  ```
  Alternative: Add a `validateOnly: true` parameter to existing `ingest_spec` that skips the project config check and returns only parse results.

  **2. Update `skills/decompose/SKILL.md` Stage 3:**
  ```markdown
  ## Stage 3: Validate

  ### 3a. Structural Validation (no project config needed)
  1. Call `validate_spec` (or `ingest_spec` with validateOnly mode) with the technical spec content.
  2. Review the result:
     - **Errors** → fix the technical spec and re-validate
     - **Warnings** → report to user, ask if they want to fix or accept
     - **Clean** → report success with summary (capability count, task count, dependency graph)
  3. Present results to the user. Ask if they want to proceed.

  ### 3b. Ingestion Preview (requires initialized project)
  1. Check if the ido4 project is initialized (`.ido4/project-info.json` exists)
  2. If NOT initialized, tell the user:
     "The spec is structurally valid. Before previewing the issue mapping, initialize
     your ido4 project with a methodology. Run `/ido4dev:onboard` or set up manually.
     Come back to this step when the project is ready."
     STOP here. Do NOT auto-initialize.
  3. If initialized, call `ingest_spec` with `dryRun: true`
  4. Present the preview: methodology-shaped issue mapping, hierarchy, container assignments
  5. Ask the user if they want to proceed to ingestion.
  ```

  **3. Update `skills/decompose/SKILL.md` Stage 4:**
  ```markdown
  ## Stage 4: Ingest

  Ask the user: "This will create [X] GitHub issues under [methodology]. Proceed?"
  If yes:
  1. Call `ingest_spec` with `dryRun: false`
  2. Report results: issues created, hierarchy, any failures
  If no:
  - The technical spec file is ready for later ingestion.
  ```

### OBS-21 — Behavioral Drift: Skill Tried to Auto-Initialize Project — Medium

- **When:** Stage 3, after `ingest_spec` dry-run failed with CONFIGURATION_ERROR
- **What happened:** The skill said "The dry-run requires an initialized ido4 project. Let me initialize it first, then validate." and attempted to auto-initialize the project. The user interrupted.
- **What was expected:** Project initialization involves choosing a methodology (Hydro/Scrum/Shape Up), which is a significant user decision that shapes the entire development workflow. The skill should report the error, explain what's needed, and ask the user to initialize — not do it automatically.
- **Pattern:** Same behavioral drift as OBS-01 (auto-searching for spec path instead of asking the user). Claude tends to "helpfully" resolve blockers autonomously when it should defer to the user for decisions with significant consequences.
- **Fix candidate:** Two layers of fix:
  1. **Skill definition** (`skills/decompose/SKILL.md`): Stage 3b should explicitly say "If the project is not initialized, STOP and tell the user. Do NOT initialize the project yourself — methodology choice is a user decision."
  2. **General behavioral guardrail** (could go in CLAUDE.md or as a cross-cutting instruction): "When a pipeline step fails due to a missing user decision (methodology, repository, configuration), report what's needed and WAIT. Never auto-resolve decisions that affect project structure or workflow."

---

## Positives

- Stage sequencing is correct (0 → 1 → 2, correct order).
- Stage 0 summary is well-formatted and complete: project name, capabilities grouped by groups (table), dependency structure (critical path + root nodes), group priorities, high-risk callouts. Matches `skills/decompose/SKILL.md:26` requirements.
- Parse result correctly reviewed for errors/warnings (0/0) before proceeding.
- Greenfield detection and adaptation — reasonable judgment call even though not defined in the skill.
- Review checkpoint honored between Stage 1 and Stage 2: "Would you like to review the full canvas before I proceed to Stage 2?" — matches `skills/decompose/SKILL.md:82`.
- Canvas file naming follows the `[spec-name]-canvas.md` convention.
- Key findings summary is concise and highlights surprises (3 high-risk areas, plugin has zero network capabilities) — matches the communication rule at line 13.
- Canvas ecosystem diagram, integration target analysis, dependency layers, and risk table are useful patterns that emerged organically — worth formalizing (OBS-14).
- Technical spec quality is surprisingly strong despite degraded canvas — stakeholder attributions partially preserved, task descriptions are specific with proposed file paths, success conditions are code-verifiable, dependencies are accurate.
- The spec-writer's invention of Platform Foundation (PLAT) capability demonstrates valuable technical judgment — shared infrastructure correctly identified and decomposed (OBS-16).
- Task count (36 tasks across 26 capabilities) is manageable — no over-splitting, no under-splitting. Task granularity is well-calibrated for AI agent execution.

---

## Assessment

Stages 0, 1, and 2 complete. Stage 3 blocked. 21 observations logged.

**Severity distribution:** 5 High, 7 Medium, 5 Low, 2 Positive, 2 Design Decisions.

**The core structural problem (OBS-04/OBS-06)** cascades through everything: wrong canvas structure (OBS-09), dropped strategic context (OBS-10), no greenfield mode (OBS-13). The spec was saved by context coincidence (OBS-17) — the orchestrator had the full strategic spec in its context window. This won't survive agent isolation, session breaks, or context compaction.

**The key architectural insight (OBS-17):** The canvas is the context preservation layer. It's not just analysis — it's the bridge that carries strategic context across agent boundaries, session boundaries, and context compaction. This makes OBS-10 (dropped strategic context) an architectural risk, not just a quality issue.

**The validation split insight (OBS-20):** Stage 3 needs to be two steps — structural parse validation (methodology-agnostic, no project config) and ingestion dry-run (methodology-aware, needs project config). This requires a new MCP tool (`validate_spec`) in `@ido4/mcp`. This keeps the decompose pipeline completable through Stage 3a without any project setup, making the spec artifact independently valuable.

**Behavioral pattern (OBS-01 + OBS-21):** The skill consistently auto-resolves blockers that require user decisions — auto-searching for the spec path, auto-initializing the project. This needs a cross-cutting guardrail: "When a step fails due to a missing user decision, STOP and explain. Never auto-resolve."

**Good surprises:**
- The spec-writer's technical judgment (OBS-16) — creating infrastructure capabilities is valuable behavior to formalize
- Task granularity is well-calibrated for AI agent execution — no need for finer splitting
- The pipeline's methodology-agnostic design (OBS-20) is clean — methodology enters at ingestion preview

**Pipeline design refinements from this test:**
1. Review checkpoints at every stage boundary (OBS-15) — co-creation, not batch
2. Canvas as context preservation layer (OBS-17) — strategic context must survive agent/session/compaction boundaries
3. Greenfield mode in code-analyzer (OBS-13) — with mode detection in decompose
4. Split validation: parse (3a, agnostic) + dry-run (3b, methodology-aware) (OBS-20)
5. New MCP tool needed: `validate_spec` in `@ido4/mcp` (OBS-20)
6. Technical capabilities allowed in spec-writer (OBS-16) — with distinct ref prefix
7. Artifact directory convention (OBS-08) — `specs/` directory for all pipeline artifacts
8. Behavioral guardrail against auto-resolving user decisions (OBS-01, OBS-21)

**Recommended implementation order (revised):**
1. Wire agents into decompose skill (OBS-04) — unblocks everything
2. Add review checkpoints at every stage boundary (OBS-15)
3. Add greenfield mode to code-analyzer (OBS-13) — with mode detection
4. Formalize canvas as context preservation layer — strengthen code-analyzer rule #3, add validation to spec-writer
5. Create `validate_spec` MCP tool in `@ido4/mcp` (OBS-20) — enables methodology-agnostic structural validation
6. Split Stage 3 in decompose skill into 3a (parse) + 3b (dry-run) (OBS-20)
7. Add artifact directory convention (OBS-08) — `specs/` directory
8. Formalize emergent canvas patterns (OBS-14) — dependency layers, risk table, ecosystem diagram
9. Allow technical capabilities in spec-writer (OBS-16) — with ref prefix convention
10. Strengthen behavioral guardrails (OBS-01, OBS-02, OBS-03, OBS-21) — cross-cutting "don't auto-resolve user decisions" rule

**Implementation spans two repos:**
- `ido4dev` (this repo): items 1-4, 6-9
- `@ido4/mcp` (npm package): item 5 (`validate_spec` tool)

Total time: ~15 minutes for Stages 0-3 (including Stage 3 failure), which is reasonable for this spec size (25 capabilities, 660-line output).

---

## Next Steps

- **E2E re-test required:** Run `/ido4dev:decompose` against the same ido4shape-enterprise-cloud spec to validate all fixes. Key things to verify:
  1. Does the skill spawn named agents (code-analyzer, spec-writer, spec-reviewer) or fall back to generic Explore agents?
  2. Does greenfield mode detect correctly?
  3. Does the canvas preserve strategic context verbatim (rule #3)?
  4. Does the spec-writer's Step 0 validate the canvas and reject incomplete ones?
  5. Do review checkpoints fire at EVERY stage boundary (Stage 1→2, Stage 2→3)?
  6. Does Stage 3a (spec-reviewer) produce a structured review report with verdict?
  7. Does Stage 3b stop and explain if project not initialized?
  8. Are artifacts written to `specs/` directory?
- **Still deferred:** `validate_spec` MCP tool in `@ido4/mcp` — Stage 3a uses spec-reviewer agent as interim
- **Still needed for Stage 3b+:** Project initialization (methodology, GitHub repo) via `/ido4dev:onboard`

---

## Fix Implementation Log (2026-04-09)

All findings from this test were implemented in a single pass across 4 files. Below is the per-observation implementation status with notes on what was done and what to watch for in the re-test.

### OBS-01 — Behavioral Drift (auto-search for spec path) — FIXED

**What was done:**
- Added cross-cutting `## Behavioral Guardrail` section at the top of `skills/decompose/SKILL.md` — "MUST ask and WAIT. Never auto-search, auto-initialize, or auto-resolve."
- Strengthened Stage 0's missing-path instruction from "ask the user for it" → "ask the user for the path and WAIT for their response. Do NOT search for spec files yourself."
- Added `Missing user decisions` to Error Handling section.

**Files:** `skills/decompose/SKILL.md` (lines 10-14, 34, 161)
**Re-test watch:** Does the skill actually stop and ask when no `$ARGUMENTS` path is provided?

### OBS-02 — Quality Issue (cat via Bash to read files) — FIXED

**What was done:**
- Added rule #7 to code-analyzer: "Use the Read tool to read files. Never use cat via Bash, shell variables, or intermediary scripts."
- Added rule #6 to technical-spec-writer: "Use the Read tool to read files. Never use cat via Bash or shell intermediaries."

**Files:** `agents/code-analyzer.md` (line 185), `agents/technical-spec-writer.md` (line 218)
**Note:** This is a Claude behavioral tendency, not a skill definition issue. The rules make the expectation explicit, but Claude may still drift. If it recurs, escalate to a hook-level enforcement.

### OBS-03 — Quality Issue (Bash/cat intermediary before MCP calls) — FIXED

**What was done:** Same rules as OBS-02 — the code-analyzer rule #7 explicitly says "pass content directly to MCP tools — do not use shell intermediaries."

**Files:** Same as OBS-02.
**Re-test watch:** Does the agent read files with Read and pass content directly to `parse_strategic_spec`? Or does it still route through Bash/cat/node scripts?

### OBS-04 — Design Gap: Agents Not Wired into Decompose Skill — FIXED

**What was done:**
- Replaced ~120 lines of inline Stage 1/2/3 instructions in `skills/decompose/SKILL.md` with explicit agent-spawning directives.
- Stage 1: "Spawn the **code-analyzer** agent (defined at `agents/code-analyzer.md`, model: opus)"
- Stage 2: "Spawn the **technical-spec-writer** agent (defined at `agents/technical-spec-writer.md`, model: opus)"
- Stage 3a: "Spawn the **spec-reviewer** agent (defined at `agents/spec-reviewer.md`, model: sonnet)"
- Each directive includes: file path to agent definition, model, structured context to pass, output verification step.
- Added `Agent failures` to Error Handling section.
- Added Write to code-analyzer and spec-writer tool lists so they can write output files independently.

**Files:** `skills/decompose/SKILL.md` (lines 63-84, 87-107, 110-126), `agents/code-analyzer.md` (line 7), `agents/technical-spec-writer.md` (line 8)
**Risk:** This is the highest-risk change. No skill in the codebase currently spawns agents. If agent spawning doesn't work reliably, fallback is Approach B: change "Spawn the X agent" → "Read agents/X.md and follow those instructions exactly." This requires changing only 3 paragraphs in the skill, with zero changes to agents.
**Re-test watch:** Does Claude use the Agent tool to spawn the named agents? Does it pass the structured context? Does it read the agent definition file?

### OBS-05 — Quality Issue (reading internal tool-result cache files) — NOT DIRECTLY ADDRESSED

**Note:** This was a symptom of MCP tool response size causing context truncation. With agent isolation (OBS-04 fix), each agent has a clean context window, reducing the likelihood of this behavior. If it recurs, the issue is in Claude Code's MCP response handling, not in the skill/agent definitions.

### OBS-06 — Design Gap Confirmed: Generic Explore Agents Spawned — FIXED

**What was done:** Same as OBS-04. The skill now explicitly names the agents with file paths. The instruction "Spawn the **code-analyzer** agent (defined at `agents/code-analyzer.md`)" leaves no room for substituting generic Explore agents.

**Re-test watch:** Same as OBS-04 — verify the NAMED agents are spawned, not generic ones.

### OBS-07 — Behavioral Drift: Greenfield Adaptation (positive, but undocumented) — FIXED

**What was done:**
- Added `Stage 0.5: Detect Project Mode` to `skills/decompose/SKILL.md` with concrete detection heuristics.
- Three modes: existing, greenfield-with-context, greenfield-standalone.
- Mode is reported to user and passed to code-analyzer.

**Files:** `skills/decompose/SKILL.md` (lines 47-60)
**Re-test watch:** Does mode detection work correctly for the greenfield ido4shape-cloud project? Should detect "greenfield-with-context" (no source code, but spec references ido4shape plugin and ido4-MCP as integration targets).

### OBS-08 — Design Gap: Artifact File Location — FIXED

**What was done:**
- Added `### Artifact Directory Convention` to Stage 0: check for `specs/`, `docs/specs/`, `docs/`, or create `specs/`.
- Updated Files Produced table to show `specs/[name]-canvas.md` and `specs/[name]-technical.md`.
- Both agent spawning directives include artifact directory path.

**Files:** `skills/decompose/SKILL.md` (lines 36-43, 165-168)
**Re-test watch:** Are canvas and technical spec written to `specs/` instead of project root?

### OBS-09 — Canvas Quality: Wrong Structure — FIXED (via OBS-04/06)

**What was done:** The code-analyzer agent definition has the correct canvas template with per-capability `## Capability:` sections. By wiring the actual agent (OBS-04), the canvas will follow the defined template instead of the collapsed group-table format that generic Explore agents produced.

**Re-test watch:** Does the canvas have individual `## Capability: [REF] — [Title]` sections with full subsections (Strategic Context, Cross-Cutting Constraints, Codebase Analysis, etc.)?

### OBS-10 — Canvas Quality: Strategic Context Dropped — FIXED

**What was done:**
- Strengthened code-analyzer rule #3 from a brief "carried forward verbatim" → a comprehensive instruction that:
  - Explains WHY: "The canvas carries strategic context across agent boundaries, session boundaries, and context compaction"
  - Enumerates WHAT: "capability descriptions, success conditions, stakeholder attributions, group descriptions and coherence context, constraints, non-goals, and open questions"
  - States the consequence: "the downstream spec-writer agent receives ONLY this canvas, not the strategic spec"
  - Prohibits shortcuts: "Do not summarize, rephrase, or collapse into tables"

**Files:** `agents/code-analyzer.md` (line 180)
**This is the single most important quality fix.** If the canvas drops strategic context, the entire pipeline downstream degrades — but NOW it will degrade visibly (spec-writer Step 0 will catch missing context) instead of silently.
**Re-test watch:** Do capability sections in the canvas carry full strategic descriptions (multi-paragraph), success conditions (bullet lists), and stakeholder attributions? Or are they still one-line summaries?

### OBS-11 — Canvas Quality: Cross-Cutting Concerns Collapsed — FIXED (via OBS-04/10)

**What was done:** The code-analyzer template requires `### [Concern Name] → Codebase Reality` per-concern sections (not summary tables). Rule #3 strengthening prohibits "collapse into tables." The greenfield mode "What stays the same" section explicitly says: "Cross-cutting concern mapping — detailed per-concern sections, not summary tables."

**Re-test watch:** Do cross-cutting concerns get individual sections with decision references preserved?

### OBS-12 — Canvas Quality: Premature Solution Design — FIXED

**What was done:** Greenfield mode in code-analyzer explicitly limits solution design: "Schema/API sketches permitted at **high level only** — table names and relationships, not column types; endpoint groups and resource patterns, not full URL paths with HTTP methods. The spec-writer will detail these." Rule #5 ("Don't design solutions") still applies to existing mode.

**Files:** `agents/code-analyzer.md` (line 204)
**Re-test watch:** In greenfield mode, does the canvas sketch tables and endpoints at the right level of abstraction? Or does it still produce column-level schema and full HTTP method/URL definitions?

### OBS-13 — Design Gap: Greenfield Mode Needed — FIXED

**What was done:**
- Mode detection in `skills/decompose/SKILL.md` Stage 0.5 (3 modes)
- Full `## Mode-Specific Instructions` section in `agents/code-analyzer.md` with:
  - **existing**: current instructions unchanged
  - **greenfield-with-context**: adapted sections (Ecosystem Architecture, Integration Target Analysis, Patterns to Follow, What's Provided vs What's Built), permitted tech stack and high-level sketches, proposed file paths, no line numbers
  - **greenfield-standalone**: same but without integration target analysis
- Explicit "non-negotiable regardless of mode" list to prevent greenfield mode from eroding core quality
- Updated code-analyzer "Your Input" to document mode as a received parameter

**Files:** `agents/code-analyzer.md` (lines 17-21, 187-227), `skills/decompose/SKILL.md` (lines 47-60)
**Re-test watch:** Does the code-analyzer receive the mode and follow the greenfield-with-context instructions? Does the canvas use "Ecosystem Architecture" instead of "Codebase Overview"?

### OBS-14 — Canvas Quality: Good Emergent Patterns to Formalize — FIXED

**What was done:** Added three sections to the canvas output template:
- `## Dependency Layers` — build order by dependency depth (Layer 0 through N)
- `## Risk Assessment Summary` — aggregate risk table across capabilities
- `## What Exists vs What's Built (Project Summary)` — project-level scope rollup
- `## Discoveries & Adjustments` — post-analysis consistency notes (previously referenced in Step 5 but not in the template)

**Files:** `agents/code-analyzer.md` (lines 77-97)
**Note:** The ecosystem architecture diagram (also from the E2E test) is implicitly covered by greenfield mode's "Ecosystem Architecture" section. It's not a separate required element — the agent will produce it as part of the architecture overview.

### OBS-15 — Missing Review Checkpoint Between Stage 2 and Stage 3 — FIXED

**What was done:** Added review checkpoint after Stage 2: "The technical spec is ready for review. Would you like to review it before validation, or should I proceed to Stage 3?" WAIT for the user's response."

**Files:** `skills/decompose/SKILL.md` (line 106)
**The pipeline now has review checkpoints at every artifact-producing stage boundary:**
- After Stage 1 (canvas): "Would you like to review it before I proceed to Stage 2?" ✓
- After Stage 2 (technical spec): "Would you like to review it before validation?" ✓ (NEW)
- After Stage 3a (review report): verdict-based flow (FAIL/WARN/PASS) ✓
- Before Stage 4 (ingestion): "This will create [N] GitHub issues. Proceed?" ✓

### OBS-16 — Technical Spec: Invented Capability is Valuable — FORMALIZED

**What was done:** Added `## Technical Capabilities` section to `agents/technical-spec-writer.md` explicitly allowing and governing this behavior:
- Distinct ref prefix: PLAT- (platform), INFRA- (infrastructure), TECH- (technical)
- Placement: before strategic capabilities (foundational)
- Description must explain why it exists and which strategic capabilities depend on it
- Must serve multiple strategic capabilities (no single-use infrastructure caps)

**Files:** `agents/technical-spec-writer.md` (lines 70-77)
**Re-test watch:** Does the spec-writer create PLAT-* capabilities? Does it use the correct prefix and place them before strategic capabilities?
**Note:** The PLAT prefix (4 chars) fits within the spec-parser's `[A-Z]{2,5}` regex. Verify at ingestion time.

### OBS-17 — Canvas Context Resilience Problem — FIXED

**What was done:** Two-sided fix:
1. **Producer side (code-analyzer):** Strengthened rule #3 to make the canvas an explicit context preservation layer with enumerated must-carry items and explicit "the downstream agent receives ONLY this canvas" consequence.
2. **Consumer side (spec-writer):** Added Step 0 Canvas Validation that checks for per-capability sections, strategic context, cross-cutting mapping, and dependency layers. If missing, STOP with a clear message.

**Files:** `agents/code-analyzer.md` (line 180), `agents/technical-spec-writer.md` (lines 145-152)
**Architectural significance:** This is the fix that makes agent isolation safe. With one context (old design), missing canvas context was compensated by having the strategic spec in the same window. With agent isolation (new design), the canvas MUST carry all context. The producer-side rule ensures it does; the consumer-side validation catches failures.
**Re-test watch:** If the canvas is somehow incomplete, does the spec-writer actually stop and report? (This is the defensive test — the primary test is whether rule #3 prevents incompleteness in the first place.)

### OBS-18 — Technical Spec File Location — FIXED (via OBS-08)

Same artifact directory convention. Technical spec goes to `specs/[name]-technical.md`.

### OBS-19 — Technical Spec: Minor Format Issues — FIXED

**What was done:** Added two quality checks to spec-writer Step 5 (Final Quality Check):
- "Every capability description includes group context"
- "Every task with applicable cross-cutting concerns references them in the description"

**Files:** `agents/technical-spec-writer.md` (lines 204-205)
**Re-test watch:** Do all capability descriptions include group context like "Part of [Group Name] (must-have)"? Do tasks that touch cross-cutting concern areas reference them?

### OBS-20 — Pipeline Design: Split Validation — PARTIALLY FIXED

**What was done:**
- Stage 3 split into 3a (structural review) + 3b (ingestion preview) in `skills/decompose/SKILL.md`
- Stage 3a: spec-reviewer agent for structural validation (no project config needed)
- Stage 3b: `ingest_spec(dryRun: true)` for methodology-aware preview (needs project config)
- Added `## Pipeline Context` to `agents/spec-reviewer.md` documenting dual-use (standalone + Stage 3a)

**What's deferred:** The `validate_spec` MCP tool in `@ido4/mcp`. Stage 3a uses the spec-reviewer agent as interim — it performs the same structural checks the tool would, plus qualitative assessment. When the tool is built, Stage 3a can call both: MCP tool for deterministic parse validation, agent for quality review.

**Files:** `skills/decompose/SKILL.md` (lines 110-136), `agents/spec-reviewer.md` (lines 12-18)
**Re-test watch:** Does Stage 3a spawn the spec-reviewer and present a verdict? Does Stage 3b check for `.ido4/project-info.json` and STOP if missing?

### OBS-21 — Behavioral Drift: Auto-Initialize Project — FIXED

**What was done:**
- Stage 3b explicitly says: "STOP here. Do NOT initialize the project yourself — methodology choice is a user decision."
- Cross-cutting behavioral guardrail at top of skill covers this case.
- Error handling section includes: "Missing user decisions: explain what's needed and STOP. Never auto-resolve."

**Files:** `skills/decompose/SKILL.md` (lines 10-14, 131-132, 161)
**Re-test watch:** When Stage 3b encounters missing `.ido4/project-info.json`, does the skill explain and stop? Or does it try to run `/ido4dev:onboard` automatically?

---

## Implementation Summary

**Date:** 2026-04-09
**Files modified:** 4
| File | Lines before | Lines after | Key changes |
|------|-------------|-------------|-------------|
| `agents/code-analyzer.md` | 149 | 227 | Write tool, strengthened rule #3, agent reporting (Step 6), formalized canvas patterns, greenfield mode |
| `agents/technical-spec-writer.md` | 181 | 218 | Write tool, canvas validation (Step 0), agent reporting (Step 6), technical capabilities, quality checks |
| `agents/spec-reviewer.md` | 87 | 95 | Pipeline context note for dual-use |
| `skills/decompose/SKILL.md` | 199 | 172 | Behavioral guardrails, mode detection, agent spawning, review checkpoints, Stage 3 split, artifact dir, error handling |

**OBS coverage:** 19 of 21 addressed (OBS-05 not directly addressable — Claude Code internal behavior; OBS-07 now formalized as greenfield mode).
**Deferred:** `validate_spec` MCP tool in `@ido4/mcp` (Stage 3a uses spec-reviewer agent as interim).
**Highest risk:** Agent spawning (OBS-04) — new pattern, no existing precedent in this codebase. Fallback: Approach B (agents as playbooks).
