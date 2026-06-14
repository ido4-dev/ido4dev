# A2-structural — Derive audit-finding category from facts (design)

**Status:** Approved direction (founder: "go for derive, no validation"). Design for build.
**Problem:** The PM agent chooses finding `category` + `severity` by LLM judgment and writes them freely. Across synthetic-001/002/003 it mislabeled three times — most damningly filing `ghost_closure` on a task whose PR it had just confirmed, overriding its own prose hard-stop. Prose is settled-insufficient.
**Principle:** §3.1 — BRE deterministic, LLM for judgment. Every other classification in the system (VT/CS/AW rules, the BRE) is deterministic code over structured data. The audit layer is the lone violation. This restores it.
**Approach:** The LLM **gathers facts and narrates**; **code classifies and persists**. The agent never authors a category → a mislabel is structurally impossible.

---

## 1. The division of labor

| Step | Who | What |
|---|---|---|
| Gather facts | **LLM (PM agent)** | Per audited closure/actor, call the audit tools and extract the discriminating facts (below). Genuine judgment: *which* tasks to audit, *which* tools to call. |
| Narrate | **LLM** | A human-readable `note` per observation (e.g. "agent-alpha closed #5; PR open, unreviewed"). Genuine judgment. |
| **Classify** | **Code** | `category` + `severity` computed from the facts. No LLM. |
| Threshold / suppress | **Code** | Decide whether the facts even cross the bar for a finding (silence is the default). |
| Persist | **Code** | Read-then-mutate `open_findings[]`, stamp deterministic `id`, embed the facts as evidence. |

The agent does not pick categories, does not pick severities, does not decide thresholds, does not write the file. It supplies *observations*; the classifier turns qualifying observations into findings.

## 2. Fact schema (the classifier's input)

The agent writes a JSON array of **observations**, one per audited unit. A closure observation:

```json
{
  "kind": "closure",
  "issue": 5,
  "actor_id": "agent-alpha",
  "terminal": true,                 // reached a terminal state (Done/Shipped/…)
  "pr_found": true,                 // find_task_pr returned a PR
  "pr_number": 15,
  "approving_reviews": 0,           // get_pr_reviews count of APPROVED
  "pr_body_len": 240,               // for shallow_pr
  "pr_ref_count": 1,                // acceptance-criteria/spec/issue refs in body
  "comment_count": 0,               // get_task_comments
  "lineage_ref": "ND-01",           // get_task_lineage (null if none)
  "ai_suitability": "full",
  "ai_did_work_then_marked_human_only": false,
  "note": "agent-alpha drove #5 to Done; PR #15 present but unreviewed"
}
```

Other kinds: `{ "kind": "bypass", "actor_id", "attempts", "executed", "note" }` (attempts from `state.bypass_attempts[]` grouped by actor_id); `{ "kind": "epic", "epic", "distinct_ai_actors", "note" }`.

Facts must be *extracted from the actual tool results* the agent called — the finding embeds them, so a misreport is visible/auditable (the narrow residual risk; far better than free mislabel).

## 3. The classifier (pure function — the "When to Persist" thresholds as code)

`hooks/lib/finding-classifier.js` → `classify(observation) → Array<{category, severity}>` (empty = no finding):

| Condition | category | severity |
|---|---|---|
| `terminal && !pr_found` | `ghost_closure` | error |
| `terminal && pr_found && approving_reviews === 0` | `rubber_stamp` | error |
| `terminal && pr_found && (pr_body_len < 200 \|\| pr_ref_count === 0)` | `shallow_pr` | warning |
| `terminal && comment_count === 0` | `silent_closure` | warning |
| `terminal && lineage_ref === null` | `spec_orphan` | info |
| `kind==='bypass' && attempts >= 3` | `bypass_pattern` | error |
| `ai_did_work_then_marked_human_only` | `suitability_drift` | error |
| `kind==='epic' && distinct_ai_actors > 1` | `actor_fragmentation` | info |
| otherwise | — | (silence) |

Multiple may apply to one closure (e.g. `rubber_stamp` + `shallow_pr`) — each becomes a finding. `ghost_closure` and `rubber_stamp` are mutually exclusive by construction (no-PR vs PR). A clean, reviewed closure matches nothing → **no finding** (the silence the audit kept failing to produce).

Pure, no I/O, no LLM → fully unit-testable, like the rule-runner.

## 4. Persistence (deterministic, single write path)

`hooks/scripts/persist-findings.js <observations.json>`:
1. Read the project state (`state.resolveStateFile`, read-then-mutate — preserves runner fields).
2. For each observation → `classify()` → for each resulting `{category, severity}` build a finding: deterministic `id` (`audit:<category>:<actor_id>:<scope>`), `category`/`severity` **from the classifier**, `title`/`summary` from the observation `note`, `evidence.facts` = the observation, timestamps.
3. Dedup/update by `id` (existing behavior), FIFO cap 20, write atomically.
4. Print a summary of what was persisted/suppressed (so the agent can relay it).

The agent invokes this via Bash. It **cannot** set category/severity — they're computed inside. (Per "derive, no validation," there's no second guard; the single deterministic write path *is* the guarantee.)

## 5. AGENT.md changes

- **Replace** the "Category discipline" + "Mandatory pre-persist verification" prose (no longer load-bearing — structural now) with a short "Findings are derived, not authored" section: gather facts → write the observations JSON → run `persist-findings.js`. "You do not choose categories or severities; the classifier does. Your job is accurate facts (extracted from real tool results) and a clear note."
- Keep the **minimum-sufficient-evidence** sequences (which tools to call per pattern) — that's the still-valuable judgment half.
- Keep the **advisory framing** of the agent's *conversational* output, but persisted findings are now deterministic, so drop the "confirm before acting" hedging on persisted categories.

## 6. Tests & guards

- `tests/finding-classifier.test.mjs` — facts → expected categories/severities for every row above + the no-finding case + multi-category + bypass/epic kinds.
- `tests/rule-file-integration` style: a fixture observations file → `persist-findings.js` → assert state `open_findings[]` shape + that category matches the classifier (never the input).
- `validate-plugin.sh`: replace the §S2 prose-marker checks with (a) classifier module exists, (b) AGENT.md references `persist-findings.js` and states categories are derived.

## 7. Scope / non-goals

- **Does not touch the BRE or blocking** — the PM remains a non-blocking auditor; only its *reporting* becomes deterministic. Zero risk to enforcement.
- **Residual risk:** the LLM could misreport a *fact*. Narrowed by embedding the facts in the finding (visible/auditable) and requiring extraction from real tool results. Not eliminated — but a misreported fact is far rarer and more catchable than a free-form mislabel, and "derive, no validation" accepts this per founder direction.
- Verified by a realistic-loop T3 run: the clean reviewed closure (#5) must now produce **no finding**, and a genuine ghost/rubber-stamp must classify correctly.
