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

check('double-brace HTML-escapes (default Mustache) — documents the behavior so rule files choose triple where needed', () => {
  const out = runner.renderString('{{ v }}', { v: 'Wave "2" & <x>' });
  // If this ever stops HTML-escaping, our rule files using triple-brace
  // become unnecessary and we should update the design doc. The regression
  // signal here is that the test fails — intentional tripwire.
  assertEq(out, 'Wave &quot;2&quot; &amp; &lt;x&gt;', 'default double-brace behavior');
});

check('triple-brace renders raw content (no HTML-escape) — the pattern all rule files use for prose fields', () => {
  const out = runner.renderString('{{{ v }}}', { v: 'Wave "2" & <x>' });
  assertEq(out, 'Wave "2" & <x>', 'triple-brace preserves raw');
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

check('escalate_to surfaces in result.escalate (advisory — no mode field)', () => {
  const file = rf([
    { id: 'A', when: 'true', emit: { title: 'A' }, escalate_to: 'project-manager' },
  ]);
  const res = runner.evaluate({ ruleFile: file, event: ev({}, {}), profile: null, profileValues: {}, state: emptyState(), now: Date.now() });
  assertEq(res.escalate.length, 1, 'one escalation');
  assertEq(res.escalate[0].agent, 'project-manager', 'agent');
  assertTrue(res.escalate[0].rule_id === 'A', 'rule_id carried');
  assertTrue(!('mode' in res.escalate[0]), 'no mode field — advisory-only per Stage 7');
});

check('validateRuleFile rejects legacy escalate_mode field with a clear error', () => {
  try {
    runner.validateRuleFile({
      rules: [{ id: 'A', when: 'true', escalate_to: 'pm', escalate_mode: 'direct' }],
    }, 'mem');
    throw new Error('should have thrown');
  } catch (e) { assertTrue(/escalate_mode/.test(e.message), `error message mentions escalate_mode: ${e.message}`); }
});

check('formatHookResponse emits strong governance-signal recommendation for escalate_to', () => {
  const result = {
    findings: [{ rule_id: 'A', severity: 'warning', title: 'T' }],
    escalate: [{ rule_id: 'A', agent: 'project-manager' }],
  };
  const resp = runner.formatHookResponse(ev({}, {}), result);
  assertTrue(resp.hookSpecificOutput.additionalContext.includes('/agents project-manager'), 'agent reference included');
  assertTrue(resp.hookSpecificOutput.additionalContext.includes('Governance signal'), 'signal prefix included');
  assertTrue(resp.hookSpecificOutput.additionalContext.includes('A'), 'rule_id surfaces');
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

check('coerce type-checks critical fields and preserves unknown top-level fields', () => {
  // Unknown top-level fields (like last_assignments added in Stage 4) are
  // preserved unchanged — load-bearing for post_evaluation.persist rules that
  // introduce new state keys. Critical fields still get type-coerced.
  const s = state.coerce({
    last_compliance: { grade: 'A' },
    last_rule_fires: ['wrong type'],     // array should be reset
    open_findings: 'also wrong',         // string should be reset
    last_assignments: { 42: 'Wave 1' },  // unknown field — preserved
    some_future_field: { arbitrary: true }, // also preserved
  });
  assertEq(s.last_compliance.grade, 'A', 'compliance kept');
  assertEq(s.last_rule_fires, {}, 'array last_rule_fires reset');
  assertEq(s.open_findings, [], 'non-array open_findings reset');
  assertEq(s.last_assignments, { 42: 'Wave 1' }, 'unknown field preserved');
  assertEq(s.some_future_field, { arbitrary: true }, 'any unknown field preserved');
  assertEq(s.version, 1, 'schema version stamped');
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
console.log('\n▸ evalExpr — non-coerced expression evaluation');

check('evalExpr returns raw object value', () => {
  const r = runner.evalExpr('({ grade: tool_response.grade, score: 82 })', {
    tool_response: { grade: 'B' },
  });
  assertEq(r.value, { grade: 'B', score: 82 }, 'raw object preserved');
});

check('evalExpr returns number values without boolean coercion', () => {
  const r = runner.evalExpr('tool_response.count * 2', { tool_response: { count: 5 } });
  assertEq(r.value, 10, 'number preserved');
});

check('evalExpr returns undefined + error on syntax error', () => {
  const r = runner.evalExpr('not ((valid js', {});
  assertTrue(r.error, 'error present');
  assertEq(r.value, undefined, 'value is undefined');
});

check('evalExpr now_iso / now_ms helpers available', () => {
  const ctx = { now_ms: 1700000000000, now_iso: '2023-11-14T22:13:20.000Z' };
  const r = runner.evalExpr('now_iso', ctx);
  assertEq(r.value, '2023-11-14T22:13:20.000Z', 'now_iso passed through');
});

// ───────────────────────────────────────────────────────────────
console.log('\n▸ post_evaluation.persist — stateful rule support');

check('persist expression result lands in stateMutations under the key', () => {
  const ruleFile = {
    version: 1,
    event: 'PostToolUse',
    matcher: 'test',
    hit_policy: 'collect',
    rules: [],
    post_evaluation: {
      persist: {
        last_compliance: '({ grade: tool_response.grade, score: tool_response.score })',
      },
    },
  };
  const res = runner.evaluate({
    ruleFile,
    event: { tool_input: {}, tool_response: { grade: 'B', score: 82 } },
    profile: null,
    profileValues: {},
    state: emptyState(),
    now: Date.now(),
  });
  assertEq(res.stateMutations.last_compliance, { grade: 'B', score: 82 }, 'persisted shape');
});

check('persist expression errors log warning, do not crash evaluation, skip that key', () => {
  const ruleFile = rf([], { hit_policy: 'collect' });
  ruleFile.post_evaluation = {
    persist: {
      bad: 'tool_response.nonexistent.deep.path',
      good: '({ ok: true })',
    },
  };
  const res = runner.evaluate({
    ruleFile,
    event: ev({}, {}),
    profile: null, profileValues: {}, state: emptyState(), now: Date.now(),
  });
  assertTrue(!('bad' in res.stateMutations), 'errored key skipped');
  assertEq(res.stateMutations.good, { ok: true }, 'good key still persisted');
});

check('persist expression returning undefined is a no-op (no state write)', () => {
  const ruleFile = rf([], { hit_policy: 'collect' });
  ruleFile.post_evaluation = {
    persist: {
      last_compliance: 'undefined',  // explicit undefined
    },
  };
  const res = runner.evaluate({
    ruleFile,
    event: ev({}, {}),
    profile: null, profileValues: {}, state: emptyState(), now: Date.now(),
  });
  assertTrue(!('last_compliance' in res.stateMutations), 'undefined not written');
});

check('persist can reference state.* to do stateful diffs inside the expression', () => {
  const ruleFile = rf([], { hit_policy: 'collect' });
  ruleFile.post_evaluation = {
    persist: {
      // Imagine: a rule that tracks prior-grade as well as current
      last_compliance: '({ grade: tool_response.grade, previous_grade: state.last_compliance ? state.last_compliance.grade : null })',
    },
  };
  const s = { ...emptyState(), last_compliance: { grade: 'A', score: 92 } };
  const res = runner.evaluate({
    ruleFile,
    event: ev({}, { grade: 'C' }),
    profile: null, profileValues: {}, state: s, now: Date.now(),
  });
  assertEq(res.stateMutations.last_compliance, { grade: 'C', previous_grade: 'A' }, 'stateful diff');
});

check('persist coexists with rules — both sets of mutations accumulate', () => {
  const ruleFile = rf(
    [{ id: 'R1', when: 'true', debounce_seconds: 60, emit: { title: 'fired' } }],
    { hit_policy: 'collect' },
  );
  ruleFile.post_evaluation = {
    persist: {
      last_compliance: '({ grade: tool_response.grade })',
    },
  };
  const now = Date.now();
  const res = runner.evaluate({
    ruleFile,
    event: ev({}, { grade: 'B' }),
    profile: null, profileValues: {}, state: emptyState(), now,
  });
  assertEq(res.findings.length, 1, 'rule fired');
  assertTrue(res.stateMutations.last_rule_fires['R1:*'], 'last_rule_fires written');
  assertEq(res.stateMutations.last_compliance, { grade: 'B' }, 'persist also written');
});

check('validateRuleFile rejects non-object post_evaluation', () => {
  try {
    runner.validateRuleFile({ rules: [], post_evaluation: 'not an object' }, 'mem');
    throw new Error('should have thrown');
  } catch (e) { assertTrue(/post_evaluation/.test(e.message), 'mentions post_evaluation'); }
});

check('validateRuleFile rejects non-object post_evaluation.persist', () => {
  try {
    runner.validateRuleFile({ rules: [], post_evaluation: { persist: ['bad'] } }, 'mem');
    throw new Error('should have thrown');
  } catch (e) { assertTrue(/persist/.test(e.message), 'mentions persist'); }
});

check('validateRuleFile rejects non-string persist value', () => {
  try {
    runner.validateRuleFile({ rules: [], post_evaluation: { persist: { k: 123 } } }, 'mem');
    throw new Error('should have thrown');
  } catch (e) { assertTrue(/persist/.test(e.message), 'mentions persist'); }
});

check('validateRuleFile accepts well-formed post_evaluation.persist', () => {
  runner.validateRuleFile({
    rules: [],
    post_evaluation: { persist: { last_compliance: '({ grade: tool_response.grade })' } },
  }, 'mem');
});

// ───────────────────────────────────────────────────────────────
console.log('\n▸ unwrapMcpToolResponse — live MCP CallToolResult shape');

check('unwraps {content: [{type:"text", text: <JSON string>}]} into the parsed object', () => {
  const raw = {
    content: [{ type: 'text', text: '{"success":true,"data":{"grade":"A","score":92}}' }],
  };
  const out = runner.unwrapMcpToolResponse(raw);
  assertEq(out, { success: true, data: { grade: 'A', score: 92 } }, 'unwrapped');
});

check('unwraps a bare content array (Claude Code v2.1.119 actual shape)', () => {
  const raw = [{ type: 'text', text: '{"success":true,"data":{"grade":"A","score":92}}' }];
  const out = runner.unwrapMcpToolResponse(raw);
  assertEq(out, { success: true, data: { grade: 'A', score: 92 } }, 'array-shape unwrapped');
});

check('passes through non-MCP shapes (already-parsed objects)', () => {
  const raw = { success: true, data: { grade: 'B' } };
  const out = runner.unwrapMcpToolResponse(raw);
  assertEq(out, raw, 'pass-through for direct object');
});

check('passes through if content[0].type is not "text"', () => {
  const raw = { content: [{ type: 'image', text: 'not parsed' }] };
  const out = runner.unwrapMcpToolResponse(raw);
  assertEq(out, raw, 'no unwrap when type !== text');
});

check('passes through if content array is empty', () => {
  const raw = { content: [] };
  const out = runner.unwrapMcpToolResponse(raw);
  assertEq(out, raw, 'empty content passes through');
});

check('falls back to original on malformed JSON in text', () => {
  const raw = { content: [{ type: 'text', text: '{not valid json' }] };
  const out = runner.unwrapMcpToolResponse(raw);
  assertEq(out, raw, 'malformed JSON returns original');
});

check('passes through null/undefined safely', () => {
  assertEq(runner.unwrapMcpToolResponse(null), null, 'null passes through');
  assertEq(runner.unwrapMcpToolResponse(undefined), undefined, 'undefined passes through');
});

check('evaluate() with MCP-shaped tool_response unwraps + rules see {success, data}', () => {
  const file = rf([{
    id: 'X', when: 'tool_response.data.canProceed === false',
    emit: { title: 'fired' },
  }]);
  const event = {
    hook_event_name: 'PostToolUse',
    tool_input: { issueNumber: 1 },
    tool_response: {
      content: [{ type: 'text', text: '{"success":true,"data":{"canProceed":false}}' }],
    },
  };
  const res = runner.evaluate({ ruleFile: file, event, profile: null, profileValues: {}, state: emptyState(), now: Date.now() });
  assertEq(res.findings.length, 1, 'rule fires after MCP unwrap');
});

// ───────────────────────────────────────────────────────────────
console.log('\n▸ permission_decision — PreToolUse gate support');

check('rule with permission_decision: ask surfaces in finding + formatHookResponse emits PreToolUse shape', () => {
  const file = rf([{
    id: 'G1', when: 'true', permission_decision: 'ask',
    emit: { title: 'Confirm bypass', body: 'skipValidation=true will skip BRE' },
  }]);
  file.event = 'PreToolUse';
  const res = runner.evaluate({ ruleFile: file, event: ev({}, {}), profile: null, profileValues: {}, state: emptyState(), now: Date.now() });
  assertEq(res.findings[0].permission_decision, 'ask', 'finding carries decision');
  const out = runner.formatHookResponse(ev({}, {}), res, file);
  assertEq(out.hookSpecificOutput.hookEventName, 'PreToolUse', 'hook event PreToolUse');
  assertEq(out.hookSpecificOutput.permissionDecision, 'ask', 'permissionDecision emitted');
  assertTrue(out.hookSpecificOutput.permissionDecisionReason.includes('Confirm bypass'), 'reason carries finding content');
});

check('multi-gate most-restrictive-wins: deny beats ask beats allow', () => {
  const file = rf([
    { id: 'A', when: 'true', permission_decision: 'allow', emit: { title: 'a' } },
    { id: 'B', when: 'true', permission_decision: 'ask', emit: { title: 'b' } },
    { id: 'C', when: 'true', permission_decision: 'deny', emit: { title: 'c' } },
  ]);
  file.event = 'PreToolUse';
  const res = runner.evaluate({ ruleFile: file, event: ev({}, {}), profile: null, profileValues: {}, state: emptyState(), now: Date.now() });
  const out = runner.formatHookResponse(ev({}, {}), res, file);
  assertEq(out.hookSpecificOutput.permissionDecision, 'deny', 'deny wins');
});

check('ask beats allow when deny absent', () => {
  const file = rf([
    { id: 'A', when: 'true', permission_decision: 'allow', emit: { title: 'a' } },
    { id: 'B', when: 'true', permission_decision: 'ask', emit: { title: 'b' } },
  ]);
  file.event = 'PreToolUse';
  const res = runner.evaluate({ ruleFile: file, event: ev({}, {}), profile: null, profileValues: {}, state: emptyState(), now: Date.now() });
  const out = runner.formatHookResponse(ev({}, {}), res, file);
  assertEq(out.hookSpecificOutput.permissionDecision, 'ask', 'ask wins over allow');
});

check('PostToolUse file with no permission_decision retains existing shape (regression guard)', () => {
  const file = rf([{ id: 'R', when: 'true', emit: { title: 'info' } }]);
  file.event = 'PostToolUse';
  const res = runner.evaluate({ ruleFile: file, event: ev({}, {}), profile: null, profileValues: {}, state: emptyState(), now: Date.now() });
  const out = runner.formatHookResponse(ev({}, {}), res, file);
  assertEq(out.hookSpecificOutput.hookEventName, 'PostToolUse', 'hookEventName');
  assertTrue(out.hookSpecificOutput.additionalContext.includes('info'), 'additionalContext shipped');
  assertTrue(!('permissionDecision' in out.hookSpecificOutput), 'no permissionDecision leaks into PostToolUse');
});

check('PreToolUse file with no fires returns empty response', () => {
  const file = rf([{ id: 'R', when: 'false', permission_decision: 'ask', emit: { title: 'never' } }]);
  file.event = 'PreToolUse';
  const res = runner.evaluate({ ruleFile: file, event: ev({}, {}), profile: null, profileValues: {}, state: emptyState(), now: Date.now() });
  const out = runner.formatHookResponse(ev({}, {}), res, file);
  assertEq(out, {}, 'no-op when nothing fires');
});

check('PreToolUse finding with informational rule (no permission_decision) still emits additionalContext but no decision', () => {
  const file = rf([{ id: 'INFO', when: 'true', emit: { title: 'just info' } }]);
  file.event = 'PreToolUse';
  const res = runner.evaluate({ ruleFile: file, event: ev({}, {}), profile: null, profileValues: {}, state: emptyState(), now: Date.now() });
  const out = runner.formatHookResponse(ev({}, {}), res, file);
  assertEq(out.hookSpecificOutput.hookEventName, 'PreToolUse', 'event stays PreToolUse');
  assertTrue(!('permissionDecision' in out.hookSpecificOutput), 'no decision when no rule declared one');
  assertTrue(out.hookSpecificOutput.additionalContext.includes('just info'), 'context still shipped');
});

check('validateRuleFile rejects invalid permission_decision values', () => {
  try {
    runner.validateRuleFile({ rules: [{ id: 'R', when: 'true', permission_decision: 'maybe' }] }, 'mem');
    throw new Error('should have thrown');
  } catch (e) { assertTrue(/permission_decision/.test(e.message), 'mentions permission_decision'); }
});

check('validateRuleFile rejects invalid event values', () => {
  try {
    runner.validateRuleFile({ event: 'Stop', rules: [] }, 'mem');
    throw new Error('should have thrown');
  } catch (e) { assertTrue(/event/.test(e.message), 'mentions event'); }
});

check('validateRuleFile accepts PreToolUse event + valid permission_decision', () => {
  runner.validateRuleFile({
    event: 'PreToolUse',
    rules: [{ id: 'R', when: 'true', permission_decision: 'ask', emit: { title: 'ok' } }],
  }, 'mem');
});

check('mostRestrictivePermission returns null for empty input', () => {
  assertEq(runner.mostRestrictivePermission([]), null, 'null on empty');
  assertEq(runner.mostRestrictivePermission([null, undefined]), null, 'null on all-null');
});

check('mostRestrictivePermission picks the strictest', () => {
  assertEq(runner.mostRestrictivePermission(['allow']), 'allow', 'allow alone');
  assertEq(runner.mostRestrictivePermission(['allow', 'ask']), 'ask', 'ask > allow');
  assertEq(runner.mostRestrictivePermission(['ask', 'deny', 'allow']), 'deny', 'deny wins');
});

// ───────────────────────────────────────────────────────────────
console.log('\n▸ Evaluation context helpers — now_ms / now_iso');

check('now_ms / now_iso are available inside when: expressions', () => {
  const ruleFile = rf([{ id: 'R', when: 'typeof now_ms === "number" && typeof now_iso === "string"', emit: { title: 'ok' } }]);
  const res = runner.evaluate({
    ruleFile,
    event: ev({}, {}),
    profile: null, profileValues: {}, state: emptyState(), now: 1700000000000,
  });
  assertEq(res.findings.length, 1, 'fired via now helpers');
});

check('now_iso is a deterministic ISO string matching now_ms', () => {
  const ruleFile = rf([{ id: 'R', when: 'now_iso === new Date(now_ms).toISOString()', emit: { title: 'ok' } }]);
  const res = runner.evaluate({
    ruleFile,
    event: ev({}, {}),
    profile: null, profileValues: {}, state: emptyState(), now: 1700000000000,
  });
  assertEq(res.findings.length, 1, 'helpers consistent');
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
