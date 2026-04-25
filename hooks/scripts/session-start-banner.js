#!/usr/bin/env node
// SessionStart hook: emit a multi-block resume banner from state.json.
//
// Reads ${CLAUDE_PLUGIN_DATA}/hooks/state.json (written by SessionEnd last
// time) via hooks/lib/state.js. Emits up to four blocks to stdout, picked
// up by Claude Code as additionalContext for the new session:
//
//   1. Resume line          — last compliance grade + open-finding count + ended_at delta
//   2. Compliance trajectory — A → B → B over last few measurements (if compliance_history)
//   3. Open audit findings   — top 3 unresolved by recency (last_seen DESC)
//   4. Last-session AI audit — counts of AW rule fires last session
//
// Blocks are independently elided when their data is absent or empty —
// silence is a feature; fresh sessions don't need a "no prior state" line.
//
// Pattern: §2.3 of ~/dev-projects/ido4-suite/docs/hook-and-rule-strategy.md.
// Phase 4 Stage 4 enriched per phase-4-brief.md §4.7.

'use strict';

const fs = require('fs');
const path = require('path');
const state = require('../lib/state.js');

const dataDir = process.env.CLAUDE_PLUGIN_DATA;
if (!dataDir) {
  process.exit(0);
}

const stateFile = path.join(dataDir, 'hooks', 'state.json');
if (!fs.existsSync(stateFile)) {
  process.exit(0);
}

const s = state.read(stateFile);
const lines = [];

// ── Block 1: Resume line ─────────────────────────────────────────
const resumeParts = [];
if (s.last_compliance && typeof s.last_compliance.grade === 'string') {
  resumeParts.push(`last compliance: ${s.last_compliance.grade}`);
}
if (Array.isArray(s.open_findings)) {
  const unresolved = s.open_findings.filter((f) => f && !f.resolved);
  if (unresolved.length > 0) {
    resumeParts.push(`${unresolved.length} open finding${unresolved.length === 1 ? '' : 's'}`);
  }
}
if (typeof s.ended_at === 'string') {
  const hoursAgo = Math.round((Date.now() - new Date(s.ended_at).getTime()) / 36e5);
  if (Number.isFinite(hoursAgo) && hoursAgo >= 0) {
    resumeParts.push(`prior session ended ${hoursAgo}h ago`);
  }
}
if (resumeParts.length > 0) {
  lines.push(`[ido4dev] Resuming — ${resumeParts.join(', ')}`);
}

// ── Block 2: Compliance trajectory ───────────────────────────────
// compliance_history is written by compliance-score.rules.yaml post_evaluation.
// Most-recent-first; show in chronological order for readability.
if (Array.isArray(s.compliance_history) && s.compliance_history.length >= 2) {
  const grades = s.compliance_history
    .filter((h) => h && typeof h.grade === 'string')
    .slice(0, 4)
    .map((h) => h.grade)
    .reverse();
  if (grades.length >= 2) {
    lines.push(`[ido4dev] Compliance trajectory: ${grades.join(' → ')}`);
  }
}

// ── Block 3: Open audit findings (top 3 unresolved by last_seen DESC) ─
if (Array.isArray(s.open_findings)) {
  const unresolved = s.open_findings
    .filter((f) => f && !f.resolved && typeof f.title === 'string')
    .slice() // don't mutate state
    .sort((a, b) => {
      const aT = a.last_seen || a.first_seen || '';
      const bT = b.last_seen || b.first_seen || '';
      return bT.localeCompare(aT);
    })
    .slice(0, 3);
  if (unresolved.length > 0) {
    lines.push('[ido4dev] Open audit findings:');
    for (const f of unresolved) {
      lines.push(`  - ${f.title}`);
    }
  }
}

// ── Block 4: Last-session AI audit summary ───────────────────────
// Written by SessionEnd from last_rule_fires AW prefixes. Only present if
// any AW rule fired last session — silence-when-empty is a feature.
if (s.last_session_audit_summary && typeof s.last_session_audit_summary === 'object') {
  const sum = s.last_session_audit_summary;
  const parts = [];
  if (typeof sum.ghost_closure_triggers === 'number' && sum.ghost_closure_triggers > 0) {
    parts.push(`${sum.ghost_closure_triggers} ghost-closure trigger${sum.ghost_closure_triggers === 1 ? '' : 's'}`);
  }
  if (typeof sum.bypasses === 'number' && sum.bypasses > 0) {
    parts.push(`${sum.bypasses} BRE bypass${sum.bypasses === 1 ? '' : 'es'}`);
  }
  if (typeof sum.suitability_violations === 'number' && sum.suitability_violations > 0) {
    parts.push(`${sum.suitability_violations} suitability violation${sum.suitability_violations === 1 ? '' : 's'}`);
  }
  if (parts.length > 0) {
    lines.push(`[ido4dev] Last session AI audit: ${parts.join(', ')}`);
  }
}

if (lines.length > 0) {
  console.log(lines.join('\n'));
}

process.exit(0);
