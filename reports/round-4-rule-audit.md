# Round 4 — OBS-09 Rule Audit

**Scope:** Issue #2 in ido4dev — rule audit across the 3 decomposition agents and 3 phase skills.

**Status:** IN REVIEW — pre-edit inventory drafted, awaiting user sign-off before executing edits.

**Created:** 2026-04-12 — 2026-04-13

**Foundation:** `docs/ingestion-enforcement.md` (this repo). Every Case A classification below is traceable to a row in that document's enforcement matrix. Every Case C classification is supported by Round 3's empirical baseline showing the agent complying with the prose rule even though no code layer enforces it.

**Related work:**
- `~/dev-projects/ido4-suite/briefs/fix-ido4-mcp-core-wildcard-dep.md` — Phase 7 in `ido4-suite/PLAN.md`. Blocks the currently-failing ido4dev behavior tests from going green, but does not block this audit (the audit is anchored to `@ido4/core` 0.7.2 source behavior, not the stale 0.5.0 installed version).
- `reports/e2e-003-ido4shape-cloud.md` — OBS-09 origin (lines 407-453).
- `~/dev-projects/ido4-suite/docs/prompt-strategy.md` — the authoring standard this audit enforces.

---

## Framework

Every rule-shaped item classifies as one of:

- **Case A** — genuinely redundant with deterministic enforcement. Delete or collapse.
- **Case B** — qualitative judgment call, no code layer catches violations. Reshape as principle + BAD/GOOD example. Language pass.
- **Case C** — prose-only, load-bearing, unenforced. Keep, reshape language, add WHY. Round 3 empirical data shows the agent is complying — the prose IS the enforcement.

Nothing gets deleted based on "the parser probably catches it" — the row must exist in the matrix as structurally enforced.

## Net-count summary

| File | Before | After | Net |
|---|---|---|---|
| `agents/code-analyzer.md` | 7 numbered rules + 2 mode "non-negotiable" lists | 4 principles + 1 hard rule + trimmed mode lists | **−2 to −3** |
| `agents/technical-spec-writer.md` | 6 rules + Step-0 (4) + Step-4 (4) + Step-5 (7) + Structure (5) + Tech-Cap (4) ≈ 30 | 3 principles + 1 hard rule + 2 Tech-Cap principles + trimmed process ≈ 12 | **−18** |
| `agents/spec-reviewer.md` | 25 checklist items (reviewer's own protocol — not an audit target) | 25 + language pass | 0 |
| `skills/decompose/SKILL.md` | 5 rule-shaped | 3 | **−2** |
| `skills/decompose-tasks/SKILL.md` | 8 rule-shaped (heavy agent duplication) | 3 | **−5** |
| `skills/decompose-validate/SKILL.md` | 5 rule-shaped (heavy reviewer duplication) | 2 | **−3** |
| **Total** | **~80** | **~60** | **−20 (≈25% reduction)** |

Plus: net additions from OBS-07 (intent-over-prescription principle in both agents) and OBS-08 (methodology-neutrality principle in both agents + one-line reminder in two skills). Net-net the plugin still trends smaller, but less dramatically than the −32 first draft — that number was based on wrong-enforcement assumptions from reading the parser without running it.

---

## File 1 — `agents/code-analyzer.md`

| # | Rule (abbrev) | Case | Matrix evidence | Action |
|---|---|---|---|---|
| R1 | Never guess about code you haven't read | **B** | Unenforced (no row) | Reshape principle + BAD/GOOD example. Drop "Never". |
| R2 | Cite specific file paths and line numbers | **B** | Unenforced | Fold into R1 as single principle: "Grounded claims only — cite file:line or say you don't know". |
| R3 | Preserve strategic context intact — canvas is the preservation layer | **C** | "Strategic context preserved verbatim from strategic spec to canvas" → **Unenforced — prose only** | **Keep.** Remove `MUST carry forward verbatim` all-caps. Lead with WHY: canvas is the only artifact Phase 2 receives. Keep the enumeration (descriptions, success conditions, stakeholder attribs, group context, constraints, non-goals, open questions) — Round 3 verified the prose works. |
| R4 | Be honest about complexity | **B** | Unenforced | Reshape principle + example. |
| R5 | Don't design solutions | **B** | Unenforced | **Merge with OBS-07's new principle** ("Describe what makes the work hard, not how to solve it"). R5's intent is preserved inside the new principle. |
| R6 | Flag shared infrastructure | **B** | Unenforced | Reshape principle + example. Explain downstream use (writer creates PLAT-/INFRA- tasks). |
| R7 | Use Read tool, never `cat` via Bash | **C** | Unenforced | **Keep.** Positive framing: "Read files with the Read tool; pass content to MCP tools directly". Drop "Never". Short WHY (shell redirection loses content). |
| Mode "non-negotiable" blocks (greenfield-with-context, greenfield-standalone) | Template | — | **Keep structurally.** Drop `non-negotiable` framing + all-caps. Reorder: mode instructions before the Rules section (hard rules near end per prompt-strategy). |

**Additions from OBS-07/OBS-08:**
- OBS-07 intent-over-prescription principle: *"Complexity Assessment describes what makes the work hard and what it depends on, not how to solve it."* Inline example.
- OBS-08 methodology-neutrality principle (shared text with tech-spec-writer).

---

## File 2 — `agents/technical-spec-writer.md`

Heaviest accumulator. Most of the reduction lands here.

### The 6 numbered rules

| # | Rule | Case | Matrix evidence | Action |
|---|---|---|---|---|
| R1 | Every metadata value traceable to canvas | **B** | Unenforced (reviewer Stage 2 qualitative only) | Principle + BAD/GOOD example. |
| R2 | Preserve stakeholder attribution | **C** | "Stakeholder attribution preserved verbatim" → **Unenforced by both parser and reviewer** | **Keep.** Merge with broader "context preservation" framing. Parallel to code-analyzer R3. |
| R3 | Success conditions code-verifiable | **B** | "≥2 success conditions" → Unenforced by parser (any count); reviewer has qualitative Stage 2 check only | Principle + example. Round 3 baseline: 0/94 violations — agent is complying. |
| R4 | Don't create tasks you can't assess | **B** | Unenforced | One-line principle. Self-explanatory, no example. |
| R5 | Respect the contract (parseable by `spec-parser.ts`) | **C** | Parser is lenient — unknown metadata keys = warning, silent data loss for malformed refs. **Prose is load-bearing.** | **Keep, reshape.** Drop all-caps MUST. Explain WHY the contract exists + point at spec-reviewer as the Layer-2 enforcer. Do NOT delete. First-draft classification of Case A was wrong. |
| R6 | Use Read tool, never `cat` | **C** | Unenforced | Same treatment as code-analyzer R7. |

### Process steps

| Location | Item | Case | Matrix | Action |
|---|---|---|---|---|
| Step 0 (canvas validation, 4 items) | per-cap sections / strategic context / cross-cutting detail / dep layers | **C** | Canvas is upstream of ingestion — not in matrix. Unenforced by any code. | **Delete from writer agent.** Consolidate into `decompose-tasks/SKILL.md` Stage 1a (which already duplicates this). Skill is closer to execution. See AMB-1 below. |
| Step 4 (4 items: no cycles, refs resolve, topological order, shared infra first) | Dep graph validation | **A + C mix** | "No circular dependency chains" → mapper fatal (Case A). "`depends_on` refs resolve" → non-fatal mapper error (Case C — still useful prose). "Topological order" → mapper handles (Case A). | **Reshape as 1-line principle:** "The mapper rejects cycles and drops unresolved deps — build a valid graph or the reviewer will flag it." Drop the 4-item checklist. |
| Step 5 (7 items) | Description length / success conditions / effort-risk consistent / type / AI / group context / cross-cutting refs | **C mostly** | All unenforced by parser/mapper. Reviewer Stage 2 catches items 1/3/5 qualitatively. Round 3: 1/94 baseline on length, 0/94 on everything else. | **Keep in writer agent** — Round 3 proves the prose is working. But **delete the duplicate list from `decompose-tasks/SKILL.md` Stage 1b** (see below). One place, not two. |

### Sub-sections

| Section | Action |
|---|---|
| **Goldilocks Principle** (already principle-shaped) | Language pass only. Drop "Ask yourself" meta-framing. |
| **Metadata Assessment tables** (allowed values) | **Keep.** They're how-to-pick knowledge. Add one-line note: "The mapper only warns on unknown values — the reviewer is the real enforcer. Values matter." |
| **Structure: Capabilities as Top-Level Units** (5 bullets) | Bullet 1 ("one `## Capability:` per strategic cap") — **Case B**, unenforced. Keep as principle. Bullets 2-5 — keep, language pass. |
| **Technical Capabilities** rules (4 items) | **Keep as 2 principles** (distinct prefix + minimal/justified). Parser doesn't enforce prefix semantics. Round 3 has INFRA-01, INFRA-02, PLAT-01, PLAT-02 — compliance is good. |

**Additions from OBS-07/OBS-08:**
- OBS-07 intent-over-prescription: new principle + 1 BAD/GOOD example block (the STOR-01A example from the E2E report).
- OBS-08 methodology-neutrality: new principle + 1 LEAK/NEUTRAL example block (the "wave planning" example from the E2E report).

---

## File 3 — `agents/spec-reviewer.md`

**Not a rule-reduction target.** The Stage 1 / Stage 2 / governance / validation-rules items ARE the reviewer's job description, not behavioral rules on a synthesizing agent.

**Audit scope:**
1. **Language pass.** Scan for `MUST`/`NEVER`/`ALWAYS` all-caps on Stage-2 qualitative items. Current file is mostly OK.
2. **Optional: BAD/GOOD examples** for Stage 2's vaguest checks ("description substance", "success conditions specific"). Improves reviewer consistency on Sonnet (per prompt-strategy model-tier sensitivity guidance). See AMB-2 below.

---

## File 4 — `skills/decompose/SKILL.md`

| Location | Item | Case | Action |
|---|---|---|---|
| Behavioral Guardrail | "ASK and STOP. Never auto-..." | **C** | Positive framing, drop "Never", short WHY. |
| Stage 0 step 2: "Your next action MUST be parse_strategic_spec" | **C** (Round-2 OBS-02 fix) | Keep — direct regression fix. Drop MUST, frame positive. |
| Stage 1a brief size: "MUST be under 300 tokens" | **B** | Reshape: "Keep each brief under ~300 tokens…" + WHY (token budget). |
| Stage 1c: "Every capability MUST have its own `## Capability:` section" | **C** (Round-2 OBS-06 fix, load-bearing) | **Keep.** Drop all-caps. Language pass. Round 3 baseline: 29/29 match. |
| Stage 1d count verification (grep capability count) | Inline enforcement, not a rule | **Keep as-is.** This is the enforcement. |
| "Do not invoke decompose-tasks yourself" | **A** | Skill boundary enforces. Shorten to one sentence. |

---

## File 5 — `skills/decompose-tasks/SKILL.md`

Heaviest duplication zone.

| Location | Item | Case | Action |
|---|---|---|---|
| Behavioral Guardrail | Same | **C** | Same treatment. |
| Stage 1a canvas validation (4 checks) | **C** | **Keep here, delete from tech-spec-writer Step 0** (move skill-side, agent is redundant). |
| Stage 1b quality checklist (6 items) | **A** — duplicates tech-spec-writer Step 5 | **Delete the checklist.** Replace with one sentence: *"The writer agent's Step 5 quality checklist applies — respect it."* |
| Stage 1b "output MUST be parseable" | **C** (parser is lenient) | Drop MUST, reshape as reference to writer R5. |
| Stage 1c `grep -c` verification | Inline | **Keep.** |
| "Do not invoke decompose-validate yourself" | **A** | Shorten. |

---

## File 6 — `skills/decompose-validate/SKILL.md`

| Location | Item | Case | Action |
|---|---|---|---|
| Behavioral Guardrail | Same | **C** | Same. |
| Stage 1a-1e: re-enumerates spec-reviewer.md protocol | **A** | **Consolidate.** Replace the enumeration with: *"Read `agents/spec-reviewer.md` and execute its protocol. That file is the single source of truth for the review contract."* Slim the skill to workflow-specific parts (verdict handling → PASS/FAIL branching, Stage 2 preview, Stage 3 ingest). |
| Stage 2: "Do NOT initialize the project yourself" | **C** | Keep. Drop all-caps. Short WHY (methodology is a user decision per round-1 design finding). |
| Stage 3: "Only proceed on explicit user approval" | **C** | Keep. Already normal case — language pass only. |

---

## Silent-failure gaps — flagged as separate findings

Per decision 2026-04-13 (option (a)), these do **not** become inline rule changes in this audit. They're listed in `docs/ingestion-enforcement.md` under "Silent-failure gaps" and each should open a dedicated issue after the audit lands.

| Finding | Current behavior | Candidate fix (deferred) |
|---|---|---|
| **XL effort silently conflated with L** | Both map to `Large` bucket in mapper. No warning. | Parser upgrade (distinct bucket) OR spec-reviewer Stage 2 check |
| **Wrong capability heading silent drop** | `## Group:` not recognized; tasks become orphans; zero signal. | Parser upgrade (warn on unrecognized `##` lines) OR pre-ingest hook |
| **Malformed task ref silent absorption** | `### test-01`, `### TOOLONG-01` absorbed into body; zero signal. | Parser upgrade (warn on `### ...:` lines that don't match task regex) OR pre-ingest hook |

Tracking issues to be opened after audit completion.

---

## Non-rule deliverables

These accompany the rule edits but aren't rule-count-affecting:

1. **Language pass** across all 6 files. Zero `MUST`/`NEVER`/`ALWAYS` all-caps on Case B items. Case C hard rules get lowercase imperatives + WHY.
2. **Rule-order reshuffle** per prompt-strategy: identity → I/O → process → principles → hard rules (bottom).
3. **OBS-07 principle + example** in both `code-analyzer.md` and `technical-spec-writer.md`.
4. **OBS-08 principle + example** in both agents, plus one-line reminder in `decompose/SKILL.md` and `decompose-tasks/SKILL.md` Stage 1 summary instructions.

---

## Ambiguous cases requiring user judgment

**AMB-1. Consolidation direction for canvas-validation checks.** The same 4-item canvas validation exists in `technical-spec-writer.md` Step 0 AND `decompose-tasks/SKILL.md` Stage 1a. One of them is redundant. Proposal: **delete from the writer agent, keep in the skill** (skill is closer to execution). Alternative: the reverse (keep in agent, delete from skill), which centralizes rules near the writer's other rules. **Status:** pending user decision.

**AMB-2. Reviewer Stage 2 BAD/GOOD examples.** Proposed but marked optional. Adding them expands scope but likely improves reviewer consistency on Sonnet. Proposal: **add them** (small addition, high value). Low cost to reverse. **Status:** pending user decision.

**AMB-3. Regression-safety log location.** Append to `reports/e2e-003-ido4shape-cloud.md` OR keep in this file (`reports/round-4-rule-audit.md`). Proposal: **keep in this file** (matches the one-document-per-round pattern, keeps the Round 3 report frozen). **Status:** resolved — this file.

---

## Execution log

_(To be filled as edits land.)_

| # | File | Change | Commit |
|---|---|---|---|
| _(TBD)_ | — | — | — |

---

## Regression-safety log

For every Case A deletion and every Case C reshape that removes specific prose, record: **original text**, **failure it prevented**, **enforcement layer that catches violations now**, and **Round 5 watch-flag** (whether calibration should explicitly look for regression).

_(To be filled as edits land.)_

| Location | Original text | Failure prevented | Current enforcement | Round 5 watch |
|---|---|---|---|---|
| _(TBD)_ | — | — | — | — |

---

## Pre-edit checklist

Before any file gets edited:

- [ ] User has signed off on the overall classification (this section)
- [ ] AMB-1 resolved
- [ ] AMB-2 resolved
- [ ] AMB-3 resolved (✓ — resolved to this file)
- [ ] Confirmed scope: 6 files in a single coherent pass
- [ ] Agreement on commit granularity (my lean: one bundled commit, since edits are interdependent)

## Post-edit verification

- [ ] `claude plugin validate .` passes
- [ ] `grep -rn 'MUST\|NEVER\|ALWAYS\|CRITICAL' agents/ skills/` — no all-caps on Case B items
- [ ] Rule count before/after per file matches the net-count summary table
- [ ] Every deleted rule has an entry in the regression-safety log
- [ ] Diff presented for user review before any commit

## Completion record

_(To be filled once committed.)_

| Item | Status |
|---|---|
| Files edited | — |
| Commit SHA | — |
| Validation passed | — |
| Regression-safety log complete | — |
| Silent-failure-gap issues opened | — |
