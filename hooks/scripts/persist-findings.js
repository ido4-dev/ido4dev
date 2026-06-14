#!/usr/bin/env node
// persist-findings.js — the deterministic write path for PM audit findings (A2).
//
// The PM agent gathers facts + a human note per audited unit, writes them to an
// observations JSON, and invokes this script. THIS code classifies (category +
// severity, via finding-classifier) and persists — the agent never authors a
// category. Restores §3.1 to the audit layer; a mislabel is structurally
// impossible because the agent doesn't make the classification call.
//
// Usage:  node persist-findings.js <observations.json>
//   observations.json: an array of observations (see docs/audit-finding-
//   derivation-design.md §2). Each may include a `note` (human narrative) and,
//   for closures, an `epic`/`scope` for id composition.
//
// Writes to the project-scoped state file (same resolution as the hooks).

'use strict';

const fs = require('fs');
const path = require('path');
const state = require('../lib/state.js');
const { classify, classifySpecOrphanRate } = require('../lib/finding-classifier.js');

const FINDINGS_CAP = 20;

function fail(msg) { process.stderr.write(`persist-findings: ${msg}\n`); process.exit(1); }

const obsPath = process.argv[2];
if (!obsPath) fail('usage: persist-findings.js <observations.json>');
if (!fs.existsSync(obsPath)) fail(`observations file not found: ${obsPath}`);

let observations;
try { observations = JSON.parse(fs.readFileSync(obsPath, 'utf8')); }
catch (e) { fail(`observations not valid JSON: ${e.message}`); }
if (!Array.isArray(observations)) fail('observations must be a JSON array');

const dataDir = process.env.CLAUDE_PLUGIN_DATA;
if (!dataDir) fail('CLAUDE_PLUGIN_DATA not set');
const stateFile = state.resolveStateFile(dataDir); // project-scoped by cwd
const nowIso = new Date().toISOString();

// Build the deterministic finding objects from observations.
const built = [];
function pushFinding({ category, severity }, obs) {
  const actorId = obs.actor_id || 'unknown';
  const scope = obs.scope || obs.epic || (obs.issue != null ? `issue-${obs.issue}` : 'session');
  built.push({
    id: `audit:${category}:${actorId}:${scope}`,
    source: 'pm-agent',
    category,            // ← from the classifier, never from the agent
    severity,            // ← from the classifier
    title: obs.note ? truncate(obs.note, 120) : `${category} — ${actorId}`,
    summary: obs.note || `${category} on ${scope} by ${actorId}`,
    actor_type: obs.actor_type || 'ai-agent',
    actor_id: actorId,
    first_seen: nowIso,
    last_seen: nowIso,
    resolved: false,
    resolved_at: null,
    evidence: { facts: obs },   // the facts the category was derived from — self-justifying + auditable
  });
}

for (const obs of observations) {
  for (const cat of classify(obs)) pushFinding(cat, obs);
}
// Rate-based spec_orphan across closures (one finding, not per-closure noise).
const specOrphan = classifySpecOrphanRate(observations);
if (specOrphan) {
  pushFinding(specOrphan, { actor_id: 'ai-agents', scope: 'sprint', note: `Spec-orphan rate ${(specOrphan.rate * 100).toFixed(0)}% across AI closures — spec contract being bypassed` });
}

function truncate(s, n) { return String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s); }

// Persist: read-then-mutate, dedup/update by id, FIFO cap. Deterministic write.
let persisted = 0, updated = 0;
try {
  state.update(stateFile, (s) => {
    const findings = Array.isArray(s.open_findings) ? s.open_findings : [];
    const byId = new Map(findings.map((f) => [f.id, f]));
    for (const f of built) {
      const existing = byId.get(f.id);
      if (existing) {
        existing.last_seen = f.last_seen;
        existing.evidence = f.evidence;
        existing.resolved = false;
        existing.resolved_at = null;
        updated++;
      } else {
        byId.set(f.id, f);
        persisted++;
      }
    }
    let merged = [...byId.values()];
    if (merged.length > FINDINGS_CAP) merged = merged.slice(merged.length - FINDINGS_CAP); // FIFO evict oldest
    s.open_findings = merged;
    return s;
  });
} catch (e) { fail(`state write failed: ${e.message}`); }

process.stdout.write(
  `persisted ${persisted} new + updated ${updated} finding(s) from ${observations.length} observation(s); ` +
  `${built.length === 0 ? 'no findings — clean (silence is correct)' : built.map((f) => f.category).join(', ')}\n`
);
process.exit(0);
