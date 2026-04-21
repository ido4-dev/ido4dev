#!/usr/bin/env node
// SessionEnd hook: persist session state to state.json.
//
// Reads any existing state (preserving fields written during the session via
// PostToolUse rules), stamps ended_at, writes atomically. All heavy lifting
// lives in hooks/lib/state.js so the rule-runner and this script share one
// schema implementation.
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

try {
  state.update(stateFile, (s) => {
    s.ended_at = new Date().toISOString();
    return s;
  });
} catch (e) {
  process.stderr.write(`SessionEnd: failed to write ${stateFile}: ${e.message}\n`);
}

process.exit(0);
