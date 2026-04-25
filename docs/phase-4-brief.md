# Phase 4 Design Brief: WS3 PM Agent Autonomy

**Status:** Draft — 2026-04-25. Awaiting user review before commit.
**Parent plan:** `~/dev-projects/ido4dev/docs/architecture-evolution-plan.md` §8 WS3.
**Predecessors:** `phase-3-brief.md` (closed 2026-04-25 via `reports/e2e-005-phase-3-smoke.md`).
**Successor:** `phase-5-brief.md` (Tier B AI work-product content audit — see §7.10; conditional on triggers).

This brief turns §8 WS3's architectural scoping into a concrete execution spec, against the substrate Phase 3 just shipped. Where Phase 3 was substrate-from-scratch with four research-correction stages, Phase 4 is substrate-extension with a sharp, mission-aligned rebuild of the PM agent's identity. The novelty is in the *framing* (AI-work-product auditor on behalf of the human), not in new architectural primitives.

Phase 4 ships a plugin that:

- **Has a profile-aware PM agent** — Hydro hardcoding gone; principles, state-machine semantics, and lifecycle nomenclature load from `.ido4/methodology-profile.json` at invocation.
- **Audits AI work product** — agent's foreground job under §1's mission framing (AI does the work; humans direct/oversee). Tier A audit metrics are state-based, computable from existing MCP surface + one small engine ask.
- **Persists audit findings** — `state.json open_findings[]` becomes the canonical store under single-writer discipline; SessionStart banner surfaces unresolved findings.
- **Stays local-substrate-only** — no Routines (deferred per §7.6), no event log promotion (deferred per §7.7), no Tier B content metrics (deferred per §7.10). Phase 4 is what's buildable today on Phase 3's substrate plus a 5-LOC engine PR.

---

## 1. Goal (end-of-phase state)

- `agents/project-manager/AGENT.md` is methodology-neutral; profile-aware content (principles, state machine, lifecycle, container terminology) loads from `.ido4/methodology-profile.json` at session start. Hydro/Scrum/Shape Up users get equivalent UX.
- The agent's foreground job is auditing AI work product on behalf of the human overseer. Synthesis-on-demand (Phase 3's advisory-escalation invocation pattern) remains as a sub-mode within the audit framing.
- New rule file `hooks/rules/ai-work-audit.rules.yaml` extends Phase 3's substrate with audit-class signals — closure-without-PR, closure-without-review, BRE-bypass-by-AI-actor, cross-task-coherence-by-AI-actor patterns. All emit advisory escalation when worth surfacing.
- One small engine cross-repo beat: `actorType?: 'human' | 'ai-agent' | 'system'` parameter on `query_audit_trail` (~5 LOC; non-breaking, additive). Tier A metrics need it.
- Tier A audit metrics implemented in the agent's reasoning patterns and tool composition (seven metrics; §4.3).
- `state.json open_findings[]` is the canonical audit-finding store. Single-writer discipline (only the PM agent writes). Bounded cap (20 findings, FIFO). Schema documented in `docs/hook-architecture.md`.
- SessionStart banner surfaces unresolved findings (top-3), compliance grade trajectory (last 3 sessions), and an AI-work summary since last session (transitions count, actor breakdown, bypass count). Same `additionalContext` mechanism as Phase 3.
- `validate-plugin.sh` has new sections covering audit-rule schema, findings-schema validity, banner content presence, and bounded-cap enforcement.
- Phase 4 closing smoke test (`reports/e2e-006-phase-4-smoke.md`) verifies all four scenarios live; the test's quality signal evaluates whether Tier B (§7.10) trigger fires.

---

## 2. Why this design — research provenance

The architectural choices in this brief are grounded in three pre-drafting research streams (2026-04-25) and stand on the substrate Phase 3 verified live (commits `c0a22d2`, `0e17edf`, `ebabb20`).

### Mission reframing — what the agent is FOR

§1's vision: AI agents do work in human-governed environments. §3.9's institutional-memory thesis: hooks/rules/state operationalize memory at the moment it's relevant. Apply both to "what's the PM agent for":

The agent is **not** an AI PM doing morning rounds (anthropomorphic; doesn't earn its slot under §3.9). The agent is the human's **on-demand AI-work-product auditor** — the synthesis layer that catches what the human can't keep in head while AI agents work fast. Audit subject = AI; audit consumer = human; institutional-memory thesis honored because the agent surfaces compliance trajectory the human doesn't otherwise have.

User confirmation 2026-04-25: dominant ido4 deployment case is (a) AI coding agents acting on behalf of humans; humans direct/adapt/oversee. Some GH issues are human-only (the `aiSuitability: 'human-only'` field already encodes this). The audit's natural scope is AI-driven work, not human-driven work.

### Substrate analysis — what Phase 3 left for Phase 4

Phase 3 closed clean (2026-04-25) with: rule-runner library, `state.json` substrate with `coerce()` preserving unknown fields, advisory escalation as the SOTA forced-vs-advisory call (Stage 7), MCP `tool_response` unwrapping (Stage 9 fix). Six rule files producing 14 rules in production. PostToolUse + PreToolUse + SessionStart + SessionEnd all wired.

§7.5 (PM agent profile-aware identity) leans plugin-only — agent reads `.ido4/methodology-profile.json` directly via Read tool (already in its frontmatter `tools:` list). No engine change required.

§7.6 rewritten 2026-04-25 to distinguish Routines (cloud, account-scoped, durable) from `CronCreate`-the-tool (in-session, 7-day expiry). Routines deferred per user decision — Phase 4 is local-substrate-only. Re-open triggers documented.

§7.7 (event log promotion) stays deferred — none of Phase 4's audit rules require cross-session event history. The first concrete cross-session pattern rule would trigger upgrade work; Phase 4 doesn't surface one.

§7.8 (memory architecture) preliminary-resolved 2026-04-25 — the four-layer model (state.json, GitHub issues, project-info+BRE state, SessionStart `additionalContext`) covers ido4's use cases. Phase 4 enriches the SessionStart layer; doesn't author MEMORY.md content.

§7.10 added 2026-04-25 — Tier B AI work-product content audit (PR body, comment trails, spec lineage) deferred to Phase 5 with three concrete triggers, the most likely first-fire being Phase 4's smoke test surfacing shallowness in Tier A.

### Data-surface investigation (2026-04-25, Explore agent)

Three findings load-bearing for the brief:

1. **Actor distinction is structural and typed.** Engine has formal `ActorIdentity` (`packages/core/src/shared/logger.ts`):
   ```typescript
   { type: 'human' | 'ai-agent' | 'system'; id: string; name?: string }
   ```
   Every domain event carries it via `GovernanceEvent.actor` (`packages/core/src/shared/events/types.ts:14-24`). The persisted audit envelope (`packages/core/src/domains/audit/audit-store.ts:17-23`) preserves the typing. So "AI work product" = events where `actor.type === 'ai-agent'` — clean, structural, no inference needed.

   **One small gap:** `query_audit_trail` MCP tool accepts `actorId` exact-match filter but NOT `actor.type` class filter (`packages/mcp/src/tools/audit-tools.ts`). Phase 4 needs an `actorType?` parameter to scope queries to AI agents efficiently. Engine ask in Stage 3, ~5 LOC plus tests.

2. **`aiSuitability` field is fully wired.** Tasks expose `aiSuitability` (`packages/core/src/domains/tasks/task-service.ts:116`); populated from the tech-spec-format parser (`packages/tech-spec-format/src/types.ts:70` — `ParsedTask.aiSuitability?: string`); validated by `AISuitabilityValidation` BRE step (`packages/core/src/domains/tasks/validation-steps/ai-suitability-validation.ts:3-60`). Allowed values: `'human-only' | 'ai-only' | 'ai-reviewed' | 'hybrid'`. `'human-only'` blocks AI agents at the BRE level; `'ai-reviewed'` and `'hybrid'` warn-and-pass. Phase 4 audit scopes to `aiSuitability !== 'human-only'`; this is mechanically free.

3. **Data gaps for Tier B exist and are coherent.** PR body text, issue-comment authorship/content, spec-to-task lineage, BRE-bypass aggregated counts are all not exposed today. They're conceptually coupled (work-product *content* vs. work-product *state*); a Phase 5 push handles them together. §7.10 records the named gaps + scope estimates + triggers.

### `state.json open_findings[]` audit

Phase 3 brief §4.2 sketched the schema; **no rule has ever written to it** — sat empty since Stage 1. The schema permits it; `coerce()` (Stage 5 fix at `hooks/lib/state.js:50-71`) preserves unknown top-level fields and type-checks critical ones. File growth is unbounded but expected to stay small for typical sessions.

Phase 4 makes `open_findings[]` the canonical audit-finding store under **single-writer discipline**: only the PM agent writes findings. Hook rules emit advisory escalation as today (Phase 3 pattern); the agent decides whether the surfaced signal warrants persisting. Avoids rule/agent dedup complexity, keeps state writes mechanically simple.

---

## 3. Architecture overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Local Claude Code session                                                    │
│                                                                               │
│  AI agent makes a transition (e.g., complete_task by actor.type=ai-agent)     │
│     │                                                                         │
│     ▼                                                                         │
│  Phase 3 PostToolUse hook (rule-runner)                                       │
│     │                                                                         │
│     │  Phase 4 audit rules ride on Phase 3's substrate (no new primitives):  │
│     │    - ai-work-audit.rules.yaml                                           │
│     │    - emits advisory escalation when audit-class signal found            │
│     ▼                                                                         │
│  Primary reasoner (Opus on next turn) sees recommendation                     │
│     │                                                                         │
│     ▼                                                                         │
│  /agents project-manager                                                      │
│     │                                                                         │
│     │  PM agent (Phase 4 rebuild):                                            │
│     │    1. Reads .ido4/methodology-profile.json — profile-aware identity     │
│     │    2. Reads ${CLAUDE_PLUGIN_DATA}/hooks/state.json — last_compliance,   │
│     │       last_rule_fires, open_findings[]                                  │
│     │    3. Calls MCP audit tools with actorType='ai-agent' filter            │
│     │    4. Computes Tier A metrics                                           │
│     │    5. Synthesizes finding                                               │
│     │    6. If persistence-worthy: writes to open_findings[] (single writer)  │
│     ▼                                                                         │
│  User receives synthesis in turn context                                      │
│                                                                               │
│  ─── Session ends ───                                                         │
│                                                                               │
│  SessionEnd hook persists state.json                                          │
│                                                                               │
│  ─── New session starts ───                                                   │
│                                                                               │
│  SessionStart hook (Phase 4 enrichment):                                      │
│    Banner content adds:                                                       │
│      - Open findings (top 3)                                                  │
│      - Compliance grade trajectory (last 3 sessions)                          │
│      - AI-work summary since last session                                     │
│    Reaches Claude's context as additionalContext                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

Two architectural extensions to Phase 3, no new primitives:

1. **The rule layer extension** — one new rule file (`ai-work-audit.rules.yaml`) using existing runner + existing escalation pattern. Mechanical work.
2. **The agent rebuild** — replaces methodology-hardcoded identity with profile-driven identity; foregrounds the AI-work-product auditor job. The novelty is in framing and content, not in the substrate.

---

## 4. Committed design decisions

### 4.1 Profile-aware PM agent identity (plugin-only, per §7.5)

The agent loads identity-affecting content from `.ido4/methodology-profile.json` at invocation. The profile already exposes (via `ProfileConfigLoader`):
- `principles: [{name, description}, ...]` — replaces the 5-Unbreakable-Principles hardcoding
- `containers` — terminology for Wave/Sprint/Cycle (and any future methodology's container concept)
- `states` — state-machine semantics (per-state name + role)
- `workItems` — terminology for tasks/items/stories

The agent prompt body uses Mustache-style references resolved at session start. The `tools:` frontmatter already contains `Read` (current file line 5: `tools: mcp__plugin_ido4dev_ido4__*, Read, Grep, Glob`), so no frontmatter change is needed.

Sections that change:
- **Description** (frontmatter, line 3) — was `"AI Project Manager with wave-based development governance expertise"`, becomes `"AI Project Manager — auditing AI agents' work product against the active methodology"`. Methodology-neutral; the body adapts.
- **Identity section** — minor copy edit; remove "wave-based" phrasing.
- **The 5 Unbreakable Principles** — entire section becomes profile-driven. Body iterates over `profile.principles[]` and renders them with the same "Why it matters / How you apply it" framing using methodology-aware terminology.
- **Governance Mental Model → State Machine** — flow diagram and state semantics become profile-driven. The Backlog→Refinement→Ready→In Progress→In Review→Done graph is Hydro/Scrum-specific; Shape Up has Shaped→Betting→Building→Shipped/Killed. Body iterates `profile.states[]`.
- **Wave Lifecycle Awareness** — renamed to "Container Lifecycle Awareness," body uses `profile.containers.execution.label` (Wave / Sprint / Cycle) and the same lifecycle bands (early/mid/late/completion).

Sections that stay:
- BRE understanding, Decision Framework (Prioritization Hierarchy + Data-Backed Decision Making), Communication Style, Hard Constraints, Tool Composition Patterns (extended in §4.3).

Sections that get refactored under the audit framing:
- **Risk Detection** → renamed **Audit Patterns**; scoped to AI work-product (see §4.2).
- **Memory Management** → tightens around `state.json open_findings[]` semantics (see §4.4); MEMORY.md authorship dropped per §7.8.
- **Multi-Agent Awareness** → preserves agent-coordination concerns; restructured around `actor.type` distinction.

### 4.2 AI-work-product auditor as foreground job

A new section foregrounds the audit job within the agent's identity. Structure:

> **Audit Methodology**
>
> Your foreground responsibility is auditing AI agents' work product against the active methodology. The human directs and oversees; you catch what the human can't keep in head while AI agents work fast.
>
> **What you audit:** transitions, closures, and state changes by actors with `actor.type === 'ai-agent'`. Scope to tasks where `aiSuitability !== 'human-only'` — human-only tasks are out of audit scope.
>
> **What you check** (Tier A metrics, see below): closure-with-PR, closure-with-review, BRE-bypass count, cycle time, AI-suitability adherence, cross-task coherence per epic.
>
> **What you do with findings:** if a pattern earns persistence, write it to `${CLAUDE_PLUGIN_DATA}/hooks/state.json` `open_findings[]` (single-writer; you're the only one who writes). The next SessionStart will surface unresolved findings to whoever opens the next session.
>
> **What you don't do:** you don't override the BRE; you don't bypass methodology; you don't audit human-driven work the same way (humans need a different reflective conversation, not a compliance audit).

The "synthesis-on-demand" mode (Phase 3's advisory-escalation invocation) becomes a sub-mode of this job — when a hook rule fires and recommends `/agents project-manager`, you're invoked to interpret the signal that already fired, scope it to AI-agent actors, and decide whether persistence is warranted.

### 4.3 Tier A audit metrics

Seven metrics, all computable from existing MCP surface + the `actorType` filter from §4.6:

| # | Metric | Computation | What it catches |
|---|---|---|---|
| 1 | **AI-driven closure rate** | `count(complete_task by actor.type='ai-agent') / count(complete_task)` | Awareness baseline — how much of the work is AI-driven |
| 2 | **Closure-with-PR rate** | For AI-driven `complete_task`, % with `find_task_pr` returning a PR | Ghost closures — AI marking tasks done without artifact |
| 3 | **Closure-with-review rate** | For AI closures with a PR, % with at least one approving review | Rubber-stamp closures |
| 4 | **BRE-bypass count by actor** | Count of `tool_input.skipValidation === true` events grouped by `actor.id` (Phase 3's G1 gate already detects per-event; agent aggregates) | Bypass anti-pattern, especially recurring under one actor |
| 5 | **Cycle time by actor type** | `get_task_cycle_time` results grouped by `actor.type` | Cycle-time anomalies attributable to AI vs. human work |
| 6 | **AI-suitability adherence** | For AI transitions: was the task's `aiSuitability` actually `≠ 'human-only'` at transition time? | Drift if specs are retroactively edited to `human-only` after AI did the work |
| 7 | **Cross-task coherence by AI actor** | Per epic, count of distinct `actor.id` values among `actor.type='ai-agent'` events | Context loss — multiple AI agents touching one epic suggests session-boundary drift |

**Thresholds and persistence triggers** are documented in the agent's body; the rule layer (§4.5) flags candidates and the agent decides what persists. Initial thresholds (tunable):
- Metric 2: closure-with-PR rate < 90% in a session → persist finding
- Metric 3: closure-with-review rate < 80% → persist finding
- Metric 4: bypass count ≥ 3 by same actor in a session → persist finding
- Metric 6: any non-zero adherence violation → persist finding
- Metric 7: > 1 distinct AI actor per epic → persist finding (informational severity)

Metrics 1 and 5 are reporting baselines; surfaced in banner but not persisted as findings unless trend reverses sharply.

### 4.4 `state.json open_findings[]` schema and lifecycle

Schema:

```json
{
  "id": "audit:<category>:<actor_id>:<scope>",
  "source": "pm-agent",
  "category": "bypass_pattern" | "ghost_closure" | "rubber_stamp" | "suitability_drift" | "actor_fragmentation" | ...,
  "title": "<short headline shown in banner>",
  "summary": "<1-3 sentence body>",
  "actor_type": "ai-agent",
  "actor_id": "<agent identifier>",
  "first_seen": "<ISO 8601>",
  "last_seen": "<ISO 8601>",
  "resolved": false,
  "resolved_at": null,
  "evidence": {
    "task_ids": [42, 51, 58],
    "transitions": ["complete_task:42", "complete_task:51"],
    "metrics": { "<metric_name>": <value> }
  }
}
```

**Lifecycle:**
- **Created:** when the agent's audit produces a finding meeting persistence threshold (§4.3) AND no existing finding with the same `id` already exists (deterministic ID composition prevents duplicates).
- **Updated:** if the agent re-encounters the same pattern, it updates `last_seen` and may extend `evidence.transitions[]` (capped at 50 entries; oldest dropped).
- **Resolved:** on next audit, if the same pattern doesn't repeat for the agent_id+category in the audited scope, agent sets `resolved: true` and `resolved_at`. Resolved findings stay in the array for trend detection but hide from the SessionStart banner.
- **Evicted:** bounded cap at 20 findings in the array; FIFO eviction by `first_seen`. If an unresolved finding is about to be evicted, the agent emits a "stale finding evicted" log line in its next invocation (rare event; documents truncation honestly).

**Single-writer discipline:** `hooks/lib/state.js` and `post_evaluation.persist` (Phase 3 Stage 4) explicitly do NOT touch `open_findings[]`. The key is reserved for the agent. Validation: `validate-plugin.sh` greps rule files for `open_findings` writes and fails the build if any rule writes there.

### 4.5 Audit-focused hook rules

New rule file: `hooks/rules/ai-work-audit.rules.yaml`. Three or four rules using Phase 3's runner:

- **AW001 closure-without-PR by AI** — `tool_response.data.actor.type === 'ai-agent' && !tool_response.data.linkedPr`. Severity: warning. Escalates to `project-manager`.
- **AW002 bypass-by-AI** — fires on `validate_transition` with `tool_input.skipValidation === true && actor type indicates AI`. Severity: error. Escalates.
- **AW003 closure-without-review** — for AI-driven `complete_task`, no approving review on the linked PR. Computed deterministically if the data is available; if not available in `tool_response`, the agent computes it post-escalation.
- **AW004 (optional, evaluate during Stage 2)** — actor-fragmentation pattern within session. May require state read from `state.last_assignments` (already populated by Stage 4's assign-task rules in Phase 3). If feasible, ship; if not, defer to agent-side computation.

All rules emit advisory escalation per Phase 3's Stage 7 pattern (`**Governance signal — recommend invoking \`/agents project-manager\`**`). Sibling test fixtures cover ≥2 cases per rule per profile.

### 4.6 Engine ask: `actorType` filter on `query_audit_trail`

Add an optional `actorType?: 'human' | 'ai-agent' | 'system'` parameter to the `query_audit_trail` MCP tool:

- Schema change: `packages/mcp/src/tools/audit-tools.ts` adds the param + zod validation
- Filter: `AuditService.query` extends with `event.actor.type === actorType` predicate when set
- ~5–15 LOC + tests

Non-breaking, additive. Coordinate with engine roadmap before Stage 3 of this phase consumes it. If engine cycle is slow, the agent can post-filter results client-side as a temporary fallback (slower for large audit windows but functionally equivalent).

### 4.7 SessionStart banner enrichment

Banner adds three blocks (token-budget capped at ~500 tokens total):

1. **Open audit findings** (top 3 by severity + recency):
   ```
   [ido4dev] 3 open audit findings:
     - Agent foo bypassed validation 5× last session (bypass_pattern, since W17)
     - Closure-without-PR rate dropped to 75% (ghost_closure, W18)
     - Epic auth touched by 3 AI agents (actor_fragmentation, W18)
   ```

2. **Compliance grade trajectory** (last 3 sessions, from `state.last_compliance` history if present):
   ```
   [ido4dev] Compliance: A → B → B (last 3 sessions)
   ```

3. **AI-work summary since last session** (computed from `state.last_rule_fires` + a small new field `state.last_session_ai_summary`):
   ```
   [ido4dev] Since last session: 12 transitions (8 by ai-agent, 4 by human), 1 BRE bypass, 0 ghost closures
   ```

Banner is composed by the SessionStart script (extends Phase 3 Stage 1 banner). Total tokens monitored; if the open findings list exceeds budget, truncate to top 2 with a "+N more" line.

---

## 5. Execution sequence

5 stages. Each stage lands as a single commit (or coherent pair) on `main`. Each stage leaves the plugin in a working state per `validate-plugin.sh`.

### Stage 1: Profile-aware PM agent rebuild

- Refactor `agents/project-manager/AGENT.md`:
  - Update description (frontmatter) to methodology-neutral phrasing.
  - Replace the 5-Unbreakable-Principles section with a profile-driven section that references `profile.principles[]`.
  - Replace the Wave-flow state machine with a profile-driven state-machine section that references `profile.states[]`.
  - Rename Wave Lifecycle Awareness → Container Lifecycle Awareness; use `profile.containers.execution.label`.
  - Add the **Audit Methodology** section (§4.2 prose).
  - Refactor Risk Detection → Audit Patterns; scope to AI work-product.
  - Tighten Memory Management around `state.json open_findings[]` semantics; drop MEMORY.md authorship per §7.8.
  - Sweep all "wave"/"epic integrity" hardcoded references; replace with profile-aware terminology.
- No behavior change yet — Stages 2–4 wire the audit job.
- Verify in a live session that loading the agent against Hydro, Scrum, and Shape Up profiles produces methodology-coherent identity content.

*Goal:* agent identity is profile-aware. §3.6 (profile-aware everywhere) closes for the PM agent.

### Stage 2: Audit-focused hook rules

- Create `hooks/rules/ai-work-audit.rules.yaml` with rules AW001 / AW002 / AW003 (and AW004 if feasible from `state.last_assignments`).
- Sibling test fixtures: `hooks/rules/ai-work-audit.test.yaml` with ≥2 cases per rule per profile.
- Update `hooks/hooks.json` to include the new matcher routing.
- Update `validate-plugin.sh §O` (no-prompt grep) MIGRATED_MATCHERS list if any new matcher names appear; update `§P` (rule-file lint) to scan the new file.
- Run unit + integration tests; verify in a live session that triggering an AI-driven closure-without-PR fires AW001 with the advisory escalation reaching Claude's context.

*Goal:* reactive audit signals reach Claude's context with the right `actor.type` scope. The agent isn't yet rebuilt to consume them; Stage 3 closes that loop.

### Stage 3: Cross-repo beat — engine `actorType` filter + Tier A metrics in agent

- Engine PR (in `~/dev-projects/ido4/packages/mcp/src/tools/audit-tools.ts` + `packages/core/src/domains/audit/audit-service.ts`): add `actorType?` parameter; ~5–15 LOC + tests in `packages/core/src/domains/audit/`.
- Coordinate with engine roadmap: read `~/dev-projects/ido4/methodology-runner/` end-to-end before opening the engine PR (per §8 intro warning); confirm no rename collision.
- Land engine PR; bump `@ido4/mcp` patch version; update `ido4dev/package.json` reference.
- Plugin: extend the agent's body with Tier A metric computations + thresholds (§4.3 table). Update Tool Composition Patterns section to use `actorType` filter on audit-trail queries.
- Verify in a live session: agent invoked post-escalation reads `state.json`, calls `query_audit_trail` with `actorType: 'ai-agent'`, computes metrics, produces a synthesis grounded in real data.

*Goal:* PM agent reasons on Tier A metrics. Cross-repo beat closes cleanly.

### Stage 4: SessionStart banner enrichment + `open_findings[]` persistence

- Extend SessionStart hook script to read `open_findings[]` + compliance trajectory + AI-work summary from `state.json`.
- Implement the bounded-cap (20 findings, FIFO) write path. The agent's body documents the schema; the runner doesn't need changes (writes happen in the agent, not in rules).
- Add SessionEnd persistence of `last_session_ai_summary` (small synthesis: transition count by actor.type, bypass count, ghost-closure count from the session's `last_rule_fires`).
- Update `docs/hook-architecture.md` with the `open_findings[]` schema + lifecycle + single-writer discipline.
- Update `validate-plugin.sh`: §Q (new) — checks no rule file writes `open_findings` (single-writer enforcement); §R (new) — checks SessionStart banner script renders without error against a fixture state.json.
- Verify in a live session that:
  - Persisting a finding via the agent → `state.json open_findings[]` updated atomically
  - Restart → SessionStart banner surfaces the unresolved finding
  - Re-audit → finding marked resolved if pattern doesn't repeat

*Goal:* institutional memory surfaces at next-session-start without prompting. The §3.9 thesis lands operationally for AI work-product audit.

### Stage 5: Closing smoke test

Focused smoke test, modeled on Phase 2/3's. Run in a live Claude Code session against a sandboxed Hydro project:

1. **AI-driven closure-without-PR.** Have the AI close a task without a PR; verify AW001 fires, recommendation reaches the user, agent invocation produces a finding, finding lands in `open_findings[]`.
2. **BRE bypass by AI.** AI calls `complete_task` with `skipValidation: true`; verify AW002 fires + G1 (Phase 3) also fires; agent invocation aggregates bypass count and escalates.
3. **SessionStart banner surfaces unresolved finding.** End session; restart; verify banner shows the finding from scenario 1 or 2.
4. **PM agent invoked manually computes Tier A metrics.** User invokes `/agents project-manager`; agent reads state.json + audit trail filtered by `actorType: 'ai-agent'`; produces a Tier A audit summary.

Produces `reports/e2e-006-phase-4-smoke.md`.

**Tier B trigger evaluation step.** After the four scenarios pass, ask: did the agent's findings feel like quality assessment, or surface-level transition checks? If shallow, §7.10 Tier B trigger fires — open `phase-5-brief.md` next.

*Goal:* Phase 4 ships verified. §7.10 trigger evaluated honestly.

---

## 6. Verification

After every stage:

1. `bash tests/validate-plugin.sh` — structural green. Must stay at `0 failed`.
2. `node tests/rule-runner-unit.test.mjs` — runner passes all unit tests.
3. `node tests/rule-file-integration.test.mjs` — walks every `*.test.yaml`, runs cases, asserts.
4. `node tests/compatibility.mjs` — MCP tool surface unchanged (Stage 3 will add a single new optional param; non-breaking).
5. Live test in fresh Claude Code session for the stage's new code path.

Post-phase: Stage 5 smoke test + final audit via `bash ~/dev-projects/ido4-suite/scripts/audit-suite.sh`.

---

## 7. Coordination points

- **PM agent (`agents/project-manager/AGENT.md`)** — fully rewritten in Stage 1. Foundation for Stages 2–4. Methodology-neutral identity; profile-aware content.
- **`@ido4/mcp` + `@ido4/core`** — one cross-repo beat in Stage 3 (`actorType` filter on `query_audit_trail`). Read `~/dev-projects/ido4/methodology-runner/` before opening engine PR.
- **Suite docs** — `docs/hook-architecture.md` updated in Stage 4 with banner enrichment + `open_findings[]` schema + single-writer discipline. No suite-strategy changes.
- **Interface contracts** — Phase 4 doesn't change contract #5 (MCP runtime — the new `actorType` param is additive) or #6 (tech-spec format).
- **§7.10 Phase 5 dependency** — Phase 4's smoke test (Stage 5) is the first quality gate that may trigger Phase 5. Phase 4 brief explicitly references §7.10 so future sessions don't relitigate.

---

## 8. Open decisions to resolve during execution

These are flagged here so they get resolved in the right stage, not swept:

1. **Multi-AI-actor audit scoping.** When multiple AI actors exist, the audit's coherence-by-actor metric (Tier A #7) needs a way to group. Proposed: agent reads all `actor.type === 'ai-agent'` events, groups by `actor.id`, surfaces patterns at the actor-level. Resolve in Stage 3 once the `actorType` filter is in.

2. **Banner content size budget.** SessionStart `additionalContext` has practical limits (token budget, attention impact). Proposed: banner is ≤500 tokens; top-3 findings + 1-line trajectory + 1-line work summary. Resolve in Stage 4 — instrument actual token counts during the live verification.

3. **Resolution semantics for findings.** When does `resolved=true` get set? Proposed: on next audit, if the same pattern doesn't repeat for the same `actor_id+category`, agent marks resolved. No user "resolve" command in Phase 4 (could be added later if pain surfaces). Resolve in Stage 4.

4. **Profile-driven agent description vs. body content.** Agent's frontmatter `description:` may not template (verify against current Claude Code agent loading semantics). If it doesn't template, keep the description methodology-neutral and put all profile-aware content in the body. Resolve in Stage 1.

5. **AW004 actor-fragmentation rule feasibility.** Whether AW004 fits in Stage 2 vs. moves to agent-side computation depends on whether the existing `state.last_assignments` (Phase 3 Stage 5) carries enough data for the rule to fire deterministically. Investigate at Stage 2 start; commit choice in the Stage 2 commit message.

6. **Tier B trigger evaluation criteria.** What counts as "Tier A is shallow" in the Stage 5 smoke test? Proposed: if the agent's audit findings consist of only state-based observations (counts, rates) without any quality narrative, Tier B trigger #1 has fired. If the agent narrates quality grounded in metrics, Tier A is enough. Resolve at Stage 5; record decision in the smoke-test report.

---

## 9. End-of-Phase checklist

- [ ] `agents/project-manager/AGENT.md` is methodology-neutral; profile-aware content loads from `.ido4/methodology-profile.json`
- [ ] No "wave"/"epic integrity"/"DoR"/"DoD"/"appetite" hardcoded terminology except where profile data resolves to it (audit grep returns clean)
- [ ] `hooks/rules/ai-work-audit.rules.yaml` exists with sibling test fixtures and ≥2 cases per rule per profile
- [ ] Engine PR for `actorType` filter on `query_audit_trail` landed and consumed by plugin
- [ ] Agent body documents Tier A metric computations + thresholds + tool composition patterns using `actorType` filter
- [ ] `state.json open_findings[]` schema documented in `docs/hook-architecture.md`
- [ ] Single-writer discipline enforced (validate-plugin.sh §Q greps rule files for `open_findings` writes; fails on any)
- [ ] SessionStart banner surfaces top-3 open findings + compliance trajectory + AI-work summary; ≤500 tokens
- [ ] Bounded-cap (20 findings, FIFO) implemented; eviction logic tested
- [ ] `validate-plugin.sh §Q` (single-writer) and §R (banner renders) sections added
- [ ] `architecture-evolution-plan.md §11` status log has Phase 4 closure entry
- [ ] `reports/e2e-006-phase-4-smoke.md` captures closing smoke test
- [ ] §7.10 Tier B trigger evaluated and recorded in the smoke-test report

---

## 10. Status Log

| Date | Update |
|---|---|
| 2026-04-25 | Brief drafted. Predecessor `phase-3-brief.md` shipped same day; Phase 3 closed clean (commits c0a22d2, 0e17edf, ebabb20). Three pre-drafting research streams: (1) Routines vs `CronCreate` primitive distinction surfaced — Routines is cloud-scheduled durable substrate, account-scoped, runs blind to `state.json`/skills/`${CLAUDE_PLUGIN_DATA}`; `§7.6` rewritten. Routines deferred per user 2026-04-25. (2) Mission reframing — agent's job is on-demand AI-work-product auditor on behalf of the human overseer (audit subject = AI; consumer = human), not "AI PM doing morning rounds." (3) Data-surface investigation — `actor.type: 'human' \| 'ai-agent' \| 'system'` is structural and typed at engine; `aiSuitability` field fully wired with `'human-only' \| 'ai-only' \| 'ai-reviewed' \| 'hybrid'` values + BRE-validated; one small engine ask needed (`actorType` filter on `query_audit_trail`, ~5 LOC). Tier B metrics (PR body, comment trails, spec lineage) deferred to Phase 5 with `§7.10` entry. Phase 4 ships local-substrate-only: profile-aware PM agent rebuild + audit hook rules + Tier A metrics + SessionStart banner enrichment + `state.json open_findings[]` as canonical audit-finding store under single-writer discipline. 5 stages. Awaiting commit. |

---

## Appendix A: Research provenance

The design decisions in this brief are grounded in three pre-drafting research streams (2026-04-25):

**Stream 1 — Routines / CronCreate primitive distinction** (claude-code-guide subagent over Anthropic primary docs at code.claude.com/docs/en/routines + code.claude.com/docs/en/scheduled-tasks + tessl.io coverage). Findings: Routines is a cloud-scheduled durable substrate (account-scoped, ~1-hour minimum interval, daily caps Pro 5 / Max 15 / Team 25, one-off runs exempt); runs in Anthropic-managed sandbox cloning the user's repo with MCP connectors registered to the user's account; CANNOT read `state.json`, invoke plugin skills, or access `${CLAUDE_PLUGIN_DATA}`. `CronCreate` / `CronList` / `CronDelete` are internal session-scoped tools (7-day expiry, require open session). The `/schedule` CLI command is the user-facing interface for Routines. The two primitives are layered, not interchangeable. Detailed in `§7.6`.

**Stream 2 — Mission reframing** (collaborative alignment turns). User clarification 2026-04-25: dominant ido4 deployment case is AI agents acting on behalf of humans; humans direct/adapt/oversee. Some GH issues are human-only (the `aiSuitability: 'human-only'` field already encodes this). Reframing under §3.9 institutional-memory thesis: PM agent's job is overseeing AI work product on behalf of the human, not "AI PM doing morning rounds." Routines deferred — multi-stakeholder distribution is the only proactive use case that earns its slot under §3.9, and that audience hasn't arrived yet (per §1 target audience).

**Stream 3 — Data-surface investigation** (Explore agent, very thorough). Confirmed against primary sources:
- `ActorIdentity` typed at engine level: `{type: 'human' | 'ai-agent' | 'system', id, name?}` (`packages/core/src/shared/logger.ts`); every `GovernanceEvent` carries it (`packages/core/src/shared/events/types.ts:14-24`); persisted in audit envelope (`packages/core/src/domains/audit/audit-store.ts:17-23`).
- `aiSuitability` field fully operational: populated by `ParsedTask.aiSuitability` (`packages/tech-spec-format/src/types.ts:70`), set in `TaskService.create` (`packages/core/src/domains/tasks/task-service.ts:116`), validated by `AISuitabilityValidation` (`packages/core/src/domains/tasks/validation-steps/ai-suitability-validation.ts:3-60`). Allowed values inferred from validation switch: `'human-only' | 'ai-only' | 'ai-reviewed' | 'hybrid'`.
- `query_audit_trail` MCP tool exposes `actorId` exact-match filter but NOT `actor.type` class filter — small engine ask in Stage 3.
- `state.json open_findings[]` schema permits findings; `coerce()` (Phase 3 Stage 5 fix) preserves unknown top-level fields and type-checks critical ones; never written to in Phase 3 — sat empty since Stage 1.
- Data gaps for Tier B (PR body text, issue-comment authorship/content, spec-to-task lineage, BRE-bypass aggregated counts) are coherent and conceptually coupled — single Phase 5 push handles them together. Tracked in `§7.10`.

The full Stream 3 report (~800 words with cited paths + line numbers) was delivered inline during the alignment turns; load-bearing facts distilled into `§2` and §4 of this brief.
