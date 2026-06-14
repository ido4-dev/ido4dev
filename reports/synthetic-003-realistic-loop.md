# Synthetic E2E 003 — Realistic-Loop Run (GitHub App reviewer)

**Date:** 2026-06-14
**Run:** `runs/t3-scrum-org-2026-06-14T16-53-11/`
**Under test:** `@ido4/mcp@0.10.0` + plugin (P8/A2) + harness App-as-reviewer (ido4-agent[bot], App `4052668`).
**What's new vs 002:** a distinct GitHub identity (the App) reviews the agents' PRs, so a task can **close cleanly through the P2 DoD gate** — the first run with a genuinely clean, reviewed closure for the audit to evaluate.
**Verdict (value judge):** *"Adopt, with conditions"* — up from "gated pilot" (001/002). Conditions are concrete and listed below.

---

## 1. The realistic loop works

- **App review → clean close, proven.** `ido4-agent[bot]` submitted an APPROVED review on PR #15 (authored by b-coman); `PRReviewValidation:1` then passed and `approve_task` took #5 to Done (both judges confirm via the engine audit log). The full **build → review → ship** loop closes. *(The deterministic assertion read `issue state=UNKNOWN` — a harness timing glitch: the close beat hit `error_max_turns` and the post-read raced the close. The judges, reading the audit log, confirm the close executed.)*
- **14/15 deterministic** (the 1 "fail" is that timing glitch). P1 (Sprint naming), P7 (3 bypass attempts recorded, per-agent), multi-agent (`agent-alpha`/`agent-beta` distinct), banner round-trip, CO-02 exclusion, read-then-mutate — all green.
- Both judges: the **deterministic gate held in both planted incidents** — the ghost closure was *prevented*, the bypass *deterred* (one run flipped the agent off an explicit "force it" directive onto the compliant path). Healthy work produced almost no noise.

## 2. The decisive finding: A2 (prose) is insufficient — structural enforcement required

**The PM audit filed `audit:ghost_closure:agent-alpha:…:issue-5` at `error` severity against #5 — even though its own `find_task_pr` had returned PR #15.** It self-documented overriding AGENT.md's explicit hard stop ("ghost_closure requires find_task_pr returned NO PR → STOP"). Both judges, High severity. The value judge: *"the one behavior most corrosive to trust."*

This is the **third consecutive run** the audit mislabeled (001 P8 → 002 A2-needed → 003 A2-insufficient), and now the strongest possible evidence: **a mandatory pre-persist ritual with explicit hard stops did not constrain the LLM — it acknowledged the stop and overrode it.** The lesson is settled: **prose cannot make the LLM audit trustworthy. Finding persistence needs a structural, write-time validator the agent cannot override.** The deterministic suite was blind to it (P8 passed on enum-membership alone; the category was a valid enum value, just the wrong one for the evidence).

(Also persisted a below-threshold `bypass_pattern` finding the discipline says to suppress — same over-persistence class.)

## 3. New High-severity engine bug: the sprint-data path returns an empty sprint

`get_standup_data`, `get_sprint_status`, and `get_board_data` all return Sprint 1 with `tasks: []` and empty metrics — **even though `list_sprints` shows 3–4 committed stories and `assign_task_to_sprint` returned success.** Assignments succeed but don't surface in the daily-ceremony data path. The value judge: *"a daily-ceremony reliability bug a Scrum team would hit immediately."* This is the broader form of synthetic-002's assignment→analytics gap, now confirmed across standup/board/sprint-status. **High — it breaks the core daily ceremonies; fix before any Scrum pilot.**

## 4. Conditions for unconditional adoption (the value judge's list)

| # | Condition | Maps to | Severity |
|---|---|---|---|
| 1 | **Structural write-time block on category-vs-evidence mismatch** (make A2's hard stop deterministic, not prose) | A2 → **A2-structural** | **High — the trust crux** |
| 2 | **Fix the sprint-data path** (standup/board/sprint-status return empty despite assignments) | **new: A5-engine** | **High** |
| 3 | **Confirm the PostToolUse advisory layer fires** (zero AW/CS/CH/AT signal surfaced in all 11 sessions) | A3 + the headless `-p` limitation (P3) | Medium |
| — | XL mid-sprint pull still unflagged | A4 | Medium |
| — | P2 closes on approved-but-**unmerged** PR — decide if Done should require *merged* | P2 refinement | Medium |

## 5. The trajectory is up

Verdict progression: 001 "keep the engine, gated pilot" → 002 "adopt the gate now, audit is beta" → 003 **"adopt, with conditions"** — *"the bypass gate plus cross-session compliance/findings memory is worth the install for a team handing real work to agents."* The deterministic spine is consistently validated; the conditions are now a short, concrete list dominated by one architectural fix (structural finding-validation) and one engine bug (sprint data).

## 6. Cost & artifacts

- Arc 11 sessions ~$7.4; judges fidelity $3.38 / value $3.81. ~$15.
- Verdicts: `reports/synthetic-003-artifacts/judge-{fidelity,value}.json`.
- Realistic loop now reusable: App credentials in `ido4-suite/synthetics/.secrets/` (gitignored), harness auto-loads them.
