#!/usr/bin/env node
/**
 * Rule-runner unit tests — deterministic, zero-network, zero-LLM.
 *
 * Covers the pure testable surface of hooks/lib/rule-runner.js and
 * hooks/lib/state.js. Design input: every rule-file shape and edge case
 * that Phase 3 Stages 3–7 will rely on is exercised here before any
 * consumer hooks are rewritten.
 *
 * Run: node tests/rule-runner-unit.test.mjs
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const runner = require(join(repoRoot, 'hooks/lib/rule-runner.js'));
const state = require(join(repoRoot, 'hooks/lib/state.js'));

let pass = 0;
let fail = 0;
const failures = [];

function ok(msg) { console.log(`  ✓ ${msg}`); pass++; }
function bad(msg, err) {
  console.log(`  ✗ ${msg}`);
  if (err) console.log(`      ${err.message || err}`);
  fail++;
  failures.push(msg);
}
function check(label, fn) {
  try { fn(); ok(label); } catch (e) { bad(label, e); }
}
function assertEq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
}
function assertTrue(cond, label) { if (!cond) throw new Error(label); }

// Helper: build a rule file inline.
function rf(rules, opts = {}) {
  return {
    version: 1,
    event: opts.event || 'PostToolUse',
    matcher: opts.matcher || 'test',
    hit_policy: opts.hit_policy || 'collect',
    rules,
  };
}
function ev(tool_input, tool_response, extras = {}) {
  return { hook_event_name: 'PostToolUse', tool_input, tool_response, ...extras };
}
const emptyState = () => state.emptyState();

// ───────────────────────────────────────────────────────────────
console.log('\n▸ evalWhen — expression evaluation');

check('truthy strict-equality returns true', () => {
  const r = runner.evalWhen('tool_response.canProceed === false', {
    tool_input: {}, tool_response: { canProceed: false },
  });
  assertEq(r, { value: true }, 'result');
});

check('falsy expression returns false', () => {
  const r = runner.evalWhen('tool_response.canProceed === true', {
    tool_input: {}, tool_response: { canProceed: false },
  });
  assertEq(r, { value: false }, 'result');
});

check('optional chaining on null/undefined returns false without throwing', () => {
  const r = runner.evalWhen('tool_response.metadata?.unblockedCount > 0', {
    tool_input: {}, tool_response: { metadata: null },
  });
  assertTrue(!r.error, 'should not error on null metadata');
  assertEq(r.value, false, 'value');
});

check('nullish coalescing', () => {
  const r = runner.evalWhen('(tool_response.metadata?.count ?? 0) === 0', {
    tool_input: {}, tool_response: {},
  });
  assertEq(r.value, true, 'value');
});

check('array methods work (includes)', () => {
  const r = runner.evalWhen('tool_input.tags.includes("blocked")', {
    tool_input: { tags: ['blocked', 'urgent'] }, tool_response: {},
  });
  assertEq(r.value, true, 'value');
});

check('reference to undeclared var is caught as error, value false', () => {
  const r = runner.evalWhen('nonexistent_field.x === 1', {
    tool_input: {}, tool_response: {},
  });
  assertTrue(r.error, 'should carry error');
  assertEq(r.value, false, 'value');
});

check('invalid JS syntax is caught as error', () => {
  const r = runner.evalWhen('this is not valid js!!!', {
    tool_input: {}, tool_response: {},
  });
  assertTrue(r.error, 'should carry error');
  assertEq(r.value, false, 'value');
});

check('"when" expression lifts profile_values via with()', () => {
  const r = runner.evalWhen('profile_values.wip_limit >= 5', {
    profile_values: { wip_limit: 6 }, tool_input: {}, tool_response: {},
  });
  assertEq(r.value, true, 'value');
});

// ───────────────────────────────────────────────────────────────
console.log('\n▸ renderString / renderEmit — Mustache rendering');

check('renders simple variable', () => {
  const out = runner.renderString('Hello {{ name }}', { name: 'ido4' });
  assertEq(out, 'Hello ido4', 'rendered');
});

check('missing variable renders as empty string (no throw)', () => {
  const out = runner.renderString('Hello {{ missing }}!', {});
  assertEq(out, 'Hello !', 'rendered');
});

check('section block iterates array', () => {
  const out = runner.renderString('{{#items}}<{{v}}>{{/items}}', {
    items: [{ v: 'a' }, { v: 'b' }],
  });
  assertEq(out, '<a><b>', 'rendered');
});

check('nested path works', () => {
  const out = runner.renderString('grade: {{ tool_response.grade }}', {
    tool_response: { grade: 'B' },
  });
  assertEq(out, 'grade: B', 'rendered');
});

check('renderEmit renders each string field', () => {
  const out = runner.renderEmit(
    { title: '{{ x }}', body: '{{ y }}', severity: 'warning', cta: 'static' },
    { x: 'T', y: 'B' },
  );
  assertEq(out.title, 'T', 'title');
  assertEq(out.body, 'B', 'body');
  assertEq(out.severity, 'warning', 'severity (not a string template but passed through)');
  assertEq(out.cta, 'static', 'cta');
});

check('renderEmit preserves non-string fields', () => {
  const out = runner.renderEmit({ metadata: { weight: 3 }, tags: ['a', '{{ b }}'] }, { b: 'B' });
  assertEq(out.metadata, { weight: 3 }, 'metadata');
  assertEq(out.tags, ['a', 'B'], 'tags');
});

// ───────────────────────────────────────────────────────────────
console.log('\n▸ filterByProfile');

check('rule with no profiles: field applies to every profile', () => {
  const filtered = runner.filterByProfile([{ id: 'A', when: 'true' }], 'hydro');
  assertEq(filtered.length, 1, 'should include');
});

check('rule with empty profiles: [] applies to every profile', () => {
  const filtered = runner.filterByProfile([{ id: 'A', when: 'true', profiles: [] }], 'hydro');
  assertEq(filtered.length, 1, 'should include');
});

check('rule with profiles: [hydro] included under hydro, excluded under scrum', () => {
  const rules = [{ id: 'A', when: 'true', profiles: ['hydro'] }];
  assertEq(runner.filterByProfile(rules, 'hydro').length, 1, 'hydro');
  assertEq(runner.filterByProfile(rules, 'scrum').length, 0, 'scrum');
});

check('unknown profile (null) does not filter anything out', () => {
  const rules = [{ id: 'A', when: 'true', profiles: ['hydro'] }];
  assertEq(runner.filterByProfile(rules, null).length, 1, 'null profile keeps rule');
});

// ───────────────────────────────────────────────────────────────
console.log('\n▸ Hit policies');

check('collect (default): multiple matches produce multiple findings', () => {
  const file = rf(
    [
      { id: 'A', when: 'true', emit: { title: 'A' } },
      { id: 'B', when: 'true', emit: { title: 'B' } },
    ],
    { hit_policy: 'collect' },
  );
  const res = runner.evaluate({ ruleFile: file, event: ev({}, {}), profile: null, profileValues: {}, state: emptyState(), now: Date.now() });
  assertEq(res.findings.length, 2, 'findings count');
  assertEq(res.findings.map((f) => f.rule_id), ['A', 'B'], 'order preserved');
});

check('first: short-circuits after first match', () => {
  const file = rf(
    [
      { id: 'A', when: 'true', emit: { title: 'A' } },
      { id: 'B', when: 'true', emit: { title: 'B' } },
    ],
    { hit_policy: 'first' },
  );
  const res = runner.evaluate({ ruleFile: file, event: ev({}, {}), profile: null, profileValues: {}, state: emptyState(), now: Date.now() });
  assertEq(res.findings.length, 1, 'only first');
  assertEq(res.findings[0].rule_id, 'A', 'first rule');
});

check('first: skips non-matching rules to reach the first match', () => {
  const file = rf(
    [
      { id: 'A', when: 'false', emit: { title: 'A' } },
      { id: 'B', when: 'true', emit: { title: 'B' } },
      { id: 'C', when: 'true', emit: { title: 'C' } },
    ],
    { hit_policy: 'first' },
  );
  const res = runner.evaluate({ ruleFile: file, event: ev({}, {}), profile: null, profileValues: {}, state: emptyState(), now: Date.now() });
  assertEq(res.findings.length, 1, 'only first-match');
  assertEq(res.findings[0].rule_id, 'B', 'match was B');
});

check('unique: exactly-one match OK', () => {
  const file = rf(
    [
      { id: 'A', when: 'false', emit: { title: 'A' } },
      { id: 'B', when: 'true', emit: { title: 'B' } },
    ],
    { hit_policy: 'unique' },
  );
  const res = runner.evaluate({ ruleFile: file, event: ev({}, {}), profile: null, profileValues: {}, state: emptyState(), now: Date.now() });
  assertEq(res.findings.length, 1, 'one');
});

check('unique: zero matches OK', () => {
  const file = rf(
    [{ id: 'A', when: 'false', emit: { title: 'A' } }],
    { hit_policy: 'unique' },
  );
  const res = runner.evaluate({ ruleFile: file, event: ev({}, {}), profile: null, profileValues: {}, state: emptyState(), now: Date.now() });
  assertEq(res.findings.length, 0, 'zero');
});

// ───────────────────────────────────────────────────────────────
console.log('\n▸ Escalation wiring');

check('escalate_to surfaces in result.escalate with default mode additionalContext', () => {
  const file = rf([
    { id: 'A', when: 'true', emit: { title: 'A' }, escalate_to: 'project-manager' },
  ]);
  const res = runner.evaluate({ ruleFile: file, event: ev({}, {}), profile: null, profileValues: {}, state: emptyState(), now: Date.now() });
  assertEq(res.escalate.length, 1, 'one escalation');
  assertEq(res.escalate[0].agent, 'project-manager', 'agent');
  assertEq(res.escalate[0].mode, 'additionalContext', 'default mode');
});

check('escalate_mode: direct preserved through result', () => {
  const file = rf([
    { id: 'A', when: 'true', emit: { title: 'A' }, escalate_to: 'pm', escalate_mode: 'direct' },
  ]);
  const res = runner.evaluate({ ruleFile: file, event: ev({}, {}), profile: null, profileValues: {}, state: emptyState(), now: Date.now() });
  assertEq(res.escalate[0].mode, 'direct', 'direct mode preserved');
});

check('formatHookResponse suggests /agents for additionalContext mode', () => {
  const result = {
    findings: [{ rule_id: 'A', severity: 'warning', title: 'T' }],
    escalate: [{ rule_id: 'A', agent: 'project-manager', mode: 'additionalContext' }],
  };
  const resp = runner.formatHookResponse(ev({}, {}), result);
  assertTrue(resp.hookSpecificOutput.additionalContext.includes('/agents project-manager'), 'suggestion included');
});

check('formatHookResponse with no findings and no escalate returns empty object', () => {
  const resp = runner.formatHookResponse(ev({}, {}), { findings: [], escalate: [] });
  assertEq(resp, {}, 'empty response');
});

// ───────────────────────────────────────────────────────────────
console.log('▸ Debounce');

check('rule with no debounce_seconds always fires', () => {
  const file = rf([{ id: 'A', when: 'true', emit: { title: 'A' } }]);
  const res = runner.evaluate({ ruleFile: file, event: ev({}, {}), profile: null, profileValues: {}, state: emptyState(), now: Date.now() });
  assertEq(res.findings.length, 1, 'fired');
});

check('rule within debounce window is suppressed', () => {
  const file = rf([{ id: 'A', when: 'true', debounce_seconds: 60, emit: { title: 'A' } }]);
  const now = new Date('2026-04-21T12:00:00Z').getTime();
  const recent = new Date(now - 30 * 1000).toISOString(); // 30s ago
  const s = { ...emptyState(), last_rule_fires: { 'A:*': recent } };
  const res = runner.evaluate({ ruleFile: file, event: ev({}, {}), profile: null, profileValues: {}, state: s, now });
  assertEq(res.findings.length, 0, 'suppressed');
});

check('rule outside debounce window re-fires', () => {
  const file = rf([{ id: 'A', when: 'true', debounce_seconds: 60, emit: { title: 'A' } }]);
  const now = new Date('2026-04-21T12:00:00Z').getTime();
  const long_ago = new Date(now - 120 * 1000).toISOString(); // 2m ago
  const s = { ...emptyState(), last_rule_fires: { 'A:*': long_ago } };
  const res = runner.evaluate({ ruleFile: file, event: ev({}, {}), profile: null, profileValues: {}, state: s, now });
  assertEq(res.findings.length, 1, 're-fired');
  assertTrue(res.stateMutations.last_rule_fires['A:*'], 'timestamp recorded');
});

check('debounce_target renders mustache; target-specific key', () => {
  const file = rf([
    { id: 'A', when: 'true', debounce_seconds: 60, debounce_target: '{{ tool_input.issue }}', emit: { title: 'A' } },
  ]);
  const now = new Date('2026-04-21T12:00:00Z').getTime();
  const recent = new Date(now - 30 * 1000).toISOString();
  const s = { ...emptyState(), last_rule_fires: { 'A:42': recent } };
  // issue=42 → debounced
  const resA = runner.evaluate({ ruleFile: file, event: ev({ issue: 42 }, {}), profile: null, profileValues: {}, state: s, now });
  assertEq(resA.findings.length, 0, 'same target debounced');
  // issue=43 → not debounced (different target)
  const resB = runner.evaluate({ ruleFile: file, event: ev({ issue: 43 }, {}), profile: null, profileValues: {}, state: s, now });
  assertEq(resB.findings.length, 1, 'different target fires');
});

// ───────────────────────────────────────────────────────────────
console.log('\n▸ validateRuleFile — schema errors');

check('rejects missing rules array', () => {
  try { runner.validateRuleFile({}, 'mem'); throw new Error('should have thrown'); }
  catch (e) { assertTrue(/rules/.test(e.message), `error message mentions "rules": ${e.message}`); }
});

check('rejects duplicate rule ids', () => {
  try {
    runner.validateRuleFile({ rules: [
      { id: 'A', when: 'true' },
      { id: 'A', when: 'false' },
    ] }, 'mem');
    throw new Error('should have thrown');
  } catch (e) { assertTrue(/duplicate/.test(e.message), 'mentions duplicate'); }
});

check('rejects missing when', () => {
  try {
    runner.validateRuleFile({ rules: [{ id: 'A' }] }, 'mem');
    throw new Error('should have thrown');
  } catch (e) { assertTrue(/when/.test(e.message), 'mentions when'); }
});

check('rejects invalid hit_policy', () => {
  try {
    runner.validateRuleFile({ hit_policy: 'last', rules: [] }, 'mem');
    throw new Error('should have thrown');
  } catch (e) { assertTrue(/hit_policy/.test(e.message), 'mentions hit_policy'); }
});

check('rejects negative debounce_seconds', () => {
  try {
    runner.validateRuleFile({ rules: [{ id: 'A', when: 'true', debounce_seconds: -1 }] }, 'mem');
    throw new Error('should have thrown');
  } catch (e) { assertTrue(/debounce/.test(e.message), 'mentions debounce'); }
});

check('rejects invalid escalate_mode', () => {
  try {
    runner.validateRuleFile({ rules: [{ id: 'A', when: 'true', escalate_mode: 'yolo' }] }, 'mem');
    throw new Error('should have thrown');
  } catch (e) { assertTrue(/escalate_mode/.test(e.message), 'mentions escalate_mode'); }
});

check('accepts a well-formed rule file', () => {
  runner.validateRuleFile({
    version: 1,
    hit_policy: 'collect',
    rules: [{ id: 'A', when: 'tool_response.x === 1', profiles: ['hydro'], emit: { title: 'A' }, escalate_to: 'pm' }],
  }, 'mem');
});

// ───────────────────────────────────────────────────────────────
console.log('\n▸ loadRuleFile — YAML parse path');

const yamlTmp = mkdtempSync(join(tmpdir(), 'rules-'));

check('parses a YAML rule file written to disk', () => {
  const p = join(yamlTmp, 'x.rules.yaml');
  writeFileSync(p, [
    'version: 1',
    'event: PostToolUse',
    'matcher: test',
    'hit_policy: collect',
    'rules:',
    '  - id: X001',
    '    when: "tool_response.canProceed === false"',
    '    profiles: [hydro, scrum]',
    '    severity: warning',
    '    emit:',
    '      title: "Blocked on {{ tool_input.issue }}"',
    '      body: |',
    '        Multi-line',
    '        body text.',
    '',
  ].join('\n'));
  const doc = runner.loadRuleFile(p);
  assertEq(doc.rules.length, 1, 'one rule');
  assertEq(doc.rules[0].id, 'X001', 'id');
  assertEq(doc.rules[0].profiles, ['hydro', 'scrum'], 'profiles');
  assertTrue(doc.rules[0].emit.body.includes('Multi-line'), 'literal block');
});

check('propagates YAML parse errors with file path', () => {
  const p = join(yamlTmp, 'bad.rules.yaml');
  writeFileSync(p, 'rules:\n  - id: X\n    when: [malformed');
  try { runner.loadRuleFile(p); throw new Error('should have thrown'); }
  catch (e) { assertTrue(e.message.includes('bad.rules.yaml') || /YAML/.test(e.message), `message: ${e.message}`); }
});

rmSync(yamlTmp, { recursive: true, force: true });

// ───────────────────────────────────────────────────────────────
console.log('\n▸ state.js — read/write/coerce');

const stateTmp = mkdtempSync(join(tmpdir(), 'state-'));

check('read from nonexistent file returns emptyState', () => {
  const s = state.read(join(stateTmp, 'absent.json'));
  assertEq(s.last_compliance, null, 'compliance');
  assertEq(s.last_rule_fires, {}, 'fires');
  assertEq(s.open_findings, [], 'findings');
  assertEq(s.version, 1, 'version');
});

check('write and read round-trip preserves known fields', () => {
  const p = join(stateTmp, 'rt.json');
  state.write(p, {
    last_compliance: { grade: 'B', score: 82 },
    last_rule_fires: { 'A:1': '2026-04-21T12:00:00Z' },
    open_findings: [{ rule_id: 'A', title: 'x' }],
  });
  const s = state.read(p);
  assertEq(s.last_compliance.grade, 'B', 'grade');
  assertEq(s.last_rule_fires['A:1'], '2026-04-21T12:00:00Z', 'fires');
  assertEq(s.open_findings.length, 1, 'findings');
});

check('read from corrupt file does not throw, returns emptyState', () => {
  const p = join(stateTmp, 'corrupt.json');
  writeFileSync(p, '{not valid json');
  const s = state.read(p);
  assertEq(s.last_compliance, null, 'reset to empty');
});

check('coerce preserves valid fields and drops wrong types', () => {
  const s = state.coerce({
    last_compliance: { grade: 'A' },
    last_rule_fires: ['wrong type'],  // array should be rejected
    open_findings: 'also wrong',      // string should be rejected
    random_extra: 'ignored',
  });
  assertEq(s.last_compliance.grade, 'A', 'compliance kept');
  assertEq(s.last_rule_fires, {}, 'array last_rule_fires reset');
  assertEq(s.open_findings, [], 'non-array open_findings reset');
  assertTrue(!('random_extra' in s), 'unknown field dropped');
});

check('update applies mutator and stamps updated_at', () => {
  const p = join(stateTmp, 'upd.json');
  state.update(p, (s) => { s.last_compliance = { grade: 'B' }; return s; });
  const s = state.read(p);
  assertEq(s.last_compliance.grade, 'B', 'mutated');
  assertTrue(typeof s.updated_at === 'string' && s.updated_at.length > 0, 'updated_at stamped');
});

check('write is atomic — no .tmp left behind on success', () => {
  const p = join(stateTmp, 'atomic.json');
  state.write(p, { last_compliance: { grade: 'C' } });
  assertTrue(!existsSync(`${p}.tmp`), '.tmp removed after rename');
  assertTrue(existsSync(p), 'final file present');
});

check('write always stamps schema version 1', () => {
  const p = join(stateTmp, 'version.json');
  state.write(p, { last_compliance: { grade: 'D' } });
  const raw = JSON.parse(readFileSync(p, 'utf8'));
  assertEq(raw.version, 1, 'version field');
});

rmSync(stateTmp, { recursive: true, force: true });

// ───────────────────────────────────────────────────────────────
console.log('\n▸ Full evaluate — integration through the surface');

check('BRE blocked: templated finding with tool_response fields rendered', () => {
  const file = rf([{
    id: 'VT001',
    when: 'tool_response.canProceed === false && tool_input.dryRun !== true',
    profiles: ['hydro', 'scrum', 'shapeup'],
    severity: 'warning',
    emit: {
      title: 'Blocked: {{ tool_input.transition }} on #{{ tool_input.issue }}',
      body: 'Reason: {{ tool_response.reason }}',
      cta: 'Review with /mcp__plugin_ido4dev_ido4__compliance',
    },
  }], { matcher: 'validate_transition' });
  const event = ev(
    { issue: 42, transition: 'approve', dryRun: false },
    { canProceed: false, reason: 'State gate: expected IN_REVIEW' },
  );
  const res = runner.evaluate({ ruleFile: file, event, profile: 'hydro', profileValues: {}, state: emptyState(), now: Date.now() });
  assertEq(res.findings.length, 1, 'one finding');
  assertEq(res.findings[0].title, 'Blocked: approve on #42', 'title rendered');
  assertEq(res.findings[0].body, 'Reason: State gate: expected IN_REVIEW', 'body rendered');
  assertEq(res.findings[0].severity, 'warning', 'severity');
});

check('dry run suppresses VT001 — when expression excludes it', () => {
  const file = rf([{
    id: 'VT001',
    when: 'tool_response.canProceed === false && tool_input.dryRun !== true',
    profiles: ['hydro'],
    emit: { title: 'x' },
  }]);
  const event = ev({ issue: 42, dryRun: true }, { canProceed: false });
  const res = runner.evaluate({ ruleFile: file, event, profile: 'hydro', profileValues: {}, state: emptyState(), now: Date.now() });
  assertEq(res.findings.length, 0, 'none');
});

check('profile filtering: scrum-only rule does not fire under hydro', () => {
  const file = rf([{ id: 'S001', when: 'true', profiles: ['scrum'], emit: { title: 'x' } }]);
  const res = runner.evaluate({ ruleFile: file, event: ev({}, {}), profile: 'hydro', profileValues: {}, state: emptyState(), now: Date.now() });
  assertEq(res.findings.length, 0, 'none');
});

check('profile values accessible via profile_values.* in when expressions', () => {
  const file = rf([{
    id: 'WIP',
    when: 'tool_response.open > profile_values.wip_limit',
    profiles: ['hydro'],
    emit: { title: 'Over WIP' },
  }]);
  const event = ev({}, { open: 7 });
  const res = runner.evaluate({
    ruleFile: file, event, profile: 'hydro', profileValues: { wip_limit: 5 }, state: emptyState(), now: Date.now(),
  });
  assertEq(res.findings.length, 1, 'fired');
});

check('runtime error in one rule does not halt evaluation of others', () => {
  const file = rf([
    { id: 'BAD', when: 'tool_response.x.y.z === 1', emit: { title: 'bad' } },
    { id: 'GOOD', when: 'tool_response.marker === true', emit: { title: 'good' } },
  ]);
  const event = ev({}, { marker: true });
  const res = runner.evaluate({ ruleFile: file, event, profile: null, profileValues: {}, state: emptyState(), now: Date.now() });
  assertEq(res.findings.length, 1, 'good still fires');
  assertEq(res.findings[0].rule_id, 'GOOD', 'good rule');
});

// ───────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════');
const total = pass + fail;
console.log(`  Results: ${pass} passed, ${fail} failed (${total} total)`);
if (fail === 0) {
  console.log('  ✓ ALL TESTS PASSED');
  process.exit(0);
} else {
  console.log('  ✗ FAILURES:');
  for (const f of failures) console.log(`    - ${f}`);
  process.exit(1);
}
