#!/usr/bin/env node
// SessionStart hook: emit a concise resume banner from state.json.
//
// Reads ${CLAUDE_PLUGIN_DATA}/hooks/state.json (written by SessionEnd last time)
// and prints a one-line banner that Claude Code attaches to context as a system
// reminder. No banner if state.json is absent or empty (fresh session).
//
// Pattern: §2.3 of ~/dev-projects/ido4-suite/docs/hook-and-rule-strategy.md
// (simple state file over full event log — ship what the current rule set needs).

'use strict';

const fs = require('fs');
const path = require('path');

const dataDir = process.env.CLAUDE_PLUGIN_DATA;
if (!dataDir) {
  process.exit(0);
}

const stateFile = path.join(dataDir, 'hooks', 'state.json');
if (!fs.existsSync(stateFile)) {
  process.exit(0);
}

let state;
try {
  state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
} catch (e) {
  // Corrupt or unreadable — stay silent
  process.exit(0);
}

const parts = [];

if (state.last_compliance && state.last_compliance.grade) {
  parts.push(`last compliance: ${state.last_compliance.grade}`);
}

if (Array.isArray(state.open_findings) && state.open_findings.length > 0) {
  const n = state.open_findings.length;
  parts.push(`${n} open finding${n === 1 ? '' : 's'}`);
}

if (state.ended_at) {
  const hoursAgo = Math.round((Date.now() - new Date(state.ended_at).getTime()) / 36e5);
  if (Number.isFinite(hoursAgo) && hoursAgo >= 0) {
    parts.push(`prior session ended ${hoursAgo}h ago`);
  }
}

if (parts.length > 0) {
  console.log(`[ido4dev] Resuming — ${parts.join(', ')}`);
}

process.exit(0);
