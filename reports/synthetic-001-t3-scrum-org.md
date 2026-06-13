# Synthetic E2E 001 — T3 Scrum-Org Hybrid-Team Simulation

**Date:** 2026-06-14
**Harness:** `~/dev-projects/ido4-suite/synthetics/` — `t3-run.mjs` (orchestrated arc) + `judge.mjs` (dual lens)
**Run:** `runs/t3-scrum-org-2026-06-13T22-14-55/` (v2 tuning; ~$18 arc + judges)
**Plugin:** ido4dev @ `fa0a3b0` (+ uncommitted Stage-5 work), engine `@ido4/mcp@0.9.2`
**Scenario:** A team that ran human-only Scrum for years, now hybrid — 2 AI agents (work via MCP) + 3 human personas (PO, reviewer, dev via GitHub), one sprint across simulated days, mostly-healthy work with planted incidents, Sprint-0 seeded history.
**Verdict (strategic judge):** *"Keep the engine, not yet the system — a gated pilot, not adoption."*

---

## 1. What this run proves

This is the first fully-automated, multi-session, real-GitHub simulation of ido4 governing a hybrid Scrum team end to end. It ran 10 headless Claude Code sessions across the sprint arc, captured every transcript, applied 11 deterministic assertions, then judged the whole history through two lenses (technical fidelity + a skeptical-engineering-director value ledger). Teardown was clean (repo + board deleted, no orphans).

**The deterministic spine held.** The single most important product result: the BRE's gates made both planted AI incidents *structurally unreachable*, not merely detected after the fact.
- **Definition of Ready** was enforced — `start_task` was rejected on under-specified issues until acceptance criteria were added.
- **PR / context gates** blocked closing work that lacked the required artifacts.
- **G1 skipValidation** was hard-blocked — the agent could not force a transition through.
- The **PM agent grounded correctly** (read the profile + state first), **excluded the human-only task** (CO-02) from audit, and **caught a real rubber-stamp closure** that the deterministic suite scored as clean.

That is the core thesis validated: deterministic, methodology-aware enforcement at the moment of action, applied to AI work.

**The institutional-memory layer did not close one full loop in this run** — partly because of harness bugs (below), partly because of two genuine product gaps. That is the "not yet the system" half of the verdict, and it is actionable.

---

## 2. Triage — three buckets

The judges' value is that they separated *product behavior* from *harness artifacts*. Critically, **several deterministic "failures" were my harness bugs masking correct product behavior, and two of the most important findings were product gaps the deterministic layer could not see.** Bucketed:

### A. Product wins (validated — keep)
- BRE DoR/PR/context gates + G1 bypass block held against both planted incidents.
- PM agent: correct grounding, human-out-of-scope respected, caught the rubber-stamp.
- Banner round-trip mechanism works when state is seeded at the correct path.
- Planning ceremony produced genuinely Scrum-native reasoning (sprint goal as commitment, velocity-baseline-establishing language, dependency-aware scoping).

### B. Real product findings (for triage → engine/plugin)

| ID | Sev | Finding | Where it lands |
|----|-----|---------|----------------|
| **P1** | High | **Hydro terminology leaks into Scrum projects.** Sprint forced into `wave-001-email-delivery` naming; `get_board_data` / analytics return `containerStatus.name: "wave-..."` and `analytics.waveName`. A Scrum project speaks Hydro — contradicts §3.2/§3.6 methodology-as-data. | engine: container-naming rule + aggregator field names (the `wave-detection.ts` / container layer §6 #16 deferral may be implicated) |
| **P2** | High | **Rubber-stamp closure allowed.** `approve_task` → Done succeeded with the linked PR open, unmerged, and unreviewed. DoD-enforcement gap. The LLM judge caught it; 11 prior manual rounds + the deterministic suite did not. | engine: should the closing transition require a merged/approved PR? BRE design question |
| **P3** | Med | **AW PostToolUse advisory layer does not surface in headless `-p` mode.** Only SessionStart hooks reach the stream/context; Pre/PostToolUse hooks fire (G1 blocked the bypass) but their advisory output is not injected. Works interactively (Phase 4 Stage 5 proved AW001 reaching context). | platform limitation + harness fidelity ceiling; document in README "Known platform constraints"; add an interactive-mode verification |
| **P4** | Med | **PM audit over-fetch persists.** $3.87 / 45 turns / 68 tool calls — milder recurrence of Phase 4 F1. Partly inflated by permission-retry loops (harness), but beyond minimum-sufficient-evidence. | agent prose (re-confirm minimum-sequence discipline) + harness allowlist |
| **P5** | Med | **Single AI identity.** All MCP work records `actor.id: 'mcp-session'`; agent-alpha vs agent-beta indistinguishable → `actor_fragmentation` undetectable. Known V2 finding, re-confirmed. | engine roadmap (per-agent actor identity) |
| **P6** | Low | **Banner resume line is low-value when no substantive state** ("Resuming — prior session ended 0h ago"). | plugin: suppress trivial resume lines (silence-when-empty extends to here) |

### C. Harness artifacts (my bugs — fix before re-run)

| ID | Finding | Fix |
|----|---------|-----|
| **H1** | **`/tmp` vs `/private/tmp` project-key split.** `seedSprintZeroState` keyed state by the `/tmp/...` workdir, but sessions run at the `/private/tmp/...` realpath → the seeded Sprint-0 memory never reached any session → banner round-trip carried no governance state, Sprint-0 invisible. (Same symlink subtlety I hit in the SessionEnd probe.) | `realpath` the workdir before seeding/keying |
| **H2** | **Canonical state write gated in headless mode.** The PM agent's `Write` to `~/.claude/plugins/data/.../state/*.json` was blocked even with `Write` allowed — Claude Code gates writes under `~/.claude`. Correct findings landed in an `add_task_comment` sidecar instead of `open_findings[]`. | pre-approve the state path, or accept headless can't persist and assert against the sidecar; real product note: automation-mode persistence needs a path |
| **H3** | **Allowlists too narrow → 63 permission denials → agents guessed.** Discovery tools (`list_tasks`/`get_task`/`list_sprints`/Bash) gated, so agents inferred issue↔ref mappings from wrong linear-spec order: the PO pushed **CO-02 (human-only!) instead of SH-01 (XL)**; planning touched ND-03 instead of ND-02. None observed by any assertion. | widen agent-beat allowlists to include read/discovery tools, or run agent beats with `--dangerously-skip-permissions` (throwaway sandbox) |
| **H4** | **Incident assertions mis-scoped.** AW001 assertion assumed the ghost closure could complete, but the BRE *prevented* it (PR-gate). To exercise the audit layer, plant incidents that pass the gates (e.g., the rubber-stamp, which did). | re-scope assertions to what governance permits; add an interactive beat for the advisory layer |
| **H5** | `create_sprint` gated → sprint goal couldn't be recorded on the container. | include in allowlist |

---

## 3. The headline insight

The two best findings of the entire run — **P1 (Hydro-in-Scrum)** and **P2 (rubber-stamp allowed)** — were caught by the **LLM value/fidelity judges, not by any deterministic assertion**, and not by eleven prior manual E2E rounds across the suite. That is the synthetic harness justifying itself: an adversarial reader, given the definitions and the full transcript, finds governance gaps the rule-based layer is blind to.

Equally important, the judges correctly attributed the *headline deterministic failures* to environment artifacts ("not reasoning failures"), preventing a false negative. Without that, results.json (8/11) reads as "the product is shaky"; the truth is "the product's enforcement is strong, the harness was mis-wired, and there are two real gaps to close."

---

## 4. Recommended next actions

**Harness (fast, unblocks a clean re-run):** H1 realpath, H3 wider allowlists (or skip-permissions for agent beats), H4 re-scoped assertions, H2 persistence path, H5. ~½ day. Then re-run to get a clean baseline where the memory loop actually closes.

**Product (triage with founder — these are direction calls):**
- **P1 Hydro-in-Scrum** — verify whether the Scrum profile's container naming/analytics fields are genuinely Hydro-hardcoded; if so this is a methodology-equality bug worth fixing before any Scrum pilot.
- **P2 rubber-stamp** — decide whether the closing transition should require a merged/reviewed PR (DoD enforcement). This is the highest-value governance improvement the run surfaced.
- **P3 advisory-in-headless** — document as a platform constraint; the interactive path is proven, but automation users should know.

**Verdict to carry forward:** the strategic judge's "gated pilot, not adoption — re-evaluate after one full catch→persist→resurface loop closes on healthy and unhealthy work alike" is the right bar. The harness fixes (H1/H2) are exactly what's blocking that loop from closing in the simulation; once they're in, the next run measures whether the memory layer delivers.

---

## 5. Cost & artifacts

- Arc: 10 sessions, ~$11.5. Judges: fidelity $4.57 / value $3.92. Total ~$20.
- Deterministic: 8/11 (3 "failures" = H1/H2/H4 artifacts).
- Fidelity judge: 8 findings, 5 positives, ledger 3 catches / 3 insights / 0 noise / 4 friction.
- Value judge: 12 findings, 6 positives, ledger 6 catches / 3 insights / 4 noise / 7 friction.
- Full transcripts + `judge-fidelity.json` + `judge-value.json` under the run dir (gitignored; key content captured above).
