# Synthetic E2E 002 — T3 Verification Run (post-0.10.0)

**Date:** 2026-06-14
**Run:** `runs/t3-scrum-org-2026-06-14T11-05-53/`
**Under test:** `@ido4/mcp@0.10.0` (P1+P2+P7 engine) + ido4dev plugin (P7 hooks, P8 agent prose, H1–H7 harness)
**Purpose:** verify the synthetic-001 correctness fixes closed; measure the audit layer once the noise is gone.
**Verdict (value judge):** *"Adopt the real-time gate now; gate the audit/memory layer on the remaining fixes."*

---

## 1. All four fixes verified — 15/15 deterministic

| Check | Result |
|---|---|
| **P1** — Scrum container named "Sprint", not Hydro "wave-NNN" | ✓ sprint-named, transcript wave-free |
| **P2** — DoD gate blocks the rubber-stamp closure | ✓ approve→Done blocked pending PR review |
| **P7** — deterred bypass attempts recorded to `state.bypass_attempts` | ✓ 4 recorded |
| **P8** — persisted finding categories all in the schema enum | ✓ all valid |
| **Multi-agent identity** — distinct per-agent `actor.id` in the audit log | ✓ `agent-alpha`, `agent-beta` (not collapsed to `mcp-session`) |
| Banner round-trip carried governance memory across 11 fresh sessions | ✓ |
| Human-only CO-02 left out of audit scope | ✓ |
| PM agent persisted ≥1 finding | ✓ 2 findings |

Both judges agree the **enforcement layer is now trustworthy and pilot-ready**: *"DoR/DoD/PR-readiness gates and the skipValidation deterrence stopped every planted bad transition before it touched GitHub, healthy work produced zero false signals, and the human-only task was correctly left alone — exactly the behavior that survives contact with a skeptical team."*

This is the first run where the planted incidents were all caught by the *product* (not the harness), the memory loop closed, and the deterministic assertions saw it cleanly. The synthetic-001 → fix → synthetic-002 loop worked.

## 2. The loop sharpened onto the next layer — the PM audit

With the noise gone, both judges converged on the **PM audit/synthesis layer** as the remaining weak link — and notably, the retro session *independently caught the audit's own errors*, which is healthy self-correction but also proof the findings aren't yet trustworthy without re-verification.

| ID | Sev | Finding | Status |
|----|-----|---------|--------|
| **A1** | High | `bypass_attempts[]` carried no `actor_id` → the audit misattributed agent-alpha's bypasses to agent-beta, manufacturing a false per-actor threshold crossing. | **FIXED** (P7 follow-up, this session — actor_id now recorded + audit groups by it) |
| **A2** | High | The PM audit still mislabeled a **rubber-stamp as a critical `ghost_closure`** on a task whose PR #15 demonstrably exists — a direct violation of the P8 category-discipline prose. Passed the enum check (valid category, wrong one). | **Open** — the hard one: prose discipline drifts; the LLM audit needs structural/verification backing, not just more prose |
| **A3** | Medium | Ceremonies (retro/standup) reconcile against `query_audit_trail` only, not `bypass_attempts[]` — so a ceremony recommended deleting the one genuine bypass signal as a "phantom." | Open — teach ceremonies the deterred-attempt source |
| **A4** | Medium | No governance signal for an **oversized/dependency-unready mid-sprint pull** (the XL SH-01 push drew no objection). Consistent with synthetic-001 P11. | Open — engine sprint-sizing rule |
| **A5** | Medium | The standup ceremony failed `error_max_turns` (over-fetched; `get_standup_data` sprint-vs-wave param confusion). | Open — ceremony tuning / param naming |
| A6 | Med | DoR `EffortEstimationValidation` blocks until an Effort field is set, but no obvious MCP tool sets it; Sprint created but never activated (status quirk). | Open — engine/UX |

## 3. The strategic read

**The split the value judge drew is the actionable one:** the deterministic gate is buyable now; the audit/memory layer is "confidently wrong often enough that a careful operator must re-verify every finding, which defeats the purpose." A2 is the crux — and it is the recurring lesson of this whole project: **prose discipline drifts without structural backing.** The P8 prose pass reduced but did not eliminate mislabeling. Making the LLM audit trustworthy needs one of:
- a **verification pass** (a second agent adversarially checks each finding against its cited evidence before it persists — the adversarial-verify pattern the synthetics judge itself uses), or
- **lower-confidence framing** (findings are explicitly advisory/"for human confirmation," matching the "PM surfaces, human decides" model), or
- **structural finding composition** (the agent fills evidence fields first, and the category is *derived* from them by rule, not chosen freely).

This is a genuine design decision, not a prose patch — it determines whether the audit layer ships as a trustworthy capability or an advisory beta.

## 4. Cost & artifacts

- Arc: 11 sessions ~$7.2. Judges: fidelity $3.64 / value $3.38. Total ~$14.
- Deterministic: 15/15. Fidelity judge: 7 findings / 9 positives. Value judge: 10 findings / 6 positives.
- Verdicts preserved: `reports/synthetic-002-artifacts/judge-{fidelity,value}.json`.
- Note: the blocked-path run can't show a *clean* close (single GitHub identity + P2). The realistic loop needs a distinct agent identity — see `ido4-suite/briefs/realistic-e2e-design.md`.
