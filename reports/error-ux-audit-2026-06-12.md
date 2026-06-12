# Error UX Consistency Audit — Phase 5 WS5

**Date:** 2026-06-12
**Scope (per `docs/phase-5-brief.md §4.5`):** walk every MCP tool error path; verify each produces a `message + remediation` shape; flag bare `throw new Error(...)` without remediation.
**Engine commit under audit:** `ido4` main @ `5371776` (v0.9.1); fixes landed as `b50d38a`.
**Verdict:** ✅ **Architecture sound; 7 real gaps found and fixed; no release-blocking issues.**

---

## How errors flow (verified)

1. Domain layer throws `Ido4Error` subtypes (`shared/errors/index.ts`) carrying `code`, `context`, optional `remediation`, `retryable`.
2. Every MCP tool handler wraps its body in `handleErrors()` (`packages/mcp/src/helpers/error-handler.ts`) — **54/54 registration sites verified wrapped**, no exceptions.
3. `toErrorResult` serializes `{message, code, remediation, retryable}` to the wire with `isError: true`.
4. Non-`Ido4Error` throws degrade to `code: INTERNAL_ERROR` with **no remediation** — making bare throws the thing to hunt.

Verified live during the synthetics spike: `get_compliance_data` against an uninitialized dir returned the clean `CONFIGURATION_ERROR` + remediation shape headlessly.

## Inventory

| Population | Count | Status |
|---|---|---|
| MCP tool handlers | 54 | All wrapped in `handleErrors` ✓ |
| `Ido4Error`-family throw sites (core src) | 72 | — |
| … with remediation | 51 | ✓ |
| … without remediation, fixed this audit | **7** | ✓ fixed in `ido4@b50d38a` |
| … without remediation, deliberately left | 14 | see below |
| Bare `throw new Error(` (core src) | 5 | all internal invariants, left |
| Bare throws (mcp src) | 0 | ✓ |

## Fixed (engine commit `b50d38a`)

| Site | Why it mattered |
|---|---|
| `error-mapper.ts` generic GraphQL fall-through | All unclassified GitHub GraphQL failures (incl. permission shapes) landed here remediation-less → now token/scope guidance |
| `error-mapper.ts` generic HTTP fall-through | Status-aware: 5xx → "retry shortly"; 4xx → token-scope guidance |
| `error-mapper.ts` unknown-shape fall-through | Network/token guidance |
| `issue-repository.ts` status-option not found | Real scenario: user renames/deletes a board column → now explains board-vs-profile mismatch + restore-or-reinit |
| `issue-repository.ts` field not found | Same class |
| `repository-repository.ts` no default branch | Empty-repo case → "push an initial commit" |
| `agent-service.ts` agent not registered | → `register_agent` / `list_agents` hint |

## Deliberately left (recorded so it isn't re-litigated)

- **10 × `Issue/PR #N not found` (`NotFoundError`)** — message self-explanatory; carries `{resource, identifier}` context. Boilerplate remediation on 10 sites is noise (suite principle: silence is a feature).
- **2 × rate-limit sites** — `RateLimitError` constructor auto-injects remediation with the reset timestamp.
- **2 × `container-service.ts` ValidationError** — the `InputSanitizer` message IS the remediation (states the expected format).
- **5 × bare `throw new Error`** — all internal invariants: `scenario-builder.ts:38/41/44` (bundled sandbox template sanity — we control the template; firing means a build bug, not a user error) and `actor.ts:45/52` (actor-string parsing — only reachable via corrupted audit-log lines). If profiles become user-authored (engine Phase 2+), scenario-builder's profile checks should upgrade to `ConfigurationError`; noted, not done.

## Structural observations (no action)

- **MCP resources bypass `handleErrors`** — `resources/index.ts` handlers throw raw to the SDK. Low stakes: resources are read-only context fetches, unreachable from subagents anyway (the F7 rationale). Becomes relevant only if resources grow logic.
- **Prompts are static text builders** — no error paths.
- **Aggregators degrade gracefully** (internal try/catch, no throws) and sit inside wrapped handlers regardless.

## Verification

- Engine: full build + 1,840 tests green post-change (1227 core + 466 spec-format/tech-spec-format + 106 + 41).
- Change is additive (remediation strings only) — no schema or behavior deltas; no plugin-side test impact.
- Release: pending — sits on `ido4` main awaiting either a `0.9.2` patch release or batching with any further Stage 5 engine findings (decision flagged to founder).
