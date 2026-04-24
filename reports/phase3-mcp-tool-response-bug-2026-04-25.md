# Phase 3 Critical Bug: PostToolUse Hooks Silently Failed for MCP Tools

**Date discovered:** 2026-04-25 (during Phase 3 closing smoke test, Scenarios 2-3)
**Severity:** CRITICAL — Phase 3 shipped with all PostToolUse rules silently failing in production
**Status:** Fixed in working tree (uncommitted), verified live (CS002 fired against live data)

This document captures the bug + fix in case the session is interrupted before the full smoke-test commit lands. Code changes live in `hooks/lib/rule-runner.js`, the four PostToolUse rule files, four sibling test fixtures, and unit tests — all uncommitted.

---

## The bug

ALL of Phase 3's PostToolUse rules referenced fields on `tool_response.X` (e.g., `tool_response.canProceed`, `tool_response.grade`, `tool_response.integrity.maintained`). In production they consistently errored with:

```
[rule-runner] rule X: when-expression error — Cannot read properties of undefined (reading 'grade')
```

Result: **no rules fired in live sessions, no additionalContext reached Claude.** Phase 3 hooks looked dead.

This was NOT caught by 70 integration tests + 80 unit tests because all fixtures used direct objects (`tool_response: {canProceed: false, ...}`), not the actual production shape.

## The journey of misunderstanding

We went through three wrong shape assumptions before finding the truth:

1. **Initial (Stages 2-7):** `tool_response = ValidationResult` directly. Tests trained on this.
2. **First fix attempt:** `tool_response = {success: true, data: ValidationResult}` — based on Claude's UI rendering. Updated rules + fixtures. Local CLI tests passed. **Live still broke.**
3. **Actual shape (Claude Code v2.1.119):** `tool_response = [{type: "text", text: "<JSON STRING>"}]` — the MCP `CallToolResult.content` array passed bare, not wrapped. `text` contains the JSON-encoded `{success, data}`.

The third shape was confirmed via debug instrumentation that logged the actual `tool_response` shape from a live hook invocation:

```
[rule-runner DEBUG] tool_response top-level keys: [<not an object>]
| preview: [{"type":"text","text":"{\n  \"success\": true,\n  \"data\": ...
```

## The fix (current working tree)

### `hooks/lib/rule-runner.js`

Added `unwrapMcpToolResponse()` helper that detects MCP shapes and JSON-parses the inner data:

```js
function unwrapMcpToolResponse(toolResponse) {
  if (!toolResponse) return toolResponse;
  let contentArray = null;
  if (Array.isArray(toolResponse)) {
    contentArray = toolResponse;
  } else if (typeof toolResponse === 'object' && Array.isArray(toolResponse.content)) {
    contentArray = toolResponse.content;
  }
  if (
    contentArray &&
    contentArray.length > 0 &&
    contentArray[0] &&
    contentArray[0].type === 'text' &&
    typeof contentArray[0].text === 'string'
  ) {
    try {
      return JSON.parse(contentArray[0].text);
    } catch (e) {
      warn(`tool_response: content[0].text was not valid JSON — passing through unparsed (${e.message})`);
      return toolResponse;
    }
  }
  return toolResponse;
}
```

Applied in `evaluate()` at context construction:

```js
const ctx = {
  tool_input: ...,
  tool_response: unwrapMcpToolResponse(rawToolResponse),
  ...
};
```

After unwrap, `tool_response` is the parsed `{success, data}` object. Rules use `tool_response.data.X` — natural and consistent.

### Rule files (4 files updated)

All four PostToolUse rule files now reference `tool_response.data.X`:
- `hooks/rules/validate-transition.rules.yaml`
- `hooks/rules/compliance-score.rules.yaml`
- `hooks/rules/complete-and-handoff.rules.yaml`
- `hooks/rules/assign-task.rules.yaml`

### Test fixtures (4 files updated)

All four sibling test fixtures now wrap `tool_response` as `{success: true, data: <original>}` so integration tests exercise the same shape rules expect.

### New unit tests

`tests/rule-runner-unit.test.mjs` gained 7 cases covering `unwrapMcpToolResponse`:
- MCP `{content: [...]}` object form unwraps
- Bare content array form unwraps (the actual Claude Code v2.1.119 shape)
- Non-MCP direct objects pass through (preserves test fixture usability)
- Non-text content type passes through
- Empty content passes through
- Malformed JSON falls back to original
- null/undefined safe pass-through

Plus `evaluate()` integration test confirming MCP-shaped events resolve through the unwrap into rule-accessible `tool_response.data.X`.

## Live verification status

**Verified in live Claude Code session (v2.1.119, Opus 4.7) on 2026-04-25:**

- ✓ Hook fires for `compute_compliance_score`
- ✓ Runner unwraps MCP shape correctly (no errors in stderr post-fix)
- ✓ CS002 fired correctly when seeded baseline category was ≥70 and live category came in at 60 — first proven live rule-fire after the fix
- ✓ Claude received `additionalContext` and reasoned on it ("Hook fired this time. Reading the injected context...")
- ✓ `state.json` updated with full live `last_compliance` data (grade A, score 92, all 5 categories with live values + engine-produced summary)

**Pending live verification (next 10 min of smoke test):**
- VT001 (validate_transition BRE block) — same fix path, high confidence
- G1 PreToolUse skipValidation gate — different code path; PreToolUse, not affected by the unwrap (but worth verifying)

## Test status

| Suite | Pre-fix | Post-fix |
|---|---|---|
| `rule-runner-unit.test.mjs` | 80 / 80 | 88 / 88 (+8 unwrap cases) |
| `rule-file-integration.test.mjs` | 70 / 70 | 70 / 70 |
| `validate-plugin.sh` | 108/0/1 | 108/0/1 |
| Live MCP shape replay (CLI) | N/A | green |

## Why this wasn't caught earlier

- **No live integration test in the test suite.** All testing was against synthetic fixtures whose shape was assumed, not measured against production.
- **The phase-3-brief Stage 9 specifically called for live verification** — exactly to catch this class of bug. We caught it; the brief was right.
- **My initial Stage 2 research about hook event shapes was incomplete.** I documented `tool_response` as "raw return value" without verifying it against an actual MCP tool call. The "raw return value" for MCP tools is the `CallToolResult` (an array of content blocks), not the parsed inner data.

## Follow-up implications

- **The smoke-test runbook should add an explicit "live MCP-shape verification" step** — the only way to catch shape drift between assumed and actual.
- **Hook architecture doc (`docs/hook-architecture.md`) should describe the MCP unwrap behavior** — currently silent on it.
- **Future researchers / Codex reviewers should know:** for any hook handling MCP tool responses, the actual incoming shape is `[{type: "text", text: "<JSON>"}]` (or the older `{content: [...]}` wrapping), not the parsed data. Always unwrap.

## What was committed before this discovery

- Sandbox UX findings (`reports/sandbox-ux-findings-2026-04-25.md` + `architecture-evolution-plan.md §7.9`) — separate concern, already committed (`0349657`).
- Phase 3 Stages 1-8 — committed and shipped, but with this latent PostToolUse bug. Stage 9 is what's surfacing it.

## Commit plan once smoke test wraps

Single commit titled along the lines of: `Phase 3 Stage 9 fix — unwrap MCP CallToolResult content array in rule-runner`

Will include:
- `hooks/lib/rule-runner.js` — `unwrapMcpToolResponse` + applied in evaluate
- `hooks/rules/*.rules.yaml` (4 files) — `tool_response.data.X` paths
- `hooks/rules/*.test.yaml` (4 files) — wrapped fixtures
- `tests/rule-runner-unit.test.mjs` — 8 new unwrap cases
- `docs/hook-architecture.md` — document the MCP unwrap (small section)
- `architecture-evolution-plan.md §11` — status log entry

Plus the smoke test report `reports/e2e-005-phase-3-smoke.md` once we have the full set of scenario results.
