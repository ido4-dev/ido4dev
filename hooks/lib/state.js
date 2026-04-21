// Hook state layer: read/write wrapper for ${CLAUDE_PLUGIN_DATA}/hooks/state.json.
//
// Pattern: §4.6 of ~/dev-projects/ido4-suite/docs/hook-and-rule-strategy.md
// (simple state file over full event log). The schema is a summary, not an
// event history — fields: version, session_id, updated_at, ended_at,
// last_compliance, last_rule_fires, open_findings.
//
// This module is deliberately small. It exposes:
//   - emptyState()             : canonical empty state object
//   - read(path)               : file → coerced state object (never throws)
//   - write(path, state)       : state object → atomic file write
//   - update(path, mutator)    : read, mutate in place, write; returns final
//   - coerce(raw)              : normalize an arbitrary object into schema
//
// Upgrade trigger documented in the strategy doc §2.3 / §4.7: when the first
// rule genuinely needs cross-session event history, add an append-only
// events.ndjson alongside state.json — do NOT preemptively layer it.

'use strict';

const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 1;

function emptyState() {
  return {
    version: SCHEMA_VERSION,
    last_compliance: null,
    last_rule_fires: {},
    open_findings: [],
  };
}

// Normalize an arbitrary parsed object into the schema shape. Preserves known
// fields, drops unknown ones silently, replaces wrong-typed fields with their
// default. Never throws.
function coerce(raw) {
  const s = emptyState();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return s;

  if (raw.last_compliance && typeof raw.last_compliance === 'object' && !Array.isArray(raw.last_compliance)) {
    s.last_compliance = raw.last_compliance;
  }
  if (raw.last_rule_fires && typeof raw.last_rule_fires === 'object' && !Array.isArray(raw.last_rule_fires)) {
    s.last_rule_fires = { ...raw.last_rule_fires };
  }
  if (Array.isArray(raw.open_findings)) {
    s.open_findings = [...raw.open_findings];
  }
  if (typeof raw.session_id === 'string') s.session_id = raw.session_id;
  if (typeof raw.updated_at === 'string') s.updated_at = raw.updated_at;
  if (typeof raw.ended_at === 'string') s.ended_at = raw.ended_at;

  return s;
}

function read(stateFile) {
  if (!stateFile || !fs.existsSync(stateFile)) return emptyState();
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch (e) {
    return emptyState();
  }
  return coerce(raw);
}

function write(stateFile, state) {
  if (!stateFile) return;
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  const payload = JSON.stringify({ ...coerce(state), version: SCHEMA_VERSION }, null, 2) + '\n';
  const tmp = `${stateFile}.tmp`;
  try {
    fs.writeFileSync(tmp, payload);
    fs.renameSync(tmp, stateFile);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (_) {}
    throw e;
  }
}

// Read, run mutator, write atomically. Mutator may return a replacement state
// or mutate the argument in place (both patterns supported).
function update(stateFile, mutator) {
  const current = read(stateFile);
  const result = mutator(current);
  const next = result || current;
  next.updated_at = new Date().toISOString();
  write(stateFile, next);
  return next;
}

module.exports = {
  SCHEMA_VERSION,
  emptyState,
  coerce,
  read,
  write,
  update,
};
