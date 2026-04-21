#!/usr/bin/env node
/**
 * Rule-file integration tests.
 *
 * Walks every hooks/rules/*.rules.yaml, loads its sibling *.test.yaml,
 * runs each case through hooks/lib/rule-runner.js evaluate(), and asserts:
 *   - fired: exact set of rule IDs that fired
 *   - severity: severity of the (first) finding, if asserted
 *   - title_contains / body_contains / cta_contains: substring checks
 *   - any additional field-level checks we add over time
 *
 * Deterministic: zero network, zero LLM, bounded by fixture count.
 *
 * Run: node tests/rule-file-integration.test.mjs
 */

import { createRequire } from 'node:module';
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const yaml = require(join(repoRoot, 'hooks/lib/vendored/yaml.js'));
const runner = require(join(repoRoot, 'hooks/lib/rule-runner.js'));

let pass = 0;
let fail = 0;
const failures = [];

function ok(msg) { console.log(`  ✓ ${msg}`); pass++; }
function bad(msg, err) {
  console.log(`  ✗ ${msg}`);
  if (err) console.log(`      ${err}`);
  fail++;
  failures.push(msg);
}

function assertArrayEq(actual, expected, label) {
  const a = [...actual].sort();
  const e = [...expected].sort();
  if (a.length !== e.length || a.some((v, i) => v !== e[i])) {
    throw new Error(`${label}: expected [${e.join(',')}], got [${a.join(',')}]`);
  }
}

// Shallow-check that `actual` contains every key/value from `expected` at
// each level. Used for `state_after_merge` assertions — we don't assert
// EXACT state equality, just that the expected fields match. Primitive
// values compared with ===; arrays compared JSON-stringified; objects
// compared recursively.
function assertContains(actual, expected, label) {
  if (expected === null || typeof expected !== 'object' || Array.isArray(expected)) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
    return;
  }
  if (actual === null || typeof actual !== 'object' || Array.isArray(actual)) {
    throw new Error(`${label}: expected object, got ${JSON.stringify(actual)}`);
  }
  for (const k of Object.keys(expected)) {
    assertContains(actual[k], expected[k], `${label}.${k}`);
  }
}

// Apply the runner's stateMutations to a state object, mirroring the
// runFromStdin write semantics: last_rule_fires merges, other keys overwrite.
function applyStateMutations(stateIn, mutations) {
  const out = { ...stateIn };
  if (mutations.last_rule_fires) {
    out.last_rule_fires = { ...(stateIn.last_rule_fires || {}), ...mutations.last_rule_fires };
  }
  for (const k of Object.keys(mutations)) {
    if (k === 'last_rule_fires') continue;
    out[k] = mutations[k];
  }
  return out;
}

function runCase(rulesDir, testCase, ruleFile) {
  const name = testCase.name || '(unnamed)';
  try {
    const event = {
      hook_event_name: 'PostToolUse',
      tool_input: testCase.input && testCase.input.tool_input ? testCase.input.tool_input : {},
      tool_response: testCase.input && testCase.input.tool_response ? testCase.input.tool_response : {},
      tool_name: (testCase.input && testCase.input.tool_name) || undefined,
    };

    // state_before lets a fixture seed prior-session state (e.g., a grade baseline).
    const initialState = {
      version: 1,
      last_compliance: null,
      last_rule_fires: {},
      open_findings: [],
      ...(testCase.state_before || {}),
    };

    const result = runner.evaluate({
      ruleFile,
      event,
      profile: testCase.profile || null,
      profileValues: testCase.profile_values || {},
      state: initialState,
      now: testCase.now_ms || Date.parse('2026-04-21T12:00:00Z'),
    });

    const firedIds = result.findings.map((f) => f.rule_id);
    const expected = testCase.expect || {};

    if (Array.isArray(expected.fired)) {
      assertArrayEq(firedIds, expected.fired, 'fired rule IDs');
    }

    // For assertions on content of findings, scope to the first finding
    // if multiple fired (most fixtures expect a single finding anyway).
    const firstFinding = result.findings[0];

    if (expected.severity !== undefined) {
      if (!firstFinding) throw new Error(`expected severity "${expected.severity}" but no findings fired`);
      if (firstFinding.severity !== expected.severity) {
        throw new Error(`severity: expected "${expected.severity}", got "${firstFinding.severity}"`);
      }
    }

    const substrChecks = [
      ['title_contains', 'title'],
      ['body_contains', 'body'],
      ['cta_contains', 'cta'],
    ];
    for (const [expKey, fieldKey] of substrChecks) {
      if (typeof expected[expKey] === 'string') {
        if (!firstFinding) throw new Error(`expected ${fieldKey} to contain "${expected[expKey]}" but no findings fired`);
        const val = firstFinding[fieldKey] || '';
        if (!val.includes(expected[expKey])) {
          throw new Error(`${fieldKey}: expected to contain "${expected[expKey]}", got "${val.slice(0, 120)}..."`);
        }
      }
    }

    // state_after_merge: after the runner applies stateMutations, assert the
    // state contains these fields. Partial match — fields not mentioned are
    // unchecked.
    if (expected.state_after_merge) {
      const finalState = applyStateMutations(initialState, result.stateMutations);
      assertContains(finalState, expected.state_after_merge, 'state_after_merge');
    }

    ok(name);
  } catch (e) {
    bad(name, e.message);
  }
}

function findRulesFiles() {
  const rulesDir = join(repoRoot, 'hooks/rules');
  if (!existsSync(rulesDir)) return [];
  return readdirSync(rulesDir)
    .filter((f) => f.endsWith('.rules.yaml'))
    .map((f) => join(rulesDir, f));
}

function testFileFor(rulesPath) {
  return rulesPath.replace(/\.rules\.yaml$/, '.test.yaml');
}

function loadTestFile(testPath) {
  const text = readFileSync(testPath, 'utf8');
  const doc = yaml.load(text);
  if (!doc || typeof doc !== 'object') throw new Error(`test file not an object: ${testPath}`);
  if (!Array.isArray(doc.cases)) throw new Error(`test file "cases" must be an array: ${testPath}`);
  return doc;
}

// ─────────────────────────────────────────────────────────────────
const rulesFiles = findRulesFiles();
if (rulesFiles.length === 0) {
  console.log('\nNo rule files found in hooks/rules/ — skipping integration tests.');
  process.exit(0);
}

console.log(`\nFound ${rulesFiles.length} rule file(s) in hooks/rules/\n`);

for (const rulesPath of rulesFiles) {
  const rulesBase = basename(rulesPath);
  const testPath = testFileFor(rulesPath);

  console.log(`▸ ${rulesBase}`);

  if (!existsSync(testPath)) {
    bad(`${rulesBase}: sibling test file missing (${basename(testPath)})`);
    continue;
  }

  let ruleFile;
  try {
    ruleFile = runner.loadRuleFile(rulesPath);
  } catch (e) {
    bad(`${rulesBase}: rule file failed to load: ${e.message}`);
    continue;
  }

  let testDoc;
  try {
    testDoc = loadTestFile(testPath);
  } catch (e) {
    bad(`${rulesBase}: test file failed to load: ${e.message}`);
    continue;
  }

  // Sanity: every rule in the rules file has at least one fixture case
  // that asserts it fires. Catches drift where a rule lands with no test.
  const ruleIds = new Set(ruleFile.rules.map((r) => r.id));
  const assertedIds = new Set();
  for (const c of testDoc.cases || []) {
    if (c.expect && Array.isArray(c.expect.fired)) {
      for (const id of c.expect.fired) assertedIds.add(id);
    }
  }
  const uncovered = [...ruleIds].filter((id) => !assertedIds.has(id));
  if (uncovered.length > 0) {
    bad(`${rulesBase}: rule(s) have no fixture asserting they fire: ${uncovered.join(', ')}`);
  } else {
    ok(`${rulesBase}: every rule has ≥1 fixture asserting it fires`);
  }

  for (const tc of testDoc.cases || []) {
    runCase(rulesPath, tc, ruleFile);
  }

  console.log('');
}

console.log('═══════════════════════════════════════════');
const total = pass + fail;
console.log(`  Results: ${pass} passed, ${fail} failed (${total} total)`);
if (fail === 0) {
  console.log('  ✓ ALL INTEGRATION TESTS PASSED');
  process.exit(0);
} else {
  console.log('  ✗ FAILURES:');
  for (const f of failures) console.log(`    - ${f}`);
  process.exit(1);
}
