#!/usr/bin/env node
// SessionEnd hook: persist session state + compute AI-work audit summary.
//
// Two responsibilities:
//   1. Stamp ended_at on the state file so SessionStart can show the delta.
//   2. Compute last_session_audit_summary from last_rule_fires entries that
//      match Phase 4 AW rule prefixes (AW001/AW002/AW005), then clear those
//      AW entries from last_rule_fires so they don't carry into the next
//      session's debounce or summary.
//
// Counting strategy: each unique `<rule_id>:<scope>` key in last_rule_fires
// represents one signal event (a single (rule, target) pair). Counting keys
// by AW prefix gives us the per-session count of each audit-class signal
// without touching the engine's audit-log.jsonl. Simple, contained, no new
// schema beyond the summary field itself (which state.coerce() preserves
// as an unknown top-level field per Phase 3 Stage 5 semantics).
//
// Cross-session cleanup: AW entries are removed from last_rule_fires at
// SessionEnd so the NEXT session's count is genuinely "this-session-only."
// Non-AW entries (G1/G3/G5/CS/CH) are preserved because they may still be
// debounce-relevant. If a future need arises to keep AW history across
// sessions for cross-session pattern detection, that's the §7.7 event-log
// promotion territory.
//
// Pattern: §4.6 of ~/dev-projects/ido4-suite/docs/hook-and-rule-strategy.md.

'use strict';

const path = require('path');
const state = require('../lib/state.js');

const dataDir = process.env.CLAUDE_PLUGIN_DATA;
if (!dataDir) {
  process.stderr.write('SessionEnd: CLAUDE_PLUGIN_DATA not set; skipping state persistence.\n');
  process.exit(0);
}

const stateFile = path.join(dataDir, 'hooks', 'state.json');

const AW_PREFIXES = ['AW001_', 'AW002_', 'AW005_'];

function isAwKey(k) {
  for (const p of AW_PREFIXES) {
    if (k.startsWith(p)) return true;
  }
  return false;
}

try {
  state.update(stateFile, (s) => {
    s.ended_at = new Date().toISOString();

    const fires =
      s.last_rule_fires && typeof s.last_rule_fires === 'object' && !Array.isArray(s.last_rule_fires)
        ? s.last_rule_fires
        : {};
    const keys = Object.keys(fires);

    const summary = {
      ghost_closure_triggers: keys.filter((k) => k.startsWith('AW001_')).length,
      bypasses: keys.filter((k) => k.startsWith('AW002_')).length,
      suitability_violations: keys.filter((k) => k.startsWith('AW005_')).length,
      ended_at: s.ended_at,
    };

    const total = summary.ghost_closure_triggers + summary.bypasses + summary.suitability_violations;
    if (total > 0) {
      // Stamp summary for SessionStart to surface in the resume banner.
      s.last_session_audit_summary = summary;
    } else {
      // Clear stale summary from a prior session — don't surface old counts
      // as if they were from THIS session.
      delete s.last_session_audit_summary;
    }

    // Clear AW entries from last_rule_fires; preserve everything else.
    const cleaned = {};
    for (const k of keys) {
      if (!isAwKey(k)) {
        cleaned[k] = fires[k];
      }
    }
    s.last_rule_fires = cleaned;

    return s;
  });
} catch (e) {
  process.stderr.write(`SessionEnd: failed to write ${stateFile}: ${e.message}\n`);
}

process.exit(0);
