// Unit tests for the deterministic audit-finding classifier (A2).
// Facts → category/severity, with no LLM in the loop. The structural guarantee
// that replaces the prose category-discipline that drifted 3 runs running.

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const { classify, classifySpecOrphanRate } = require(join(__dirname, '..', 'hooks/lib/finding-classifier.js'));

let pass = 0, fail = 0;
function check(name, fn) { try { fn(); console.log(`  ✓ ${name}`); pass++; } catch (e) { console.log(`  ✗ ${name} — ${e.message}`); fail++; } }
const cats = (obs) => classify(obs).map((c) => c.category).sort();
function eq(a, b, m) { const A = JSON.stringify(a), B = JSON.stringify(b); if (A !== B) throw new Error(`${m}: ${A} !== ${B}`); }

console.log('▸ finding-classifier — closures');

check('clean reviewed closure → NO finding (the silence that kept failing)', () => {
  eq(cats({ kind: 'closure', terminal: true, pr_found: true, approving_reviews: 1, pr_body_len: 400, pr_ref_count: 3, comment_count: 2, lineage_ref: 'ND-01' }), [], 'clean');
});

check('closed, no PR → ghost_closure (NOT when a PR exists — the exact 3x mislabel)', () => {
  eq(cats({ kind: 'closure', terminal: true, pr_found: false, comment_count: 2 }), ['ghost_closure'], 'ghost');
});

check('a PR present can NEVER classify as ghost_closure', () => {
  const c = cats({ kind: 'closure', terminal: true, pr_found: true, approving_reviews: 1, pr_body_len: 400, pr_ref_count: 3, comment_count: 2 });
  if (c.includes('ghost_closure')) throw new Error('PR present but got ghost_closure');
});

check('closed, PR, no approving review → rubber_stamp', () => {
  eq(cats({ kind: 'closure', terminal: true, pr_found: true, approving_reviews: 0, pr_body_len: 400, pr_ref_count: 3, comment_count: 2 }), ['rubber_stamp'], 'rubber');
});

check('closed, PR, thin body → shallow_pr (co-occurs with rubber_stamp)', () => {
  eq(cats({ kind: 'closure', terminal: true, pr_found: true, approving_reviews: 0, pr_body_len: 40, pr_ref_count: 0, comment_count: 1 }), ['rubber_stamp', 'shallow_pr'], 'multi');
});

check('closed, no comments → silent_closure', () => {
  const c = cats({ kind: 'closure', terminal: true, pr_found: true, approving_reviews: 1, pr_body_len: 400, pr_ref_count: 3, comment_count: 0 });
  eq(c, ['silent_closure'], 'silent');
});

check('non-terminal closure observation → no closure-quality finding', () => {
  eq(cats({ kind: 'closure', terminal: false, pr_found: false }), [], 'non-terminal');
});

check('aiSuitability flipped to human-only after AI work → suitability_drift (even non-terminal)', () => {
  const c = cats({ kind: 'closure', terminal: false, ai_did_work_then_marked_human_only: true });
  eq(c, ['suitability_drift'], 'drift');
});

check('severity is derived: ghost/rubber/bypass=error, shallow/silent=warning, fragmentation=info', () => {
  const sev = (obs) => classify(obs).map((c) => `${c.category}:${c.severity}`).sort();
  eq(sev({ kind: 'closure', terminal: true, pr_found: false, comment_count: 1 }), ['ghost_closure:error'], 'ghost sev');
  eq(sev({ kind: 'closure', terminal: true, pr_found: true, approving_reviews: 1, pr_body_len: 10, pr_ref_count: 0, comment_count: 1 }), ['shallow_pr:warning'], 'shallow sev');
});

console.log('▸ finding-classifier — bypass & epic');

check('bypass attempts >= 3 → bypass_pattern; < 3 → nothing', () => {
  eq(cats({ kind: 'bypass', actor_id: 'agent-beta', attempts: 3 }), ['bypass_pattern'], '3 attempts');
  eq(cats({ kind: 'bypass', actor_id: 'agent-beta', attempts: 2 }), [], '2 attempts (below threshold — silence)');
});

check('epic with >1 distinct AI actor → actor_fragmentation', () => {
  eq(cats({ kind: 'epic', distinct_ai_actors: 2 }), ['actor_fragmentation'], 'frag');
  eq(cats({ kind: 'epic', distinct_ai_actors: 1 }), [], 'single actor');
});

console.log('▸ finding-classifier — spec_orphan (rate-based, not per-closure)');

check('spec_orphan fires only above the rate threshold, not per single off-spec closure', () => {
  const allOrphan = [0,1,2,3].map((i) => ({ kind: 'closure', terminal: true, lineage_ref: null, issue: i }));
  const r1 = classifySpecOrphanRate(allOrphan);
  if (!r1 || r1.category !== 'spec_orphan') throw new Error('high orphan rate should fire');
  const oneOrphan = [{ kind: 'closure', terminal: true, lineage_ref: null }, ...[1,2,3].map((i)=>({ kind:'closure', terminal:true, lineage_ref:`T-${i}` }))];
  if (classifySpecOrphanRate(oneOrphan) !== null) throw new Error('a single off-spec closure must NOT fire (1/4 = 25% < 30%)');
});

check('unknown observation kind → no finding', () => { eq(cats({ kind: 'weird' }), [], 'unknown'); eq(cats(null), [], 'null'); });

console.log(`\n  Results: ${pass} passed, ${fail} failed (${pass + fail} total)`);
console.log(fail === 0 ? '  ✓ ALL TESTS PASSED' : '  ✗ FAILURES');
process.exit(fail === 0 ? 0 : 1);
