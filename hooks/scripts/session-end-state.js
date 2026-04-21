#!/usr/bin/env node
// SessionEnd hook: persist session state to state.json.
//
// Stage 1 scope: writes the minimal schema (version, ended_at, last_compliance,
// last_rule_fires, open_findings). Later stages populate the fields from rule
// evaluations during the session; Stage 1 just establishes the file and its
// shape so downstream hooks and rules can read/write it reliably.
//
// Pattern: §4.6 of ~/dev-projects/ido4-suite/docs/hook-and-rule-strategy.md
// (state file + in-session buffer; NOT a full event log).

'use strict';

const fs = require('fs');
const path = require('path');

const dataDir = process.env.CLAUDE_PLUGIN_DATA;
if (!dataDir) {
  process.stderr.write('SessionEnd: CLAUDE_PLUGIN_DATA not set; skipping state persistence.\n');
  process.exit(0);
}

const stateDir = path.join(dataDir, 'hooks');
const stateFile = path.join(stateDir, 'state.json');

try {
  fs.mkdirSync(stateDir, { recursive: true });
} catch (e) {
  process.stderr.write(`SessionEnd: failed to create ${stateDir}: ${e.message}\n`);
  process.exit(0);
}

// Read existing state if present (preserve fields written during the session)
let state = {};
if (fs.existsSync(stateFile)) {
  try {
    state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    if (state === null || typeof state !== 'object' || Array.isArray(state)) {
      state = {};
    }
  } catch (e) {
    // Corrupt state — reset cleanly
    state = {};
  }
}

// Ensure canonical schema
state.version = 1;
state.ended_at = new Date().toISOString();
if (!state.last_compliance || typeof state.last_compliance !== 'object') {
  state.last_compliance = null;
}
if (!state.last_rule_fires || typeof state.last_rule_fires !== 'object') {
  state.last_rule_fires = {};
}
if (!Array.isArray(state.open_findings)) {
  state.open_findings = [];
}

// Atomic write via temp file + rename
const tmpFile = `${stateFile}.tmp`;
try {
  fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2) + '\n');
  fs.renameSync(tmpFile, stateFile);
} catch (e) {
  process.stderr.write(`SessionEnd: failed to write ${stateFile}: ${e.message}\n`);
  try { fs.unlinkSync(tmpFile); } catch (_) {}
  process.exit(0);
}

process.exit(0);
