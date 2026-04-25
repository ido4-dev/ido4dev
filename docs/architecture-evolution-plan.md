# ido4dev Architecture Evolution Plan

**Status:** Active — guiding driver for the current shaping work
**Created:** 2026-04-17
**Owner:** Bogdan Coman (PM/Architect) + Claude (architectural partner)
**Pattern reference:** `~/dev-projects/ido4specs/docs/extraction-plan.md`

This document captures the vision, decisions, and target architecture for shaping ido4dev from a first-iteration plugin into the productized Claude Code experience for the ido4 methodology framework. It exists so that future sessions can re-load full context, decisions don't get re-litigated, and the path from current state to target state stays visible.

---

## 0. How to Use This Document

This is **context and guidance**, not a prescription.

The vision (§1) and design principles (§3) are fixed anchors — they define what we're building and how to judge any candidate solution. Decisions already made (§6) are closed unless explicitly reopened. Everything else in this document is starting-point thinking: reasoned from what we know today, offered to frame the problem and accelerate a future session's work.

When you encounter a specific recommendation — a skill to delete, a workstream task list, a "current thinking" on an open decision — treat it as **the best current answer, not the final one**. If you find a path that better serves the vision, honors the principles, and respects what's been decided, propose it. Out-of-the-box solutions that reshape the problem are often more valuable than faithful execution of a plan someone earlier didn't know enough to write. The goal is something extraordinary — which sometimes requires paths nobody has yet imagined.

**What's genuinely fixed:**
- The vision (§1) — AI agents in human-driven environments, governed by pluggable enterprise methodologies
- The design principles (§3) — especially BRE determinism, methodology-as-data, single source of truth
- The engine layer is well-architected and mostly stays (§2.1, §4.1)
- Decisions made (§6), unless the user reopens one

**What's open for creative rethinking:**
- The target shape of the plugin (§5) — current sketch is a reasoned starting point
- The workstream decomposition (§8) — these are problem areas, not task lists
- The open decisions (§7) — "current thinking" is considerations, not conclusions
- The autonomous PM activation pattern (§5.3) — the three-layer reactive/scheduled/initiative model is one design, not the only one
- How we measure "done" (§9) — better articulations welcome

**One question to carry through any section of this plan:** *"Is there a solution that's simpler, more elegant, or more in service of the vision than what's currently written?"*

When the document is wrong or stale, fix it. This is a living document, not a contract.

---

## 1. Vision

ido4 enables **AI agents to work effectively inside human-driven software development environments, governed by enterprise methodologies they didn't have to learn**.

The thesis is specific. AI coding agents — Claude Code, Cursor, Devin, future agents — can write code, but they start each session with no project context, no awareness of prior decisions, no understanding of why the team works the way it does. Tools like Linear and Jira *track* work after the fact. Methodology books and templates *describe* how teams should work. ido4 occupies the unfilled gap: the **deterministic enforcement layer** that ensures AI agents follow the team's chosen methodology, respect quality gates, maintain epic/sprint/cycle integrity, and build with full institutional context.

This matters because AI-hybrid development is becoming the default. A team adopting Claude Code agents needs a way to ensure the agent doesn't ship features half-built (Hydro Epic Integrity), doesn't bypass DoD (Scrum), doesn't extend bets past the circuit breaker (Shape Up). Today no system enforces these. ido4 does — deterministically, with a 35+ step Business Rule Engine that's pure code, not LLM-vibes.

**The novelty:** the methodology choice is *pluggable*. Hydro, Scrum, and Shape Up ship with the system; new methodologies can be added by writing a profile (data) plus a methodology-native prompt set. The Business Rule Engine composes its validation steps per profile. The MCP server registers profile-aware tools dynamically. The user-facing UX adapts terminology automatically. This is methodology-as-platform, not methodology-as-template.

**Target audience as the system matures:** small teams shipping fast with AI (founder-engineers, 3-5 person AI-native teams), then mid-sized teams adopting AI agents alongside human developers, then enterprise teams that need their existing methodology enforced on AI work.

---

## 2. System Architecture

The ido4 system has two clean architectural layers. The work in this document is bringing the plugin into alignment with the engine that already exists below it.

### 2.1 The Engine: `@ido4/core` + `@ido4/mcp`

**`@ido4/core`** — Domain layer. Pure TypeScript. Zero CLI/MCP/UI dependencies.

- **Profile system** — `MethodologyProfile` data type + `ProfileConfigLoader` reading `.ido4/methodology-profile.json`. The profile defines containers (Wave/Sprint/Cycle), states with semantics (review/blocked/terminal/active/ready), work item types, principles (as data, not code), and BRE pipelines per transition.
- **Business Rule Engine** — `ValidationPipeline` + `ValidationStepRegistry` + 35+ composable validation steps in `domains/tasks/validation-steps/`. Each step is profile-aware via `StepDependencies.profile`. The pipeline composition per transition lives in `MethodologyConfig.fromProfile()`. Validation runs deterministically — no LLM, ever, anywhere in the pipeline.
- **Domain services** — TaskService, ContainerService, EpicService, DependencyService, AnalyticsService, ComplianceService, AgentService, AuditService, WorkDistributionService, MergeReadinessService, SandboxService, IngestionService.
- **Service container** — DI-driven `ServiceContainer` providing all services to consumers.

**`@ido4/mcp`** — MCP server surface. Wraps `@ido4/core` for any MCP-compatible client.

- **Tools** — Split into profile-independent (project, dependency, sandbox, audit, analytics, agent, compliance, skill-data, distribution, coordination, gate, ingestion) and profile-dependent (task, container, epic). The server supports two modes via `helpers/methodology-activation.ts`:
  - **Bootstrap mode** (no profile): only profile-independent tools register; a `setup` prompt directs users to `init_project` or `create_sandbox`
  - **Full mode** (profile loaded): all tools register immediately
  - Dynamic transition: after init writes `.ido4/methodology-profile.json`, `activateMethodology()` registers the profile-dependent surface
- **Aggregators** — `get_standup_data`, `get_health_data`, `get_compliance_data`, `get_board_data`, `get_task_execution_data`. Single composite calls returning full context for skill consumption. Profile-aware via `aggregators/wave-detection.ts` (misnamed — implementation is fully profile-driven; should be `container-detection.ts`).
- **Prompts** — User-invocable methodology-aware ceremony instructions. `PromptContext` (in `prompts/prompt-context.ts`) derives all terminology from profile data: `containerSingular/Plural/Label`, `itemSingular/Plural`, state names, principles array, tool names dynamically computed from profile (`list_${execContainer.id}s` etc). The `PromptGenerators` interface defines 8 ceremonies (standup, planContainer, board, compliance, health, retro, review, execute). Three implementations exist — `HYDRO_GENERATORS`, `SCRUM_GENERATORS`, `SHAPE_UP_GENERATORS` — each encoding that methodology's native reasoning, not vocabulary swaps. Scrum prompts genuinely understand Sprint Goal as commitment, DoR/DoD as quality gates, velocity-as-forecasting-not-performance-metric. Shape Up prompts genuinely encode hill charts and "100% ship rate is bad."

### 2.2 The Plugin: `ido4dev`

**Role:** the Claude Code productization of the engine. Brand-specific UX surface plus Claude Code-only constructs (agents, hooks, skills with frontmatter behavior controls).

**What belongs in the plugin:**

- **First-touch experiences** — onboard, guided-demo (stateful workflows with user gates between stages)
- **Stateful workflows** — ingest-spec, sandbox lifecycle (need user gating between stages, side effects, branching)
- **The project-manager agent** — agents are a Claude Code construct; profile-aware reasoning lives here
- **Hooks** — entirely a Claude Code feature, can't live in MCP
**What does NOT belong in the plugin:**

- **Ceremony slash commands** — per §6 #17, these live in MCP Prompts and are invoked as `/mcp__plugin_ido4dev_ido4__<ceremony>`. The plugin does not shell over them.
- Per-methodology copy-paste skills duplicating MCP Prompts (the set `standup`, `plan-wave/sprint/cycle`, `board`, `health`, `compliance`, `retro-wave/sprint/cycle` was deleted in Phase 2.2)
- Spec authoring guidance (`spec-quality` belongs in `ido4specs`)
- Re-implementations of the bundled validator (`spec-validate` duplicates ido4specs's `tech-spec-validator.js`)
- Developer integration tests masquerading as user skills (`pilot-test` should be branded as developer tooling)

### 2.3 The Methodology Framework

**Adding a new methodology** ideally requires:

1. A profile JSON file (or in-code object) defining containers, states, semantics, work items, principles, and BRE pipelines per transition
2. One TypeScript file implementing `PromptGenerators` for that methodology's native reasoning
3. Registration in the `GENERATORS` dispatch map in `prompts/index.ts`

The framework currently meets steps 1 and 3 cleanly. Step 2 is TypeScript today. A future enhancement is markdown-template authoring with profile-variable interpolation, lowering the barrier so non-engineers can contribute methodology prompts. This isn't blocking the current work.

**Other clients beyond Claude Code** consume the engine through their own UX layers. A Cursor extension, a Cline plugin, a custom integration — all use the same MCP server, get the same methodology-aware tools, the same profile-driven prompts. ido4dev is one productization; others are possible.

---

## 3. Design Principles

These are codified from the architectural conversations and serve as the test for any future change. When in doubt, return here.

### 3.1 BRE is deterministic; LLM is for judgment, not enforcement

The Business Rule Engine validates state transitions in pure code. No LLM in the validation pipeline, ever. Hooks that surface insights from BRE results read structured data deterministically and emit templated messages — they do not LLM-prompt Claude to interpret tool responses. The LLM is invoked only when judgment is needed (the PM agent reasoning about a pattern, a skill synthesizing context for the user).

### 3.2 Methodology is data; principles are not hardcoded

Profile defines principles as `{ name, description }[]`. Validation step composition per transition lives in profile pipelines. Container terminology, work item names, state semantics — all profile data. No skill or agent should hardcode methodology-specific assumptions. If a piece of code branches on methodology name in a `switch` or `if-else`, it's drift.

### 3.3 MCP Prompts for ceremonies; plugin skills for stateful workflows

Stateless ceremony reasoning (standup, plan, retro, board, health, compliance, review, execute) belongs in MCP Prompts: portable across MCP clients, single source of truth, profile-driven, methodology-native, ships versioned with the engine. Stateful workflows with user gates between stages (onboard, ingest-spec, sandbox lifecycle) belong in plugin skills: the skill boundary IS the user checkpoint.

### 3.4 Hooks are the autonomous nervous system

Hooks fire on events (tool calls, time, session boundaries), apply deterministic detection (templates, threshold checks, structured-data analysis), and route to either user-visible insights (templated) or LLM-driven analysis (agent invocation). Hooks themselves are deterministic; the LLM is downstream of the hook decision, never inside it.

### 3.5 Single source of truth per concern

Format validation: bundled validator (CLI from `@ido4/spec-format` or `@ido4/tech-spec-format`). Methodology terminology: profile data. Ceremony reasoning: MCP Prompts. State transitions: BRE. No concern should have two implementations. If something has parallel implementations, one is the fossil.

### 3.6 Profile-aware everywhere; no methodology hardcoding

Skills, agents, hooks, aggregators, helper functions — all derive methodology-specific behavior from the loaded profile, never from hardcoded assumptions. The current PM agent's "5 Unbreakable Principles" hardcoded as Hydro principles is the canonical anti-example to avoid.

### 3.7 Principle-based language over rule accumulation

Per `~/dev-projects/ido4-suite/docs/prompt-strategy.md`. Skills and agents written in principle-based prose with concrete good/bad examples, not rule-list checklists. Anthropic's Opus 4.5/4.6 models respond better to motivated principles than aggressive directives. Audit for rule accumulation; prefer net reduction over net addition. The "iteration-accumulation warning" in prompt-strategy.md is real — every round of testing tempts adding rules; resist by asking whether enforcement could move to a deterministic layer instead.

### 3.8 Format contracts as architectural seams

Two trust boundaries (strategic spec, technical spec) implemented as parser packages bundled into producer/consumer plugins. Version markers fail-fast on major mismatches. Adding a third artifact type would create a third boundary. The format itself is the moat — vendors can plug into any seam.

### 3.9 Institutional memory as the operating substrate

The hooks/rules/state layer is not a technical convenience — it is the operating substrate for ido4's core product value. At enterprise scale, neither pole works: **humans + old tools + AI coding assistants** leaves AI's speed capped at human-coordination speed (Jira is write-only; knowledge goes in and doesn't come back out when someone needs it); **full AI without governance** lets drift accumulate invisibly. ido4 bridges them by **operationalizing institutional memory** — the system remembers methodology, dependencies, compliance trajectory, epic-container relationships, open findings, and imposes that memory at the moment it's relevant, not when a human happens to look.

The mutuality is the load-bearing insight: AI agents benefit as much as humans. An agent picking up a task gets upstream context, downstream implications, compliance posture, epic position — handed to it structurally instead of reconstructed ad-hoc. An AI agent operating inside this substrate is categorically more capable than one without. This is what makes ido4 the right primitive for enterprise-scale AI coding: not a constraint on AI, but what unlocks it.

**Operational consequence for rule/hook/state design:** the test for any rule or signal is not "does this improve UX?" but **"does this operationalize institutional memory — either the system remembering something across time, or surfacing something the user or agent needs but doesn't have in context?"** Rules that don't pass this bar are noise, even if they're technically valid. Concrete example: during Phase 3 Stage 4 the rule audit applied this test and cut 2 of 7 sketched rules (CS003 recommendations-present, CH003 no-next-task-available) as noise, keeping 5 with bodies reshaped to surface reasoning the user/agent actually lacked. See suite `hook-and-rule-strategy.md` §2.6 ("silence is a feature") for the enforcement heuristic.

---

## 4. Current State Assessment

### 4.1 What's working — the engine is genuinely excellent

The methodology framework already exists and is well-architected:

- **Profile system** in `@ido4/core/config/`: `ProfileConfigLoader`, `MethodologyConfig.fromProfile()`, schema validation, dynamic loading
- **BRE composition**: 35+ validation steps registered in `ValidationStepRegistry`, composed per transition by `MethodologyConfig`, profile-aware via `StepDependencies`
- **Dynamic activation**: `helpers/methodology-activation.ts` lets MCP server bootstrap without profile, register profile-dependent surface after init writes config
- **PromptContext**: derives all UX terminology from profile data
- **Three methodology-native prompt sets**: Hydro/Scrum/Shape Up, each encoding deep methodology expertise
- **Aggregators**: composite tools returning full context for skill consumption with profile-aware filtering

This is the foundation. The work ahead is mostly removing duplicates and inconsistencies in the plugin layer, plus completing what hasn't been built yet (autonomous PM activation).

### 4.2 What's debt — three classes

#### Class 1: Methodology coherence in the plugin

The plugin pre-dates the framework. Skills hardcode Hydro assumptions or duplicate the framework's per-methodology prompt sets:

- **PM agent** (`agents/project-manager/AGENT.md`) hardcodes "5 Unbreakable Principles" as Hydro principles. Description says "wave-based development governance expertise." State machine and lifecycle are Hydro/Scrum but break for Shape Up's Shaped→Betting→Shipped/Killed flow.
- **standup, board, health, compliance** plugin skills duplicate MCP Prompts that already exist with full methodology awareness.
- **plan-wave, plan-sprint, plan-cycle** are three separate skills with copy-paste scaffolding (60-70% identical Step 0/Step 1/Anti-patterns) and prose-based methodology rejection ("this is Scrum only — don't reference waves"). MCP Prompt has one `planContainer` per methodology, profile-named.
- **retro-wave, retro-sprint, retro-cycle** — same pattern as plan-*.
- **sandbox-hydro, sandbox-scrum, sandbox-shape-up** — soft-deprecated skills still in the manifest, replaced by `guided-demo` but never removed.

#### Class 2: Enforcement layer drift

Code chose prose over structure, or wrong layer over right layer:

- **PostToolUse hooks** in `hooks/hooks.json` use LLM prompts (`"type": "prompt"`) to ask Claude to assess tool results. The structured BRE response already conveys what changed; the hook should read it deterministically and emit templated messages.
- **`compliance` skill** uses `context: fork` (subagent execution). `prompt-strategy.md:332` documents that plugin-defined subagents hang at ~25-30 tool uses. Compliance is a heavy skill with a long Part 2 audit + Part 3 synthesis — exactly where the hang would manifest. Real bug.
- **`ingest-spec` skill** doesn't bundle `tech-spec-validator.js` for fast pre-validation. The "parses upstream, fails downstream" failure mode in `~/dev-projects/ido4-suite/docs/cross-repo-connections.md:188` is a documented real-world failure caused by parser version skew. Bundling the validator in ido4dev for fail-fast structural pre-validation closes this seam.
- **`compatibility.mjs`** has two unsynchronized sources of truth: a heuristic regex extracts tool names from skill prose, and a hand-curated `criticalTools` list is checked separately. Drift waiting to happen.
- **`spec-validate` skill** re-implements parser checks in prose. Duplicates the bundled validator.

#### Class 3: First-iteration cruft

Smaller items, individually trivial, collectively signaling "never revisited":

- Stale references in `guided-demo/SKILL.md:158-159` (`/ido4dev:explore`, `/ido4dev:init` — neither exists) and `sandbox-explore/SKILL.md:99` (`/ido4dev:init`)
- TodoWrite bug in `ingest-spec/SKILL.md:32` — used in body, not in `allowed-tools` frontmatter
- PM agent name `ido4-project-manager` doesn't match directory `agents/project-manager/`
- Inconsistent `disable-model-invocation` policy across skills (no design rule)
- Two ways to get compliance data (`compute_compliance_score` direct call vs `get_compliance_data` aggregator) with no rule
- `wave-detection.ts` misnamed — implementation is profile-driven, file name is Hydro-era fossil
- Validation step count drift across docs (32, 34, 35 — pick one and propagate)
- `pilot-test` is a developer integration test mixed with user-facing skills
- `spec-quality` belongs in `ido4specs`, not `ido4dev` (post-extraction migration debt)
- Hydro default bias in `onboard/SKILL.md:46` ("Hydro is a great starting point — it showcases the most governance principles")
- `.mcp.json` has no SessionStart fallback; if `npm install --production` fails, plugin is dead with no graceful degradation

### 4.3 What hasn't been built yet

- **Autonomous PM activation** — current PM agent has `proactive: yes` in spirit (the "Don't wait to be asked" section, lines 252-261) but no actual activation mechanism. Needs hooks + cron + memory wired together.
- **Stop hooks** for end-of-session handoff
- **Skill-scoped hooks** per `prompt-strategy.md`
- **PreToolUse hooks** for risky transition gating
- **Markdown-template authoring path for MCP Prompts** (future enhancement; not blocking current work)
- **Documented contract #5** in `interface-contracts.md` — the only contract without a canonical file

---

## 5. Direction of Travel (not a blueprint)

The sketch below is where current thinking points — the shape that honors the vision and principles most cleanly given what we know today. Treat it as a reasoned starting point, not a blueprint. If a simpler, more elegant, or more extensible shape emerges during the actual work, reshape it and update this section.

### 5.1 Plugin contents (after diet)

Approximately 5 skills (down from 21), 1 agent (rewritten), enriched hooks. Ceremonies live in MCP Prompts and are invoked as `/mcp__plugin_ido4dev_ido4__<prompt>` slash commands (per §6 #17).

**Skills retained (plugin layer — stateful workflows only):**

- **onboard** — first-touch zero-friction setup + walkthrough
- **guided-demo** — four-act methodology-aware demo on existing sandbox
- **sandbox** — lifecycle CRUD (create/route/reset/destroy)
- **sandbox-explore** — interactive exploration with structured paths
- **ingest-spec** — pre-validated technical spec → bundled-validator pre-check → MCP dryRun preview → user approval → ingest

**Ceremony surface (MCP layer — not plugin skills):**

`/mcp__plugin_ido4dev_ido4__standup`, `/mcp__plugin_ido4dev_ido4__plan`, `/mcp__plugin_ido4dev_ido4__board`, `/mcp__plugin_ido4dev_ido4__health`, `/mcp__plugin_ido4dev_ido4__compliance`, `/mcp__plugin_ido4dev_ido4__retro`, `/mcp__plugin_ido4dev_ido4__review`, `/mcp__plugin_ido4dev_ido4__execute-task`. Methodology-aware (adapts to the active profile via `PromptContext` + per-methodology `PromptGenerators`). Single source of truth lives in `@ido4/mcp/src/prompts/`.

**Skills removed:**

- standup, board, health, compliance (use MCP Prompts)
- plan-wave, plan-sprint, plan-cycle (use MCP `plan-${container}` Prompt)
- retro-wave, retro-sprint, retro-cycle (use MCP `retro` Prompt)
- sandbox-hydro, sandbox-scrum, sandbox-shape-up (already soft-deprecated; hard-remove)
- pilot-test (move to dev tooling or rebrand `pilot-test:dev`)
- spec-validate (use bundled tech-spec-validator)
- spec-quality (move to ido4specs)

**Agent (refactored):**

- **project-manager** — profile-aware. Loads principles, state machine, lifecycle from active profile at session start. Drops "wave-based development" from description. Same deep PM mental model, same data-grounded reasoning, but methodology-neutral identity with profile-loaded specifics.

**Hooks (rebuilt):**

- **SessionStart**: npm install MCP server, load profile, prime PM agent context, gracefully degrade if install fails (don't leave plugin functionally dead with no message)
- **PreToolUse on risky transitions**: dryRun first, prompt user with `permissionDecision: "ask"` if violations
- **PostToolUse on state transitions**: deterministic structured-data → templated insight ("Completing #42 unblocked #45 and #47"). No LLM in hook itself.
- **PostToolUse for autonomous PM activation**: deterministic deviation detection (compliance drop, blocker threshold, recurring pattern) → inject PM agent invocation
- **Stop hook**: persist current state to memory, suggest next-session focus
- **Skill-scoped hooks** per skill (e.g., ingest-spec Stop hook verifying ingest succeeded, plan-* PostToolUse catching assignment violations)

### 5.2 Engine cleanups (target)

- ~~Rename `aggregators/wave-detection.ts` → `aggregators/container-detection.ts`~~ — **deferred per §6 #16** to the ido4 engine's own Phase 2 plan. The misnaming is real but the fix isn't ours to do unilaterally.
- Document contract #5 (the MCP runtime dependency) with a canonical file referenced from `interface-contracts.md` — suite-level, no engine coordination required.
- Reconcile validation step count across docs (one number, propagated everywhere) — plugin and suite docs only.
- (Future) Markdown-template authoring path for MCP Prompts — would require engine coordination.

### 5.3 Autonomous PM (new build)

Three activation patterns wired together:

1. **Reactive (hooks)** — PostToolUse hooks fire on every governance-relevant tool call, apply deterministic deviation detection, invoke PM agent on match. Pattern: "PM walks past your desk and notices something."
2. **Scheduled (cron)** — `CronCreate` schedules periodic PM check-ins. PM runs `/health` silently, persists findings, surfaces only on change. Pattern: "PM doing morning rounds before the team starts."
3. **Initiative (memory)** — SessionStart loads "open governance items" from memory, PM surfaces unfinished business at session start. Pattern: "PM picking up where you left off."

PM agent's reasoning stays in the agent prompt; activation lives in hooks/cron/memory infrastructure. The agent is silent 90% of the time; the 10% interventions are high-signal.

**What "smart" means concretely:**

- **Threshold-based pattern recognition**: compliance B → C → surface; blocker count > 20% → surface; same dependency blocking 2+ tasks → surface; routine activity → silent
- **Memory-driven differentials**: "Throughput dropped 20% from last wave" beats "Throughput is 0.6/day"
- **Restraint as a feature**: high threshold for surfacing, so when it fires, it means something
- **Activation deterministic, reasoning LLM**: hooks fire on patterns, agent reasons on signals

---

## 6. Decisions Made

These are calls already made during the conversations that produced this document. Capture for future-context — not for re-litigating.

| # | Decision | Notes |
|---|---|---|
| 1 | Multi-methodology equality is the goal | "I want to have at the end a multi-methodology enabled product, with clear separation between what methodology universal elements could be, and where the methodology is injected. Ideally I'd like to have such good architecture and design, that adding a new methodology to be super easy." |
| 2 | No live users; build at our own pace | Public announcement deferred until system is ready. Removes migration burden. |
| 3 | BRE remains fully deterministic | MCP Prompts are a separate ceremony layer, not a contradiction. They don't overlap with the BRE. |
| 4 | MCP Prompts are the architecture for ceremonies | Plugin skills duplicating them are fossils to delete. |
| 5 | ido4dev is the Claude Code productization, not just UI | Stateful workflows + agent + hooks belong here; ceremonies don't. Other MCP clients are valid future productizations. |
| 6 | PM agent should monitor silently and trigger on deviation | Real-PM behavior. Built via hooks + cron + memory, not just prompt changes. |
| 7 | sandbox/onboard/guided-demo/sandbox-explore stay in plugin | Stateful workflows with user gates — exactly what plugin skills are for. |
| 8 | spec-quality moves to ido4specs | Authoring guidance, not governance. Migration debt. |
| 9 | spec-validate is duplicate; delete | Bundled tech-spec-validator is the authoritative source. |
| 10 | pilot-test is dev tooling, not user skill | Brand as such or move out of user skills surface. |
| 11 | wave-detection.ts is misnamed, not leaked | Implementation is profile-driven; rename only. |
| 12 | Three-plugin segmentation is deliberate | Earlier decision (captured here for completeness): gradual onboarding, monolith deferred. |
| 13 | Methodology profile configurability is future work | Earlier decision (captured for completeness): revisit when product matures. |
| 14 | ~~UX approach for removed ceremony skills: thin shell skills in the plugin~~ — SUPERSEDED by #17 | Decided 2026-04-17. Shell architecture was built and abandoned after the Phase 2.1 live test invalidated its premise. Kept for history. |
| 15 | Workstream sequencing: four phases over ~6 weeks | Decided 2026-04-17. **Phase 1** (week 1): WS4 + WS1 micro-bugs in parallel. **Phase 2** (weeks 2–3): WS1 bulk, bracketed by the still-open ido4specs→ido4dev E2E smoke test (baseline before, regression check after). **Phase 3** (weeks 4–5): WS2, starting with design brief, then implementation. **Phase 4** (weeks 5–6+): WS3, starting with creative-alternatives investigation, then design, then implementation. CronCreate availability verified early in Phase 3; WS3 has viable paths with or without it. Replaces §7.2 (closed). |
| 16 | Defer `wave-detection.ts` rename to the ido4 engine's own roadmap | Decided 2026-04-17 mid-Phase-1. Discovery: the ido4 monorepo has a comprehensive rename plan at `~/dev-projects/ido4/methodology-runner/phase-0-rename.md` covering wave/epic → container/integrity terminology across ~99 files. That plan **explicitly defers `wave-detection.ts` to Phase 2** (lines 22, 319, 597) because maintainers classify it as a "logic change," not a mechanical rename. Doing it out of band in WS4 would conflict with the engine roadmap. Removed from WS4 starting-point analysis; future engine-side work in this plan should coordinate with whatever phase of the engine's roadmap is active when the work is picked up. |
| 17 | UX approach for removed ceremony skills: **Option A — MCP Prompts as the ceremony surface, no plugin shells** | Decided 2026-04-17 after Phase 2.1's shell architecture was abandoned. Supersedes #14. Ceremonies are invoked directly as `/mcp__plugin_ido4dev_ido4__<prompt>` slash commands — verified to work natively in Claude Code against all three methodology profiles. Plugin skills remain for stateful workflows only (onboard, guided-demo, sandbox, sandbox-explore, ingest-spec). Rationale: the shell pattern was workaround infrastructure for a problem that does not exist — MCP Prompts are slash-accessible — and introduced its own problem (name collisions on skill replacement). The verbose MCP slash syntax (`/mcp__plugin_ido4dev_ido4__standup` vs `/ido4dev:standup`) is an aesthetic cost accepted as the right trade per §6 #2 (no live users — the cost is deferred rather than architected around). `render-prompt-cli` reverted in `@ido4/mcp`; 10 ceremony duplicate skills deleted from `ido4dev`; all consumer refs (PM agent, onboard, guided-demo, ingest-spec, sandbox, pilot-test, hooks, README, CLAUDE.md) updated to the MCP namespace. Details in `phase-2-brief.md` and §11 status log. |

---

## 7. Open Decisions

These need user calls before implementation can land.

### 7.1 ~~Branded slash command UX vs. native MCP Prompt UX~~ — RESOLVED

**Resolved 2026-04-17** → see §6 decision #14. Shell approach (plugin skills delegating to MCP Prompts) is the path. Kept here as a pointer for history. Reopen only if a simpler path becomes visible that wasn't today.

### 7.2 ~~Workstream sequencing~~ — RESOLVED

**Resolved 2026-04-17** → see §6 decision #15. Four-phase sequence committed: Phase 1 (WS4 + WS1 micro-bugs parallel) → Phase 2 (WS1 bulk, E2E-bracketed) → Phase 3 (WS2, design brief first) → Phase 4 (WS3, creative-alternatives investigation first). Kept here as pointer for history.

### 7.3 Markdown-template authoring path for MCP Prompts

Lower contribution barrier (non-TS engineers can author methodology prompts). Future enhancement — not blocking current work. Decision needed: scope into this evolution or defer.

### 7.4 Revisit ido4dev distribution (decataloguing)

`ido4dev` is deliberately not in the `ido4-plugins` marketplace catalog. The decision is captured in `~/dev-projects/ido4-suite/docs/design-decisions.md` DD-001 (rationale, cost, revisit conditions). This entry exists to queue the revisit explicitly so it doesn't fall through the cracks.

**Revisit triggers (any of):**
- Phase 4 landing — architecture stable; a more-capable plugin is paradoxically safer to catalogue because onboarding defaults can be more conservative
- A real user or team asks for easier install (distribution pressure)
- Claude Code plugin system gains first-class primitives for destructive operations (semantic gating would make marketplace distribution safe by construction)

**Current thinking:** leave as-is until at least one trigger fires. Don't re-catalogue during Phase 3 or Phase 4 — re-cataloguing *while* the architecture is shifting is a coherence risk. Post-Phase-4 is the earliest sensible revisit window.

### 7.5 PM agent profile-aware identity — pure plugin work or core change?

The PM agent's principles, state machine, and lifecycle should load from the profile. Two implementation paths:

- **Plugin-only**: PM agent reads `.ido4/methodology-profile.json` directly via Read tool, parses it, loads principles. Self-contained, no core changes.
- **Core-supported**: Add a `profile.agentDefinition` field (or similar) that gives the profile a "voice" the agent renders. More architectural, more work.

**Current thinking:** Plugin-only first, to avoid premature core abstraction. Promote to core if a second agent emerges that needs the same pattern — YAGNI applies. But an unexpectedly clean core-level design that emerges from the work might flip this — stay open.

### 7.6 Routines (cloud-scheduled agent runs) — distinct from `CronCreate`-the-tool

The original framing of this entry conflated two primitives. Pre-Phase-4 research (2026-04-25, claude-code-guide subagent over Anthropic's primary docs at code.claude.com/docs/en/routines + tessl.io coverage) clarified the distinction:

| Primitive | Surface | Where it runs | Persistence | Reach |
|---|---|---|---|---|
| `CronCreate` / `CronList` / `CronDelete` | Internal Claude tools | The user's CLI session | 7-day expiry; needs open session | Full local context (state.json, plugin skills, `${CLAUDE_PLUGIN_DATA}`) |
| **Routines** (`/schedule` CLI, claude.ai/code/routines) | User-facing | **Anthropic cloud sandbox** | Account-scoped, durable, survive offline/reboot | GitHub repo clone + MCP connectors registered to the **user's account** — **NOT** plugin skills, **NOT** `${CLAUDE_PLUGIN_DATA}`, **NOT** `state.json` |

Routines is the durable scheduled-PM substrate (account-scoped, runs while user is offline, ~1-hour minimum interval, account-level daily run cap: Pro 5 / Max 15 / Team 25; one-off runs are exempt). The `CronCreate` family is the in-session scheduling primitive — different shape, narrower lifetime.

**Status (2026-04-25):** **Deferred from Phase 4** by user decision. Phase 4 ships the local-substrate-only design — reactive PM agent rebuild + audit hooks + SessionStart banner enrichment. The dominant ido4 use case (founder-engineers, AI-driven work, single-stakeholder visibility per §1) doesn't yet require the multi-stakeholder distribution Routines uniquely enables.

**Constraints if/when Routines re-enters scope:**
- A routine's executing prompt is the agent's identity content; the plugin would ship a markdown template the user pastes into `/schedule`. The plugin cannot programmatically install routines on the user's behalf without a consent boundary (account-scoped resource, billed against the user's subscription).
- A routine cannot read `state.json`, cannot invoke plugin skills, and cannot access `${CLAUDE_PLUGIN_DATA}`. It can: clone the repo, call MCP connectors registered to the user's account (so `@ido4/mcp` is reachable if the user has the connector linked), post artifacts to GitHub/Slack via connectors.
- Routine artifacts naturally live in GitHub (issue comments / tracking issues) where governance records belong.

**Re-open triggers (any one fires):**
1. **Multi-stakeholder distribution becomes load-bearing** — the team has consumers of governance findings (leads, ICs, PMs) who don't open Claude Code daily and need findings to land in their normal surfaces (GitHub issues, Slack).
2. **Cross-session AI-work-product audit becomes concrete** — the in-session reactive layer (Phase 4) has proved out and consistently misses patterns that span sessions (e.g., "AI agent X has been bypassing validation for 2 weeks across 12 sessions"). This trigger overlaps with §7.7 event-log promotion.
3. **Real users arrive** (per §1 audience expansion). Routines' value shape is closer to "team governance" than "founder-engineer governance"; the audience that needs it is the next-stage audience.

**Current thinking:** when any trigger fires, the natural shape is a small `phase-N-routines.md` brief that ships 1–2 routine prompt templates (weekly compliance audit; weekly AI-work-product audit summary), an `onboard` paragraph teaching the user `/schedule`-ing them, and the `§7.7` event log if cross-session pattern queries are involved. Plugin-side work; one engine ask if MCP-connector linkage needs new tools to expose audit-friendly summaries.

### 7.7 Event log promotion — when does `state.json` upgrade to `events.ndjson`?

Phase 3 shipped the simpler of two layered patterns from `~/dev-projects/ido4-suite/docs/hook-and-rule-strategy.md`: §4.6 (state.json summary) rather than §4.7 (append-only event log). The choice was deliberate YAGNI — no Phase 3 rule required cross-session event history; shipping rotation, schema versioning, and query API for a use case no current rule needs would be adoption-for-adoption's-sake (§5.2 anti-pattern).

However, several rules that would create real governance value were deferred because they require this infrastructure. Tracking them here so the upgrade trigger is visible and future sessions don't re-litigate.

**Concrete pending triggers (rules that would earn the upgrade):**

1. **Gate `approve_task` when there's no preceding `review_task` on this issue in the same session** — classic "skipping a ceremony" pattern; the BRE already enforces state machine constraints but can't detect the *temporal* pattern of "you never actually reviewed this." Requires: per-issue transition history scoped to the session.
2. **Gate retry of a transition that just failed BRE validation** — detects the "keep trying until it works" anti-pattern (often with `skipValidation`). Requires: event stream of recent validation failures, queryable by issue + transition type.
3. **"Task X has been blocking Y over 3 sessions"** — cross-session pattern detection; the blocker keeps being noted in handoff but nobody acts. Requires: multi-session event history + a query like "tasks blocking others for N sessions."
4. **"Agent tends to skip reviews — 3-session pattern"** — behavioral-trend rule; requires per-agent transition history across sessions.
5. **"Epic E now spans containers C1 and C2" (observed from session)** — the preventive version of Stage 4's post-hoc AT001 integrity rule. Requires: epic-container tracking across time, not just the current snapshot.

Any one of these rules, if it becomes concrete enough to write, triggers the upgrade work.

**Upgrade work (when triggered):**

1. Extend `hooks/lib/rule-runner.js` to append one NDJSON event per invocation to `${CLAUDE_PLUGIN_DATA}/hooks/events.ndjson` alongside the existing `state.json` update.
2. Add rotation (10 MB or 30 days, keep 3 rotated files gzipped — total bounded ~40 MB).
3. Add a query API the runner exposes to rules (e.g., `state.query_events({since, matching})` callable from `when:` expressions).
4. Update `hook-and-rule-strategy.md §4.7` to reflect the promotion, and this §7.7 to record the resolution.

**Current thinking:** defer until Phase 4 at earliest. The first concrete rule is likely to surface during Phase 4's PM agent work — behavioral-pattern rules are the PM agent's natural territory. If Phase 4 can achieve its goals with the current state.json substrate, defer further. Avoid the premature-abstraction anti-pattern; the log is architecturally correct but currently YAGNI.

### 7.8 Memory architecture — should ido4 deliberately participate in Claude Code's memory system?

Phase 3 Stage 6 research (2026-04-22) surfaced a larger question than the stage was scoped to answer. The original Stage 6 scope (PostCompact reseed hook) depended on a primitive that doesn't exist in current Claude Code. But the underlying concern — "governance state erodes across long sessions, compactions, sub-agent contexts, and new sessions" — is real and broader than a single hook would solve.

Claude Code exposes a memory system (`CLAUDE.md`, `~/.claude/projects/<proj>/memory/MEMORY.md` tree) that:
- Auto-loads at SessionStart
- Auto-re-injects after compaction
- Is readable by all agents/skills in the session
- Persists across sessions without plugin intervention

The plugin currently writes NOTHING to this system. Its memory architecture is:
- `state.json` — operational memory (rule baselines, fire timestamps) in `${CLAUDE_PLUGIN_DATA}`, not auto-reloaded
- SessionStart banner — minimal signal, one line
- Nothing else

**The question this tracks:** should ido4 author memory-file content deliberately — a durable, human-readable "governance summary" that Claude sees automatically at every session start and after every compaction — and if so, what's the architecture (write frequency, scoping, interaction with other plugins, UX implications)?

**Why it matters:** Phase 4's PM agent reasons over governance state. The quality of that reasoning depends heavily on what the agent (and Claude in general) has access to without re-deriving it. If the plugin layers on top of Claude Code's memory system instead of running a parallel isolated state layer, every downstream consumer benefits without separate plumbing.

**Why deferred to a separate session:** this investigation is cross-cutting across the ecosystem (not just ido4dev — ido4specs and ido4shape potentially benefit from the same pattern) and deserves a fresh altitude rather than being bolted onto Phase 3 as a patch. Kickoff brief at `~/dev-projects/ido4-suite/briefs/memory-architecture-investigation.md`.

**Research angles named in the kickoff brief:**
1. How Claude Code's memory system works in architectural depth (scoping rules, structure, plugin authorship patterns, concurrent-session behavior, 2026 changes)
2. What actually erodes in real ido4 sessions today — empirical (compaction? sub-agent isolation? attention drift? skill-invocation context resets?)
3. Plugin-authored durable memory patterns in the wild (OSS plugins doing this well; anti-patterns; UX implications)

**Expected output:** a plan + findings artifact that either concludes "do nothing, the current architecture is sufficient" OR proposes a concrete memory-architecture design scoped as a cross-repo initiative.

**Current thinking (updated 2026-04-25 after Phase 3 closing smoke test):** **preliminary-resolved → no MEMORY.md authorship needed.** The Phase 3 smoke test verified the SessionStart `additionalContext` path is reliable for governance context delivery (Scenario 1: the `[ido4dev] Resuming` banner reached Claude's context at session start exactly as designed). Combined with the existing persistence layers — `state.json` (atomic, plugin-private), GitHub issues (durable institutional record), `.ido4/project-info.json` + BRE state (project-level truth) — ido4 already has a four-layer model that covers its actual use cases.

The four layers, with distinct roles:

| Layer | Scope | Persistence | Reach into Claude |
|---|---|---|---|
| `state.json` | Plugin-private | Across sessions, atomic | Read by SessionStart hook + by hook subprocesses for diffs |
| GitHub issues | Project, team-shared | Durable institutional record | On-demand via MCP tool calls |
| `.ido4/project-info.json` + BRE state | Project (in repo) | File-based, durable | Read by skills + MCP tools |
| **SessionStart `additionalContext`** | **Per-session boot** | **Re-fires every session start** | **Direct — reaches assistant at turn 1 (proven Scenario 1)** |

The fourth layer serves the same role MEMORY.md would, on a different mechanism. Adding MEMORY.md authorship would: duplicate persistence already covered by state.json; introduce a fifth layer with unclear canonicality; pollute the user's MEMORY.md namespace with plugin-managed content; depend on auto-reload behavior already largely covered by SessionStart re-firing on resume.

Honest accounting of what we'd lose by NOT writing to MEMORY.md:
- **Post-compaction context:** MEMORY.md auto-reloads after `/compact`; SessionStart doesn't re-fire mid-session. Mitigation: auto-compaction is rare on Opus 4.7 + 1M context (~150K threshold); state.json persists; the assistant can be instructed to re-read state if needed.
- **User-reviewability:** MEMORY.md is plain-text, user-editable. state.json is structured JSON. Mild loss; governance state isn't supposed to be user-edited anyway.
- **Anthropic-blessed pattern alignment:** MEMORY.md is the canonical primitive. Not using it is a design choice, not a mistake.

None of these are load-bearing.

**Phase 4 design implication:** the PM agent's autonomy work doesn't need MEMORY.md authorship. It can:
- Enrich the SessionStart `additionalContext` banner to surface richer governance summaries (open findings, recent grade trajectory, blocked-task patterns)
- Read `state.json` directly via the Read tool when invoked
- Use cross-session pattern detection via §7.7 event-log promotion if a concrete rule needs it

**Status:** investigation downgraded from "separate session required" to "satisfied by analysis." The kickoff brief at `~/dev-projects/ido4-suite/briefs/memory-architecture-investigation.md` is updated to record this preliminary resolution. If Phase 4 surfaces a concrete need that the four-layer model can't meet, this entry gets reopened with the specific gap named.

### 7.9 Sandbox UX + transactional integrity

Phase 3 Stage 9 prep (2026-04-25) surfaced six observations about `skills/sandbox` + the `create_sandbox` MCP tool + the GitHub integration. The issues range from UX papercuts (skill doesn't auto-prompt on load) to architectural concerns (no transactional rollback across local + GitHub state, leaving users' repos with orphan issues when the tool fails mid-flight).

**Full findings:** `reports/sandbox-ux-findings-2026-04-25.md` — OBS-02 through OBS-08 with severity triage and candidate fixes.

**The load-bearing issues (high priority):**

- **OBS-06 / OBS-07** — `create_sandbox` has no transactional model. When it fails mid-flight (e.g., GitHub default-branch check fails, permissions issue, network flake), it leaves partial state: local `.ido4/` artifacts AND real GitHub issues on the user's repo. The next invocation sees the local partial state as "already initialized" and refuses to retry. The GitHub-side orphan issues are silently left on the user's repo. In production against a real user's real repository, this is a trust-breaking failure mode.

**The medium-priority issues:**

- **OBS-03** — the skill's documented Phase Detection logic and the MCP tool's actual detection are inconsistent. Users follow the skill's logic, are told they're in Phase 1 Setup, then the tool rejects them.
- **OBS-04** — the tool mutates `methodology-profile.json` during rejected operations.

**The papercut issues:**

- **OBS-02** — skill doesn't auto-prompt for inputs on load; user has to manually tell Claude what action to take.

**Current thinking:** this is a standalone "Sandbox UX + Transactional Integrity" initiative, not Phase 4 material. The fix spans `skills/sandbox/SKILL.md` (plugin) and `@ido4/mcp`'s `create_sandbox` handler + underlying domain services (engine). Scope: 2-5 days depending on how aggressively we pursue full rollback vs. pre-flight-plus-best-effort. Candidate sequencing: a Phase 3.5-style cross-repo beat before Phase 4 *if* Phase 4's PM agent benefits from a reliable sandbox for its own E2E testing. Otherwise, defer until next Phase 2 polish window.

**Why tracked here:** OBS-06/07 specifically are trust-breaking in production. Leaving them undocumented risks a real user experiencing this and losing confidence in the entire suite. Noted visibly so future sessions can triage with the severity in mind.

### 7.10 AI work-product content audit (Tier B metrics) — Phase 5

Phase 4 ships **Tier A** AI-work-product audit metrics — state-based metrics computable from existing MCP surface (closure-with-PR rate, closure-with-review rate, BRE-bypass count by actor, cycle time by actor type, AI-suitability adherence, cross-task coherence by AI actor). Tier A's ground floor is solid because the engine already exposes the typed `actor.type: 'human' | 'ai-agent' | 'system'` distinction (`packages/core/src/shared/logger.ts`) and the formal `aiSuitability` field (`'human-only' | 'ai-only' | 'ai-reviewed' | 'hybrid'`) on tasks (`packages/core/src/domains/tasks/task-service.ts:116`).

**Tier B** metrics audit AI work-product *content* rather than *state*. Three named candidates:

| Metric | What it measures | Engine work needed |
|---|---|---|
| **PR description quality** | Length, references to spec / acceptance criteria, depth of reasoning in PR body | Plumb `pull.body` text through `find_task_pr` (or new `get_pr_content`) — GH API already returns it; ~30–50 LOC + type extension. |
| **Comment-trail presence** | Did the AI add reasoning comments at meaningful points (refinement, blocker, closure)? | New tool `get_task_comments(issueNumber)` returning `[{author: ActorIdentity, body, timestamp}]`; map GH `user.type` + `author_association` to ActorIdentity; pagination. ~80–150 LOC. |
| **Spec-to-task traceability** | Does the closure reference the originating capability/section in the spec? | Investigation needed: does `domains/ingestion/` already persist `{specPath, capabilityRef, lineRef}` per task, or is lineage thrown away? If preserved: just expose via `get_task_lineage`. If not: add persistence + expose. ~1–5 days depending on current state. |

**Aggregate scope:** ~6–11 working days (engine + plugin) depending on lineage findings. Smaller than Phase 3 (which built whole substrate) and similar shape to Phase 4 (agent reasoning + small engine ask).

**Privacy consideration (load-bearing for the brief):** Tier B materially broadens what content reaches Claude's context — PR bodies and issue-comment bodies may contain sensitive information (customer data, security details, internal discussion). The boundary is partially established (review feedback bodies already flow through `get_pr_reviews`), but Phase 5 should explicitly section what content surfaces under what conditions, and whether the user wants redaction primitives (e.g., automatic redaction of `secrets`, `credentials` patterns). Not blocking — but worth being deliberate about.

**Re-open triggers (any one fires):**
1. **E2E smoke test (e2e-006) reveals Tier A is shallow** — agent's Phase 4 audits feel like surface-level transition checks, not actual quality assessment. This is the most likely first-fire.
2. **Real users arrive** with multi-stakeholder consumers of audit findings (overlaps with §7.6 trigger).
3. **A specific concrete reactive rule needs work-product content** to fire correctly (e.g., "AI agent has been closing tickets without referencing the originating spec for 2+ weeks").

**Scheduling shape — one Phase 5 push, not three drips.** The three metrics are conceptually coupled (all about content vs. state); a single coordinated cross-repo beat with a shared design pass produces a cleaner result than three separate engine PRs, and lets the privacy section be addressed once. When the trigger fires, open `phase-5-brief.md` and execute. Engine work + plugin work in a single coordinated initiative, mirroring `ido4specs` extraction's shape.

**Current thinking:** track here, defer; revisit immediately after Phase 4's smoke test (e2e-006) — that's the natural first quality gate that surfaces whether Tier A is enough or not.

---

## 8. Workstreams

Four problem areas, not task lists. Each captures a problem worth solving, what the solution needs to achieve, a starting-point analysis of how one might get there, and the principles that any candidate solution must respect. Where the starting-point analysis seems wrong or could be simpler, propose the better path.

**Coordination with the engine's roadmap (read before any engine-side work).** Workstreams that touch `@ido4/core` or `@ido4/mcp` codebases — any engine-side change, especially renames, restructures, or new abstractions — must coordinate with the engine's own evolution plan. **Before making any engine-side change, read `~/dev-projects/ido4/methodology-runner/` end-to-end.** The engine has its own multi-phase rename and refactor strategy (Phase 0 covers wave/epic → container/integrity mechanical renames; later phases address logic changes and tool-name updates). If a planned ido4dev workstream item conflicts with the engine roadmap, defer to the engine's plan and record the deferral as a decision in §6. This warning exists because §6 #16 was the first instance — the wave-detection.ts rename was originally scoped to WS4 Phase 1 but conflicts with the engine's Phase 2 plan; it has been removed.

### WS1: Plugin Diet — reduce surface, consolidate duplicates

> **Phase 2 execution brief:** `~/dev-projects/ido4dev/docs/phase-2-brief.md` — read before any code changes. Contains the open investigation blocking execution (how skills delegate to MCP Prompts), the safe deletion sequence, per-skill evals, and coordination points.

**The problem:** The plugin duplicates governance reasoning that already exists (more cleanly, more methodology-native) in the MCP Prompts ceremony layer. Twenty-one skills is more than current scope justifies; plan-*, retro-*, and sandbox-* show copy-paste scaffolding; some skills (spec-quality, spec-validate) are post-extraction migration debt that never got cleaned up.

**What the solution needs to achieve:**
- Remove duplication with the MCP Prompts layer
- Keep what's genuinely plugin-level (stateful workflows, first-touch)
- Preserve or consciously cede plugin-branded UX (per §7.1)
- Not lose capabilities users rely on

**Starting-point analysis** (current best answer; not the only path):
- Delete duplicate governance skills (standup, board, health, compliance, plan-wave/sprint/cycle, retro-wave/sprint/cycle)
- Delete soft-deprecated sandbox-hydro/scrum/shape-up
- Move spec-quality to ido4specs; delete spec-validate; rebrand/relocate pilot-test
- Add thin skill shells delegating to MCP Prompts (per §6 #14) — ~8 one-line skills covering the ceremony surface
- Fix the small bugs: stale references, TodoWrite frontmatter, PM agent name/directory mismatch
- Bundle `tech-spec-validator.js` into ido4dev for ingest-spec pre-validation
- Update `compatibility.mjs` + `validate-plugin.sh` to match the smaller surface

**Principles that shape the solution:** §3.3 (MCP Prompts for ceremonies; plugin for stateful workflows), §3.5 (single source of truth), §3.6 (profile-aware everywhere).

### WS2: Hooks Rebuild — make the autonomous nervous system deterministic

**The problem:** Current PostToolUse hooks are inverted — they LLM-prompt Claude to interpret structured BRE responses, which contradicts §3.1 (LLM for judgment, not enforcement). The hook surface is also underused: no PreToolUse gates for risky transitions, no Stop hook for session handoff, no skill-scoped hooks for incremental validation. The plugin has a governance role but advisory-only hooks.

**What the solution needs to achieve:**
- Deterministic processing of structured BRE/tool responses (no LLM in the hook itself)
- Rich enough hook surface to support autonomous PM activation (WS3's dependency)
- Graceful degradation when something fails (e.g., SessionStart npm install fails)

**Starting-point analysis:**
- Rewrite PostToolUse on `validate_transition` and `assign_task_to_*` as structured-data → templated insight handlers (no `"type": "prompt"`)
- Add PreToolUse hooks on risky transitions (validate_transition dryRun + `permissionDecision: "ask"`)
- Add Stop hook for end-of-session memory persistence
- Add SessionStart fallback if npm install fails (message rather than silent dead plugin)
- Add skill-scoped hooks (ingest-spec Stop verifying ingest succeeded, plan-* shells with PostToolUse validation)
- Document the hook strategy in CLAUDE.md so future changes stay coherent

**Principles that shape the solution:** §3.1 (BRE deterministic, LLM for judgment), §3.4 (hooks as autonomous nervous system).

### WS3: PM Agent Autonomy — from hand-invoked to silently monitoring

**The problem:** The PM agent has proactive behavior in spirit (`"Don't wait to be asked"` section) but no actual autonomous activation mechanism. Users currently invoke it manually; that's not how a real PM works. A real PM walks the floor, monitors signals, stays silent 90% of the time, intervenes at the 10% that matters. Also: the agent's identity is Hydro-hardcoded (5 principles, state machine, lifecycle) despite a universal description.

**What the solution needs to achieve:**
- Profile-aware agent identity (principles/state-machine/lifecycle from profile, not code)
- Deterministic deviation detection (pattern-based, threshold-based, memory-differential)
- Activation through the hook/cron/memory infrastructure — silent unless a pattern warrants intervention
- High-signal interventions (not noise) — restraint is a feature, not a gap

**Starting-point analysis** (the three-layer model; other patterns may be simpler or more effective):
- **Reactive (hooks)**: PostToolUse hook detects deviation patterns, invokes agent on match
- **Scheduled (cron)**: CronCreate fires periodic PM check-ins, surfaces only on change
- **Initiative (memory)**: SessionStart surfaces open governance items from memory
- Refactor agent identity to load from profile; drop Hydro hardcoding
- Define deviation thresholds as data (compliance drop pts, blocker %, recurring pattern signals)
- Define intervention templates so surfacing is consistent

**This workstream especially invites creative alternatives.** The three-layer model is one architecture for autonomous PM behavior; others exist (event-sourcing-based, async message patterns, GitHub Actions-style declarative rules). Worth investigating state-of-the-art in autonomous agents before committing.

**Principles that shape the solution:** §3.1, §3.4, §3.6. Depends on WS2 infrastructure.

### WS4: Engine Polish — close misnaming, drift, and documentation gaps

**The problem:** A handful of small inconsistencies in the engine layer: `wave-detection.ts` is misnamed (implementation is profile-driven), validation step count drifts across docs (32/34/35), contract #5 in `interface-contracts.md` has no canonical file, and the MCP Prompt authoring path is TS-only. Individually minor; collectively worth a pass.

**What the solution needs to achieve:**
- Names reflect implementation (no Hydro-era fossils)
- Single authoritative source for each fact (validation step count)
- All cross-repo contracts have canonical files
- (Optional) Lower contribution barrier for MCP Prompt authoring

**Starting-point analysis:**
- ~~Rename `aggregators/wave-detection.ts` → `aggregators/container-detection.ts`~~ — **deferred per §6 #16** to the ido4 engine's planned Phase 2. Do not preempt. Before any future engine-side work, read `~/dev-projects/ido4/methodology-runner/` end-to-end (see §8 intro warning).
- Reconcile validation step count (canonical number + propagate to CLAUDE.md, prompt-strategy.md, guided-demo, etc.) — these are plugin and suite-level docs; no engine coordination required.
- Write contract #5 with a canonical file referenced from `interface-contracts.md` — codify what counts as a breaking change to the criticalTools surface. Suite-level doc, no engine coordination required.
- *(Optional)* Markdown-template authoring path for MCP Prompts (per §7.3) — if ROI is clear; would touch engine, requires engine roadmap coordination.
- *(Optional)* Core-supported profile-aware agent identity — if §7.4 flips; would touch engine, requires engine roadmap coordination.

**Principles that shape the solution:** §3.5 (single source of truth), §3.2 (methodology as data, names included).

### Workstream dependencies

```
WS1 (Plugin Diet) ──── independent (can start anytime)
WS4 (Engine Polish) ─── independent (can start anytime)
WS2 (Hooks Rebuild) ─── needs nothing, but enables WS3
WS3 (PM Autonomy) ──── depends on WS2 (hooks infrastructure)
```

WS1 + WS4 in parallel, then WS2, then WS3 is one safe order. Other orderings work; this is a starting point. The user makes the final call (open decision 7.2).

---

## 9. Success Criteria

We're done when all of these are true:

1. **Methodology pluggability is real** — adding a new methodology requires writing a profile JSON + (currently) one TS prompt generator file + registering it. The rest of the system adapts automatically. A maintainer who has never seen ido4 can read this doc + a sample profile + the existing Hydro generator and ship a new methodology in under a day.

2. **Zero hardcoded methodology in skills/agents** — except sandbox/onboard branching where methodology-specific UX is genuinely needed for first-touch experience. Audit grep for "wave", "sprint", "cycle", "epic integrity", "DoR", "DoD", "circuit breaker", "appetite" in plugin skill prose returns only the methodology-display surfaces.

3. **PM agent activates autonomously on real deviations** — live-tested in a sandbox. PM stays silent through normal activity. PM surfaces on compliance drop, blocker threshold, recurring pattern. PM does NOT surface on routine state changes.

4. **All ceremony work flows through MCP Prompts** — standup/plan/board/health/compliance/retro/review/execute. Plugin skills (if shells) delegate. Adding a new ceremony for an existing methodology = edit the prompt generator. Adding a new ceremony entirely = extend the PromptGenerators interface.

5. **Plugin skill count reduced from 21 to ~8** — onboard, guided-demo, sandbox, sandbox-explore, ingest-spec, plus optional shells.

6. **All four release-architecture invariants pass** — `bash ~/dev-projects/ido4-suite/scripts/audit-suite.sh` shows clean.

7. **Live E2E smoke test successful** — fresh Claude Code session, install `ido4specs` from the marketplace and load `ido4dev` via `--plugin-dir` (ido4dev is deliberately decatalogued — see suite `design-decisions.md` DD-001), walk `/ido4specs:create-spec → ... → /ido4dev:ingest-spec` against a real strategic spec. (This is the still-open closure from the original ido4specs extraction.)

8. **All three methodology profiles produce equivalent UX quality** — Hydro user, Scrum user, Shape Up user each get a coherent experience. No methodology is degraded.

9. **Documentation is self-consistent** — validation step count reconciled. CLAUDE.md updated. interface-contracts.md complete (contract #5 documented).

10. **Hooks use deterministic detection, LLM only for judgment** — no `"type": "prompt"` PostToolUse hooks asking Claude to interpret structured tool responses.

---

## 10. Working Principles for This Collaboration

Carried forward from prior sessions and codified in user memory. These are how the work gets done.

- **Co-creation at every stage.** I propose, you review, you decide. I don't auto-resolve calls that have multiple defensible paths.
- **Implementation rigor.** Fully understand architecture before changing anything. Flag downstream impacts proactively.
- **Lead with clean recommended paths.** Aligned with existing patterns. Deep analysis lives in reports/docs, not chat. Chat is for alignment.
- **Read primary sources.** Don't synthesize summaries from agents when reading the code is feasible. The "took too long to discover" pattern from this conversation's MCP Prompts revelation must not repeat.
- **Make the call.** Reserve (a)/(b)/(c) for genuinely different paths, not flavors of a recommendation already made. Bring opinions with conviction, including disagreements with the user.
- **Care about being right, not looking right.** Structure that performs thinking is worse than honest "I don't know yet."
- **Length discipline.** Tight responses for routine work. Substantive when the task warrants it.
- **Task-AI granularity.** Size tasks for AI agent sessions, don't over-split.
- **Doc discipline.** This document, `phase-2-brief.md`, and any other in-progress design brief get updated at every phase gate, after every notable achievement, and the moment any decision lands. The status log (§11) is the source-of-truth heartbeat. Updates happen in the same turn the work happens — not deferred. A doc that lags behind the actual state silently misleads the next session that loads it.

---

## 11. Status Log

| Date | Update |
|---|---|
| 2026-04-17 | Document created. Initial scope: capture vision, architecture, debt classes, decisions made, open decisions, workstreams, success criteria. Awaiting workstream sequencing decision. |
| 2026-04-17 | Posture rework: added §0 "How to Use This Document" framing the doc as context-not-prescription; §5 retitled "Direction of Travel"; §7 softened "Lean" to "Current thinking"; §8 workstreams restructured as `Problem + Outcome + Starting-point analysis + Principles`. Invites creative alternatives; WS3 specifically flagged as open for out-of-the-box solutions. |
| 2026-04-17 | §7.1 resolved → §6 #14: shell approach confirmed. `/ido4dev:<ceremony>` thin-skill shells delegate to MCP Prompts. Unblocks WS1 bulk work. |
| 2026-04-17 | §7.2 resolved → §6 #15: four-phase sequence committed over ~6 weeks. Phase 1 (WS4 + WS1 micro-bugs in parallel) begins this week. |
| 2026-04-17 | Phase 1 micro-bugs landed: stale `/ido4dev:explore`/`/ido4dev:init` references fixed in `guided-demo` and `sandbox-explore`. |
| 2026-04-17 | Discovery during Phase 1 execution: ido4 engine has an existing multi-phase rename plan at `~/dev-projects/ido4/methodology-runner/phase-0-rename.md`. wave-detection.ts is explicitly deferred to engine Phase 2 ("logic change"). Recorded as §6 #16 (deferral). Removed from WS4 starting-point analysis. Added engine-coordination warning to §8 intro instructing future sessions to read `methodology-runner/` end-to-end before any engine-side work. |
| 2026-04-17 | **Phase 1 complete.** Validation step count canonicalized to **34** (counted .ts files in `validation-steps/` minus `index.ts`); propagated to `guided-demo` (was 32, two occurrences), `sandbox-explore` (was 32), and `prompt-strategy.md` (was 35). PM agent name field renamed `ido4-project-manager` → `project-manager` (matches directory; grep confirmed no other references). TodoWrite reference in `ingest-spec/SKILL.md:32` neutralized to "your task-tracking tool" (durable across tool-name changes). Contract #5 canonical file written at `~/dev-projects/ido4dev/docs/mcp-runtime-contract.md`; `interface-contracts.md` updated to point to it. |
| 2026-04-17 | **Reframed the Phase 2 gate.** Original plan said "run E2E smoke test before Phase 2 to establish baseline" — wrong. Phase 2 deletes 10 skills and rebuilds surface; baseline of disappearing skills isn't useful. The real gate for Phase 2 is a **design brief**, not a test run. Wrote `~/dev-projects/ido4dev/docs/phase-2-brief.md` covering: the #1 open investigation (how shells delegate to MCP Prompts — blocks execution), methodology-neutral shell naming, safe execution sequence, per-skill evals, coordination points. E2E smoke test is now Stage 5 (end-of-phase checkpoint), not a pre-gate. |
| 2026-04-17 | **Phase 2 brief §2 open investigation RESOLVED — and the resolution invalidates the brief's core design.** `claude-code-guide` subagent with web search confirmed: no skill-to-MCP-Prompt delegation mechanism exists at the Claude Code protocol level (no programmatic `getPrompt` from skills, no declarative delegation in frontmatter, no slash-command UX for MCP Prompts, no Anthropic reference implementation). Phase 2 brief §2 updated with the finding and three real options: A (MCP-only, lose branded UX), B (Build-Time Generator, codegen skill files from same PromptGenerators as MCP prompts, with CI drift check), C (skill-only, no MCP Prompts). Current lean: Option B. Broad industry survey was attempted in parallel but the spawned subagent's environment lacked WebSearch; to be re-run directly from this session before committing the option. Phase 2 execution remains on hold until the design is re-committed. |
| 2026-04-17 | **Phase 2 design pivoted — Runtime Prompt Rendering via Bash Injection is the committed pattern.** Extensive web research (direct `code.claude.com` + industry survey) surfaced two authoritative findings that reframed the problem: (1) plugin skills are ALREADY namespaced slash commands by default (`/ido4dev:standup` works natively — no "shell wrapper for branding" needed), (2) skills support runtime bash injection via `` !`command` `` syntax as a first-class feature. Committed design: each shell skill is a ~5-line markdown file containing one bash injection that calls `node ${CLAUDE_PLUGIN_DATA}/node_modules/@ido4/mcp/dist/render-prompt.js <ceremony-name>`. The script reads `.ido4/methodology-profile.json`, builds PromptContext, calls the right methodology generator, and prints the full profile-aware prompt text. Claude receives it and executes. Single source of truth (the generators), profile-aware at invocation, zero build-step sync, zero CI drift check needed. Industry survey confirms the pattern: AGENTS.md/AGENT_RULES.md ecosystem (zzgosh/agent-rules, Kaushik Gopal), MLflow Prompt Registry, Cursor/Cline namespace conventions. Anthropic's `codebase-visualizer` skill example uses the same bash-injection pattern. Phase 2 brief §2 updated with the design. Small engine change required: add `render-prompt.js` CLI entry point to `@ido4/mcp` (additive, not a rename — coordinates cleanly with the methodology-runner roadmap). Execution ready pending user confirmation. |
| 2026-04-17 | **Phase 2.1 proof landed — Runtime Prompt Rendering end-to-end verified.** Engine side (`@ido4/mcp`): added `src/render-prompt.ts` (pure function, 139 lines, exports `renderPrompt` + error classes), `src/render-prompt-cli.ts` (CLI wrapper with positional + flag arg parsing), `tests/render-prompt.test.ts` (61 tests: contract-with-generators for 8 ceremonies × 3 methodologies, suffix handling, cross-profile differentiation, error cases), `tests/render-prompt-cli.test.ts` (39 tests: arg parsing, empty-string handling, flag precedence). New bin entry `ido4-render-prompt`. Full suite: 558/558 passing across 25 files, zero regressions. Plugin side (`ido4dev`): created `skills/review/SKILL.md` and `skills/execute-task/SKILL.md` (7 non-blank lines each — thin shells), extended `tests/validate-plugin.sh` with a "Shell Skills Structure" section (134/134 passing, 0 warnings, `claude plugin validate` also passes), added `tests/shell-skills-render.mjs` integration test (12/12 passing — renders each shell against Hydro/Scrum/Shape Up fixture profiles, validates content markers, suffix propagation, empty-$ARGUMENTS handling). **Totals: 704 test assertions across 3 test suites, all green.** The only link not verifiable from this session is Claude Code's own bash-injection substitution of `${CLAUDE_PLUGIN_DATA}` and `$ARGUMENTS` at invocation time — live-session test steps handed to user. If user verifies steps 3–5 render correctly, cascade to Stage 3 (replace 10 ceremony duplicates with shells + delete originals). |
| 2026-04-17 | **Stage 3 cascade started: `health` replaced.** First ceremony duplicate replaced by its shell. `skills/health/SKILL.md` rewritten as a 7-line shell calling `ido4-render-prompt health "$ARGUMENTS"` (down from the original ~84-line ceremony skill). `tests/shell-skills-render.mjs` extended with a `health` entry — integration test now 17/17 passing across 3 shells × 3 methodologies. `validate-plugin.sh` 133/133 passing (1 warning: package.json file: dep, expected during local dev per the new tolerance check). Awaiting user live-verify of `/ido4dev:health` in their Claude Code session before continuing the cascade. |
| 2026-04-17 | **STAGE 3 BLOCKED — architectural premise invalidated by live test. Direction unresolved; fresh session needed.** During live verification of the `/ido4dev:health` shell, two discoveries reframed the entire Phase 2 design: **(1)** MCP Prompts ARE invokable as slash commands in Claude Code under the `/plugin:<plugin-name>:<server-name>:<prompt-name>` namespace (verified by user invoking `/mcp__plugin_ido4dev_ido4__health` directly — Claude received the rendered Hydro health prompt and responded with the correct GREEN/YELLOW/RED format). The earlier `claude-code-guide` subagent finding (used to motivate the shell-skill design) — that "Claude Code does not expose MCP Prompts as slash commands" — was **wrong**. **(2)** The bash-injection shell pattern works for NEW plugin skill names (live-verified for `/ido4dev:review` and `/ido4dev:execute-task`) but **does NOT work when replacing an existing skill name** (`/ido4dev:health` fired the Skill tool but Claude received "no body content"; `/reload-plugins` and full Claude Code restart did not fix it; the OLD skill description still shows in autocomplete despite the SKILL.md on disk having the new content). **Implications:** the entire shell-skill architecture was a workaround for a problem that doesn't exist (MCP Prompts handle the slash-command surface natively). The shells we shipped (review, execute-task, health) may be unnecessary infrastructure. The `render-prompt` CLI in `@ido4/mcp` may also be unnecessary as the load-bearing piece (it's still useful infrastructure but not the core mechanism). **The unresolved central question:** given MCP Prompts work natively as `/plugin:ido4dev:ido4:<ceremony>` slash commands but with verbose UX, and given shell skills can't cleanly replace existing skill names — what's the right architecture? Three candidate paths surfaced (proper release migration to deletion-then-shells, rename shells to non-colliding names, accept MCP-Prompt verbose UX) but none committed. **Direction needs a fresh session** with clean perspective. State left intentionally captured: phase-2.1-proof branches in three repos contain all current commits; package.json reverted to `^0.8.0` (no longer file: dep — release-ready); test directory at `~/dev-projects/ido4dev-live-test/` retained for any next session's tests. **Fresh-session start point:** read this status log entry first, then re-evaluate the central question from scratch without inheriting the analysis loops that produced this dead end. |
| 2026-04-17 | **Phase 2.1 LIVE-VERIFIED end-to-end in fresh Claude Code session.** Path A executed: committed all current work on `phase-2.1-proof` branches in three repos (`ido4`, `ido4dev`, `ido4-suite`); temporarily changed `ido4dev/package.json` dependency to `file:/Users/bogdanionutcoman/dev-projects/ido4/packages/mcp` for local install (uncommitted, easily revertible); created minimal test directory `~/dev-projects/ido4dev-live-test/` with `.ido4/methodology-profile.json: {"id":"hydro"}`. User ran `claude --plugin-dir ~/dev-projects/ido4dev` and exercised three invocations. **All three legs of the Runtime Prompt Rendering chain confirmed live:** (1) `/ido4dev:review` — Claude responded "I'll facilitate the **Wave Review**" (Hydro-specific terminology not in skill frontmatter; rendered from MCP prompt generator) and called `get_project_status` (the first instruction in the rendered Hydro review prompt); (2) `/ido4dev:review Wave-001` — Claude responded "Starting **Wave-001** review" (container suffix propagated correctly through `--container` flag → `Wave to review: Wave-001`); (3) `/ido4dev:execute-task 42` — Claude responded "task **#42**" and called `get_task_execution_data(issueNumber: 42)` (issue-number suffix propagated correctly + correct ceremony dispatch). **The Runtime Prompt Rendering pattern is proven in production-equivalent conditions.** Stage 3 cascade (replace 10 ceremony duplicates with shells) ready to execute on the same `phase-2.1-proof` branch. |
| 2026-04-17 | **Phase 2.1 architecture reversed; Option A committed (§6 #17). Ceremony duplicates deleted in three paired commits.** After the failed live-verify of the `/ido4dev:health` shell replacement (name-collision mode — Claude Code received "no body content" when a new shell tried to occupy an existing skill name; `/reload-plugins` and full Claude Code restart did not resolve), the central design question was reopened in a fresh session. Two facts were confirmed before any further code moved: (1) slash-command docs + user's own live invocation of `/mcp__plugin_ido4dev_ido4__health` established that Claude Code exposes MCP Prompts as `/mcp__<server>__<prompt>` slash commands — the original `claude-code-guide` subagent finding that motivated the shell design was wrong; (2) the shell pattern's name-collision failure made it unviable as a replacement architecture even if the UX aesthetic were worth the infrastructure. Option A (MCP Prompts as the canonical ceremony slash-command surface; no plugin shells) was committed on the basis that the shells solved a problem that does not exist, and the verbose `/mcp__plugin_ido4dev_ido4__<prompt>` syntax is an aesthetic cost deferred per §6 #2 (no live users). Three commits landed on `phase-2.1-proof`: **(A)** `@ido4/mcp` — clean `git revert` of 660c618 (render-prompt CLI), restoring the engine to 458 passing tests and no extra CLI surface. **(B)** `ido4dev` — delete 3 shell skills (`review`, `execute-task`, `health`-as-shell) + `tests/shell-skills-render.mjs` + `validate-plugin.sh` §K (Shell Skills Structure) + `docs/mcp-runtime-contract.md` CLI-surfaces section. **(C)** `ido4dev` — delete 9 ceremony duplicates (`standup`, `board`, `compliance`, `plan-wave`/`sprint`/`cycle`, `retro-wave`/`sprint`/`cycle`) + 6 legacy `commands/*.md` wrappers; reference sweep across PM agent (9 refs), onboard, guided-demo, ingest-spec, sandbox, pilot-test, hooks.json, README, CLAUDE.md — every `/ido4dev:<ceremony>` or `/<ceremony>` reference updated to `/mcp__plugin_ido4dev_ido4__<ceremony>`. Each commit left the plugin in a working state per `validate-plugin.sh`. Remaining in Phase 2: **Stage 4** (migration debt cleanup: `sandbox-hydro|scrum|shape-up` hard-remove, `spec-quality` → `ido4specs`, `spec-validate` delete, `pilot-test` rebrand, `tech-spec-validator` bundle for `ingest-spec` pre-validation) — not started. `phase-2-brief.md` rewritten against Option A in the same commit as this log entry. §6 #14 marked superseded; §5.1 retained-skills list trimmed from 8 shells + 5 workflows to 5 workflows only, with the ceremony surface now documented under the MCP layer. |
| 2026-04-18 | **Slash-command form correction.** User's live test surfaced that the `claude-code-guide` subagent's recommended form (`/mcp__ido4__<name>`) was short by one namespace segment — plugin-bundled MCP servers in Claude Code are prefixed as `mcp__plugin_<plugin-name>_<server-name>__`, so the canonical form for this plugin is `/mcp__plugin_ido4dev_ido4__<name>`. Autocomplete additionally displays a prettier colon-form (`/plugin:ido4dev:ido4:<name>`) that is also typeable and resolves to the underscore form on execution. Sweep commit `d763dcd` corrected 45 occurrences across 11 files (README, CLAUDE.md, PM agent, 5 skills, hooks.json, architecture-evolution-plan, phase-2-brief). Also caught a pre-existing bug: PM agent's `tools: mcp__ido4__*` frontmatter matched no tools; corrected to `mcp__plugin_ido4dev_ido4__*` to match the prefix every plugin skill and hook matcher already uses. Post-correction, user live-verified that `/standup` + autocomplete correctly fires `get_standup_data()` on the seeded sandbox; architecture is proven in production-equivalent conditions. Both `ido4/phase-2.1-proof` and `ido4dev/phase-2.1-proof` merged to `main` and branches deleted. |
| 2026-04-19 | **Phase 2 Stage 4 items 1-3 landed on `main`.** Three single-concern commits: (1) `26df87b` — hard-remove `sandbox-hydro`/`sandbox-scrum`/`sandbox-shape-up` (soft-deprecated post-ido4specs-extraction, replaced by `guided-demo`'s methodology branching; each was a 12-line redirector fossil); (2) `adeeb7b` — delete `spec-validate` (duplicates bundled `tech-spec-validator.js` per §3.5 single-source-of-truth; capability is preserved because Stage 4 item 5 bundles the validator into ido4dev for `ingest-spec` fail-fast pre-validation, and `ido4specs:validate-spec` already runs it during authoring); (3) `85ebf5a` — rebrand `pilot-test` as dev-only (`disable-model-invocation: true` + description prefixed `[dev-only]`; `user-invocable: true` retained so devs can still run `/ido4dev:pilot-test` explicitly; legacy `commands/pilot-test.md` wrapper deleted). Plugin skill count 11 → 7. `validate-plugin.sh` 55/55 passing. Remaining Stage 4: items 4 (spec-quality → ido4specs, cross-repo commit pair), 5 (tech-spec-validator bundle + ingest-spec pre-validation wiring), 6 (end-of-phase E2E smoke test in a fresh Claude Code session). |
| 2026-04-20 | **Phase 2 formally complete.** Items 4/5.a/5.b landed earlier in the day (ido4specs v0.4.0 released with migrated `spec-quality` skill; bundle + update script + release-gate + CI auto-update workflow + cross-repo dispatch from `ido4`'s `publish.yml` + `IDO4DEV_DISPATCH_TOKEN` + `PAT` secrets wired; interface contract #6 extended to cover ido4dev as a consumer; suite `design-decisions.md` created with DD-001 capturing the ido4dev decataloguing rationale). Also: reordered `ingest-spec` Stage 0b to precede the project-init check (commit `c4270a3`) so users learn structural-validation status and project-init status in one round trip rather than two. Phase 2 closing smoke test (item 6 — focused rather than full-vision per a testing-strategy discussion this session; full-vision E2E deferred to post-Phase-4 as `e2e-005`) exercised `ingest-spec` against `ido4shape-cloud`'s real 71KB technical spec (27 capabilities, 36 tasks, 65 dependency edges, max depth 9, 145 success conditions). Surfaced three UX gaps on the first run: (a) skill required a "proceed" nudge after invocation, (b) task-tracker template was missing Stage 0b, (c) `${CLAUDE_PLUGIN_DATA}` expanded to empty in Claude's Bash-tool context while being set correctly for SessionStart hook subprocesses. All three fixed in commit `56b12ac` and re-verified same-session — Run 2 passed cleanly with no new observations. Full report: `reports/e2e-004-phase-2-smoke.md`. One open investigation added to §7 (CronCreate) remains deferred to Phase 4; the `CLAUDE_PLUGIN_DATA` scoping question is a low-priority follow-up the skill now handles robustly via a documented fallback. **Next:** open `phase-3-brief.md` for WS2 (Hooks Rebuild) — turn §8 WS2's architectural scoping into a concrete execution spec. |
| 2026-04-20 | **`phase-3-brief.md` drafted + revised.** Initial draft from a 4-stream research pass (internal survey + Claude Code hook API + state-of-the-art agent frameworks + structured-data rule engines) adopted YAML + JSON Logic + Mustache + DMN hit policies + event-log backbone. User pushback on research-driven-inertia vs. fit-for-purpose produced two revisions: (1) JSON Logic → inline JS expressions (Node-only runtime; portability argument didn't apply; expressions more readable); (2) full event-log backbone → minimal `state.json` + in-session buffer with a documented upgrade trigger (§4.2). Suite-level `hook-and-rule-strategy.md` written as the standing reference for this class of design; this brief is its first concrete application. Commit `75b71ff`. |
| 2026-04-21 | **Phase 3 Stage 1 shipped (commit `263f1d0`).** SessionStart hardened — third hook reads `state.json` and emits a resume banner; the two existing hooks (`@ido4/mcp` install, tech-spec-validator bundle copy) wrapped in graceful-degradation (exit 0 on failure, stderr warning). New SessionEnd hook persists `{version, ended_at, last_compliance, last_rule_fires, open_findings}` to `${CLAUDE_PLUGIN_DATA}/hooks/state.json` via atomic tmp+rename. All hook code extracted from inline `hooks.json` to `hooks/scripts/` for individual testability. `validate-plugin.sh` §L exercises every hook script (existence + shebang + syntax check). No user-visible behavior change — substrate for Stages 2+. |
| 2026-04-21 | **Phase 3 Stage 2 shipped (commit `0ee9662`).** Rule-runner library landed as pure Node, zero runtime npm deps: `hooks/lib/rule-runner.js` (384 LOC — evaluate() is pure/testable, runFromStdin() is the CLI entry) + `hooks/lib/state.js` (shared read/write/coerce/update implementation used by runner and hook scripts). Vendored as single-file UMD bundles: `hooks/lib/vendored/yaml.js` (js-yaml 4.1.1) + `mustache.js` (mustache 4.2.0), each with version/checksum markers mirroring the tech-spec-validator pattern. Refresh scripts: `scripts/update-{yaml,mustache}-vendor.sh`. `release.sh check_bundle` extended to cover three bundles. 52 unit tests (expression edge cases, hit policies, profile filtering, Mustache with missing vars, state atomicity, debounce, schema validation, YAML load). One un-briefed design call: YAML parser vendored despite brief §4.1 being silent on it — rationale was suite-consistency (tech-spec-validator precedent) and correctness-over-LOC (a hand-rolled YAML subset parser would trap authors with silent mis-parses). Nothing consumes the runner yet; Stage 3 is the first consumer. |
| 2026-04-21 | **Phase 3 Stage 3 research correction + shipped (commit `f363419`).** Pre-implementation investigation found brief §4.1's example rule `VT002_cascade_unblock` referenced `ValidationResult.metadata.unblockedCount` — a field that does not exist. The engine intentionally keeps BRE validation-only; cascade/impact signals live on adjacent tools (`complete_and_handoff.newlyUnblocked[]`, `get_task_execution_data.executionIntelligence`, `get_next_task.scoreBreakdown.cascadeValue`). Similarly, milestone signals live on `validate_wave_completion`, not `validate_transition`. **Option D adopted:** rules distributed to the matchers that actually produce the signals — Stage 3 ships 2–3 rules on real `ValidationResult` fields (VT001 BRE block, VT002 passed-with-warnings, VT003 approved-with-suggestions); cascade/milestone rules move to Stage 4 on the correct matchers. Side-finding: the old `"type":"prompt"` hook's dry-run check was dead code (Zod strips the unknown `dryRun` field; `ValidationResult` doesn't echo it). Stage 3.5 named but deferred — the `mcp-runtime-contract.md:76` drift (cascade info invariant) can be closed with a ~5-LOC enrichment in `@ido4/mcp`'s handler if a concrete Stage 4 rule surfaces the need; no rule did. Stage 3 delivered: 3 rules + 20 fixture cases + `tests/rule-file-integration.test.mjs` (test-file walker) + `hooks.json` flip from `type:prompt` to `type:command`. 102 passed / 0 failed across validation suites. Live verification deferred to the user (brief §5 Stage 3 last step). `phase-3-brief.md` §4.1 / §5 Stages 3 & 4 / §10 updated; §5 Stage 3.5 documented. |
| 2026-04-21 | **Institutional-memory reframing (Stage 4 altitude check).** Before Stage 4 implementation, user pushback on whether the design work was at the right altitude produced a reframing that earned a new design principle: §3.9. Thesis: hooks/rules/state aren't UX polish — they're the operating substrate for hybrid human+AI engineering at scale. Neither humans-with-old-tools nor pure-AI-coding works at enterprise scale; ido4 bridges them by operationalizing institutional memory and imposing it at the moment it's relevant. **Operational consequence:** rules pass the "earn their slot" test by asking whether they operationalize institutional memory, not whether they improve UX. Re-audit of the planned Stage 4 rules against this bar cut 2 of 7 (CS003 recommendations-present, CH003 no-next-task-available — both noise) and rescued CH002 strong-next-task-recommendation after an initial cut (surfacing *why* a recommendation is right IS memory operationalized). §3.9 captures the framing for future sessions. |
| 2026-04-21 | **Phase 3 Stage 4 shipped (commit `68f0f6a`).** Five rules across three files distributed to the matchers that produce their signals (per the Stage 3 correction): **compliance-score.rules.yaml** (CS001 grade-drop with `escalate_to: project-manager`; CS002 category-threshold-crossed — both stateful diffs against `state.last_compliance`). **complete-and-handoff.rules.yaml** (CH001 cascade unblock with per-task reasoning; CH002 strong-next-task recommendation surfacing the scoreBreakdown reasoning). **assign-task.rules.yaml** (AT001 integrity violation on `tool_response.integrity.maintained===false`; first use of regex matcher `^mcp__plugin_ido4dev_ido4__assign_task_to_(wave\|sprint\|cycle)$` for a tool family). Runner extensions: `post_evaluation.persist` block (top-of-file, JS-expr-valued — always runs after rule evaluation; overwrite semantics for persist keys, merge semantics for `last_rule_fires`), `now_iso` / `now_ms` context helpers, `evalExpr` exported. Sibling fix surfaced during end-to-end testing: default Mustache double-brace HTML-escapes (`"Wave 2"` → `&quot;Wave 2&quot;`); all prose fields across all rule files now use triple-brace; a regression-guard unit test tripwires any silent revert. Tests: 69 unit + 48 integration. 105 passed / 0 failed / 1 warn. §3.1 violation closed across all Phase-3-scoped matchers (`validate_transition`, `assign_task_to_*`, `compute_compliance_score`, `complete_and_handoff`). Stages 5–9 remain per brief §5. |
| 2026-04-21 | **Phase 3 Stage 5 shipped (commit `62d06fa` ido4dev + `cad3358` ido4-suite).** Three PreToolUse gates distributed across two rule files: G1 universal `skipValidation=true` (regex over 9 transition tools — BRE-bypass flag was unaudited), G3 `approve_task` when compliance grade is D or F (stateful via `state.last_compliance`), G5 re-assignment (stateful via `state.last_assignments` persisted by Stage 4's assign-task.rules.yaml). Runner extended with optional `permission_decision` rule field + `event:` file-level declaration + PreToolUse response shape (permissionDecision + permissionDecisionReason + additionalContext); most-restrictive-wins across multi-rule files (deny > ask > allow). Pre-implementation research flagged Stage 5's brief-scoped rules depended on event-log infrastructure we deliberately didn't ship — scope corrected to Option B (substrate-achievable gates only); event-log promotion tracked in new §7.7 with five concrete pending triggers. Side-finding fixed during end-to-end CLI testing: `state.js coerce()` was dropping unknown top-level fields, silently erasing `post_evaluation.persist`-written state across sessions (production bug affecting Stage 4's last_compliance categories + Stage 5's last_assignments); now preserves unknown fields while type-checking critical ones, with regression-guard unit test. 80 unit + 70 integration + 108 validate-plugin.sh passing. |
| 2026-04-22 | **Phase 3 Stage 6 SKIPPED.** Research found PostCompact hook is not implemented in current Claude Code (feature request anthropics/claude-code#32026 closed as duplicate; hooks reference lists 13 events, none PostCompact). Building on a non-existent primitive would repeat the Stage 3 mistake at a larger scale. Three compounding reasons to skip entirely rather than pivot: (a) memory-system auto-reload (`CLAUDE.md` + `MEMORY.md`) already handles post-compaction state for memory-file-resident content; (b) auto-compaction is rare on Opus 4.7 + 1M context (~150K threshold, typical long sessions don't hit it); (c) Stage 6 is not on the critical path for Stages 7–9. Broader question — "should ido4 deliberately participate in Claude Code's memory architecture" — is cross-cutting across the ecosystem (affects Phase 4 PM agent substrate, potentially ido4specs/ido4shape too) and tracked as a new standing open decision at §7.8 with kickoff brief `~/dev-projects/ido4-suite/briefs/memory-architecture-investigation.md` for a future dedicated session. Any resulting design is a separate initiative outside Phase 3. `phase-3-brief.md` §4.3 (hook taxonomy), §5 Stage 6, §9 end-of-phase checklist, §10 status log updated. |
| 2026-04-24 | **Phase 3 Stage 7 research correction + shipped.** Three parallel research streams (Claude Code hook mechanics + internal state + SOTA for rule→LLM escalation): the brief's `escalate_mode: direct` mechanism is not buildable — no runtime hook-to-agent delegation primitive exists; `type: "agent"` hooks are purely declarative + experimental; SOTA converges on advisory escalation for governance-class signals (forced routing is reserved for hard-deny / non-discretionary authority, which none of our rules need). The `escalate_mode` field was dead code since Stage 2 (runner silently filtered out `direct`-mode findings). Stage 7 executed as cleanup: field removed from schema with a clear validation error pointing maintainers to this entry; `result.escalate[]` simplified to `{rule_id, agent}`; recommendation wording strengthened to the SOTA advisory pattern (`**Governance signal — recommend invoking \`/agents <name>\`**`). Four consecutive stages (3, 5, 6, 7) have had research-first pre-implementation corrections — the brief was optimistic about Claude Code primitives; research-first discipline caught all four. 80 unit + 70 integration tests passing; 108 validate-plugin.sh. `phase-3-brief.md` §4.4, §5 Stage 7, §9, §10 updated. |
| 2026-04-24 | **Phase 3 Stage 8 shipped — documentation.** New `docs/hook-architecture.md` — canonical plugin-side reference mirroring `mcp-runtime-contract.md`'s style. Covers: directory layout; rule-runner API surface and CLI invocation; rule file format (schema, evaluation context, expression semantics, hit policies, debounce); PostToolUse + PreToolUse response shapes; state layer schema + Stage 5 type-coercion fix; `post_evaluation.persist` mechanics + rationale; advisory escalation (post-Stage-7 shape); testing model (unit + integration + sibling fixtures); extension procedure for adding a rule file; validation surface `validate-plugin.sh` covers; failure modes; current rule inventory (6 rule files, 14 rules); tracked deferred items (event log, memory architecture, forced-delegation primitive, Stage 3.5). Corresponding `## Hook Architecture` section added to `CLAUDE.md` — summary with cross-references, what-lives-where map, design-principle anchors (§3.1 + §3.9), extension-procedure pointer. Most of the `validate-plugin.sh` coverage the brief scoped for Stage 8 was already in place (rule-file schema validation, sibling-test presence, no-prompt grep, etc.) — no new sections needed. Only Stage 9 remains. |
| 2026-04-25 | **Sandbox UX + transactional integrity findings recorded (§7.9, new).** Phase 3 Stage 9 prep surfaced six observations (OBS-02 through OBS-08) about `skills/sandbox` + `create_sandbox` MCP tool + GitHub integration. Discovered while attempting to seed synthetic state for the smoke test's scenarios 2-3: the sandbox creation failed twice, leaving 23 real GitHub issues on a throwaway repo and substantial local `.ido4/` artifacts despite reporting failure. The load-bearing issues are OBS-06/07 — no transactional rollback across local + GitHub state. In production against a real user's real repo, this would leave orphan issues silently. Full findings at `reports/sandbox-ux-findings-2026-04-25.md`; tracked in new §7.9. Proposed follow-up initiative: 2-5 day cross-repo beat fixing skill/tool alignment (OBS-02/03/04) + pre-flight + best-effort rollback for external mutations (OBS-06/07). Not blocking Phase 3 close. |
| 2026-04-25 | **Phase 3 Stage 9 closing smoke test — CRITICAL BUG found + fixed + verified live; Phase 3 ships.** Smoke test ran against a fresh Claude Code session with sandboxed Hydro project state. Scenarios 2-3 first attempts revealed all PostToolUse rules silently failing in production: `tool_response` for MCP tools is the bare MCP `CallToolResult.content` array `[{type: "text", text: "<JSON>"}]`, NOT a parsed `{success, data}` object as our integration tests assumed. Every Phase 3 rule's `tool_response.X` access threw undefined-property errors; no rules fired; no `additionalContext` reached Claude. Diagnosis from transcript stderr in `~/.claude/projects/<session>.jsonl` — load-bearing diagnostic surface for future smoke tests. **Fix:** added `unwrapMcpToolResponse()` to `hooks/lib/rule-runner.js` (handles both bare-array and `{content: [...]}` shapes); updated 4 PostToolUse rule files to use `tool_response.data.X` paths; wrapped 4 test fixtures with `{success: true, data: {...}}`; added 8 unit tests covering unwrap. **Live verification post-fix:** VT001 fired correctly on a real BRE-blocked validate_transition with full templated body (3 errors + 1 warning); CS002 fired on a category-threshold-crossing (live processAdherence at 60 vs seeded baseline at 92); `post_evaluation.persist` wrote live engine-produced data through to state.json including the engine's actual summary text; G1 PreToolUse gate surfaced the confirmation prompt with the rule's body text verbatim. All 4 scenarios passed. Tests: 88/88 unit + 70/70 integration + 108 validate-plugin. Full report: `reports/e2e-005-phase-3-smoke.md`; bug-recovery doc: `reports/phase3-mcp-tool-response-bug-2026-04-25.md`; `docs/hook-architecture.md` updated with MCP-unwrap section. **Phase 3 closes.** Open initiatives (memory architecture §7.8, sandbox UX §7.9, event log §7.7) carry forward as separate beats. Phase 4 (PM agent autonomy) ready to brief. |
| 2026-04-25 | **§7.8 memory architecture — preliminary-resolved.** Post-Phase-3-close synthesis (informed by Stage 9 verification that SessionStart `additionalContext` reliably reaches Claude's context): the four existing persistence layers — `state.json`, GitHub issues, `.ido4/project-info.json` + BRE state, SessionStart `additionalContext` — already cover ido4's use cases. Adding MEMORY.md authorship would duplicate persistence, introduce a fifth layer with unclear canonicality, and pollute the user's MEMORY.md namespace with plugin-managed content. None of the gaps a "no MEMORY.md" choice creates (post-compaction context, user-reviewability, Anthropic-blessed-pattern alignment) are load-bearing for ido4's use cases. §7.8 entry rewritten with the four-layer analysis. Investigation downgraded from "separate session required" to "satisfied by analysis." Kickoff brief at `~/dev-projects/ido4-suite/briefs/memory-architecture-investigation.md` updated to mark preliminary resolution. **Phase 4 sequencing simplified:** memory investigation no longer a Phase 4 prerequisite. Phase 4 brief can begin directly. PM agent's context-richness needs are met by enriching the SessionStart banner + having the PM agent read `state.json` directly when invoked. Reopen §7.8 only if Phase 4 surfaces a concrete gap the four-layer model can't meet. |
| 2026-04-25 | **Phase 4 brief drafted (`docs/phase-4-brief.md`) + supporting plan updates.** Three pre-drafting research streams produced load-bearing reframings: (1) **Routines vs `CronCreate` primitive distinction** — research over Anthropic primary docs (code.claude.com/docs/en/routines + scheduled-tasks) clarified that Routines is the cloud-scheduled durable substrate (account-scoped, ~1h minimum, runs blind to `state.json`/skills/`${CLAUDE_PLUGIN_DATA}`) and `CronCreate`-the-tool is in-session 7-day-expiry. §7.6 rewritten with the distinction + Routines-deferred decision (user, 2026-04-25) + concrete re-open triggers. (2) **Mission reframing** — under §3.9, PM agent's foreground job is auditing AI work product on behalf of the human overseer (audit subject = AI; consumer = human), not "AI PM doing morning rounds." User clarification 2026-04-25: dominant ido4 case is AI doing the work, humans direct/adapt/oversee. Routines deferred because multi-stakeholder distribution is the only proactive use case that earns its slot under §3.9, and that audience (per §1) hasn't arrived. (3) **Data-surface investigation** (Explore agent, very thorough) — confirmed `actor.type: 'human' \| 'ai-agent' \| 'system'` is structurally typed at engine (`packages/core/src/shared/logger.ts`); `aiSuitability` field is fully wired with values `'human-only' \| 'ai-only' \| 'ai-reviewed' \| 'hybrid'`, populated from tech-spec-format at ingestion, BRE-validated; `state.json open_findings[]` schema permits findings but has never been written to in Phase 3 (sat empty since Stage 1; `coerce()` preserves unknown fields). Data gaps for Tier B (PR body text, issue comments, spec lineage, BRE-bypass aggregated counts) are conceptually coupled — single Phase 5 push handles them. **§7.10 added** covering Tier B metrics deferred to Phase 5 with three concrete triggers (most likely first-fire: Phase 4 smoke test surfacing Tier A shallowness), per-metric scope estimates (~6–11 days engine + plugin), privacy consideration. **Phase 4 scope (committed):** profile-aware PM agent rebuild (drops Hydro 5-Principles hardcoding per §7.5 plugin-only path) + audit-focused hook rules extending Phase 3 substrate + Tier A audit metrics (7 metrics computable from existing MCP surface) + one small engine cross-repo beat (`actorType` filter on `query_audit_trail`, ~5 LOC) + SessionStart banner enrichment + `state.json open_findings[]` as canonical audit-finding store under single-writer discipline (only PM agent writes; rules emit advisory escalation as today). 5 stages, no new architectural primitives, builds entirely on Phase 3 substrate. Awaiting user commit. |

This log will be updated as decisions land and workstreams complete.

---

## Related Reading

- `~/dev-projects/ido4-suite/docs/ecosystem-overview.md` — full system map
- `~/dev-projects/ido4-suite/docs/prompt-strategy.md` — authoring patterns for skills/agents/prompts
- `~/dev-projects/ido4-suite/docs/interface-contracts.md` — cross-repo contract index (contract #5 needs work)
- `~/dev-projects/ido4-suite/docs/cross-repo-connections.md` — dispatch map and shared credentials
- `~/dev-projects/ido4-suite/docs/release-architecture.md` — four-layer release pattern with invariants
- `~/dev-projects/ido4-suite/PLAN.md` — master plan tracking cross-repo work
- `~/dev-projects/ido4specs/docs/extraction-plan.md` — the pattern this document mirrors
- `~/dev-projects/ido4dev/CLAUDE.md` — plugin-level instructions
