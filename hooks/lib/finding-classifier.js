// Audit-finding classifier — the deterministic half of the PM audit (A2).
//
// §3.1: the LLM gathers facts and narrates; THIS CODE classifies. The agent
// never authors a category, so a category-vs-evidence mislabel (the thrice-seen
// failure) is structurally impossible. These are the AGENT.md "When to Persist"
// thresholds, moved from prose-the-LLM-applies to code-that-computes.
//
// Pure functions, no I/O, no LLM. Unit-tested like the rule-runner.

'use strict';

// Classify ONE observation → array of { category, severity } (empty = no
// finding; silence is the default for clean work).
function classify(obs) {
  if (!obs || typeof obs !== 'object') return [];
  switch (obs.kind) {
    case 'closure': return classifyClosure(obs);
    case 'bypass': return classifyBypass(obs);
    case 'epic': return classifyEpic(obs);
    default: return [];
  }
}

function classifyClosure(o) {
  const out = [];
  // suitability_drift is independent of closure shape.
  if (o.ai_did_work_then_marked_human_only === true) {
    out.push({ category: 'suitability_drift', severity: 'error' });
  }
  // Only terminal (actually-closed) work is audited for closure quality.
  if (o.terminal !== true) return out;

  if (o.pr_found !== true) {
    // Closed with no PR → ghost closure. (Mutually exclusive with rubber_stamp.)
    out.push({ category: 'ghost_closure', severity: 'error' });
  } else {
    // Closed with a PR but no approving review → rubber stamp.
    if (numOr(o.approving_reviews, 0) === 0) {
      out.push({ category: 'rubber_stamp', severity: 'error' });
    }
    // Thin PR description (independent of review state).
    if (numOr(o.pr_body_len, 0) < 200 || numOr(o.pr_ref_count, 0) === 0) {
      out.push({ category: 'shallow_pr', severity: 'warning' });
    }
  }
  // No comment trail of any kind → reasoning not auditable.
  if (numOr(o.comment_count, 0) === 0) {
    out.push({ category: 'silent_closure', severity: 'warning' });
  }
  return out;
}

function classifyBypass(o) {
  // Per-actor aggregate (the observation carries this actor's attempt count).
  return numOr(o.attempts, 0) >= 3 ? [{ category: 'bypass_pattern', severity: 'error' }] : [];
}

function classifyEpic(o) {
  return numOr(o.distinct_ai_actors, 0) > 1 ? [{ category: 'actor_fragmentation', severity: 'info' }] : [];
}

// spec_orphan is rate-based, NOT per-closure: a single off-spec closure is
// normal; only a high rate signals the spec contract is being bypassed. Compute
// over all closure observations. Returns one {category, severity, rate} or null.
function classifySpecOrphanRate(closures, { minClosures = 3, threshold = 0.30 } = {}) {
  const terminal = (closures || []).filter((c) => c && c.kind === 'closure' && c.terminal === true);
  if (terminal.length < minClosures) return null;
  const orphans = terminal.filter((c) => c.lineage_ref === null || c.lineage_ref === undefined).length;
  const rate = orphans / terminal.length;
  return rate > threshold ? { category: 'spec_orphan', severity: 'info', rate } : null;
}

function numOr(v, d) { return typeof v === 'number' && !Number.isNaN(v) ? v : d; }

const VALID_CATEGORIES = [
  'ghost_closure', 'rubber_stamp', 'shallow_pr', 'silent_closure',
  'spec_orphan', 'bypass_pattern', 'suitability_drift', 'actor_fragmentation',
];

module.exports = { classify, classifySpecOrphanRate, VALID_CATEGORIES };
