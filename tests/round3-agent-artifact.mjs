#!/usr/bin/env node
/**
 * Round 3 Agent Artifact — Ingestion Contract Test
 *
 * Verifies that the technical spec produced by ido4dev's decompose-tasks skill
 * (Round 3, ido4shape-cloud) flows cleanly through the installed @ido4/core
 * ingestion pipeline (parseSpec + mapSpec) for all three methodology profiles.
 *
 * This is a consumer contract test: ido4dev produces the artifact, @ido4/core
 * consumes it. When @ido4/core's parser/mapper changes, this test catches any
 * regression that would break ido4dev's real output.
 *
 * Companion test: enforcement-probes.mjs exercises the code paths Round 3's
 * artifact didn't hit (duplicates, cycles, unknown values, malformed refs).
 *
 * Ground truth reference: docs/ingestion-enforcement.md
 *
 * Run: node tests/round3-agent-artifact.mjs
 * Requires: @ido4/core installed (npm install in the plugin or node_modules)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, 'fixtures/round3-agent-artifact.md');

let pass = 0;
let fail = 0;
function ok(msg)  { console.log(`  ✓ ${msg}`); pass++; }
function bad(msg) { console.log(`  ✗ ${msg}`); fail++; }
function expect(cond, msg) { if (cond) ok(msg); else bad(msg); }

// ─── Load @ido4/core ingestion API ───

let parseSpec, mapSpec, HYDRO_PROFILE, SCRUM_PROFILE, SHAPE_UP_PROFILE;
try {
  const core = await import('@ido4/core');
  parseSpec = core.parseSpec;
  mapSpec = core.mapSpec;
  HYDRO_PROFILE = core.HYDRO_PROFILE;
  SCRUM_PROFILE = core.SCRUM_PROFILE;
  SHAPE_UP_PROFILE = core.SHAPE_UP_PROFILE;
  if (!parseSpec || !mapSpec || !HYDRO_PROFILE || !SCRUM_PROFILE || !SHAPE_UP_PROFILE) {
    console.log('  ✗ @ido4/core is missing one or more expected exports (parseSpec, mapSpec, profiles)');
    process.exit(1);
  }
} catch (e) {
  console.log(`  ✗ Cannot import @ido4/core: ${e.message}`);
  console.log('\n  Install with: npm install @ido4/core');
  process.exit(1);
}

// ─── Load and parse the fixture ───

if (!fs.existsSync(FIXTURE_PATH)) {
  console.log(`  ✗ Fixture not found at ${FIXTURE_PATH}`);
  process.exit(1);
}
const raw = fs.readFileSync(FIXTURE_PATH, 'utf-8');
const parsed = parseSpec(raw);
const allTasks = [...parsed.groups.flatMap(g => g.tasks), ...parsed.orphanTasks];
const errors = parsed.errors.filter(e => e.severity === 'error');
const warnings = parsed.errors.filter(e => e.severity === 'warning');

// ─── Parser — structural checks ───

console.log('▸ Parser — structural checks');
expect(errors.length === 0, `zero parse errors (actual: ${errors.length})`);
expect(warnings.length === 0, `zero parse warnings (actual: ${warnings.length})`);
expect(parsed.groups.length === 29, `29 capabilities (actual: ${parsed.groups.length})`);
expect(allTasks.length === 94, `94 tasks (actual: ${allTasks.length})`);
expect(parsed.orphanTasks.length === 0, `zero orphan tasks (actual: ${parsed.orphanTasks.length})`);

const seenRefs = new Set();
const dupes = [];
for (const t of allTasks) {
  if (seenRefs.has(t.ref)) dupes.push(t.ref);
  seenRefs.add(t.ref);
}
expect(dupes.length === 0, `zero duplicate refs (actual: ${dupes.length})`);

// ─── Parser — metadata completeness ───

console.log('\n▸ Parser — metadata completeness');
const missingMeta = allTasks.filter(t => !t.effort || !t.risk || !t.taskType || !t.aiSuitability);
expect(missingMeta.length === 0,
  `all 94 tasks have effort/risk/type/ai (missing: ${missingMeta.map(t => t.ref).join(', ') || 'none'})`);

// ─── Parser — content quality baseline ───

console.log('\n▸ Parser — content quality baseline');
const shortBodies = allTasks.filter(t => t.body.length < 200);
expect(shortBodies.length <= 1,
  `at most 1 task with body <200 chars (actual: ${shortBodies.length}, refs: ${shortBodies.map(t => `${t.ref}=${t.body.length}`).join(', ')})`);
if (shortBodies.length === 1) {
  expect(shortBodies[0].ref === 'PROJ-02B',
    `the one short-body task is PROJ-02B (baseline) — actual: ${shortBodies[0].ref}`);
}
const missingSuccess = allTasks.filter(t => t.successConditions.length < 2);
expect(missingSuccess.length === 0,
  `all 94 tasks have ≥2 success conditions (actual short: ${missingSuccess.length})`);

// ─── Parser — silent-loss probe ───

console.log('\n▸ Parser — silent data-loss probe');
let headingsInBodies = 0;
for (const t of allTasks) {
  for (const line of t.body.split('\n')) {
    if (/^##+\s/.test(line)) headingsInBodies++;
  }
}
expect(headingsInBodies === 0,
  `no heading-shaped lines absorbed into task bodies (found: ${headingsInBodies})`);

// ─── Mapper — Hydro profile ───

console.log('\n▸ Mapper — Hydro profile');
{
  const mapped = mapSpec(parsed, HYDRO_PROFILE);
  expect(mapped.errors.length === 0,
    `zero mapping errors (actual: ${mapped.errors.length})`);
  expect(mapped.warnings.length === 0,
    `zero mapping warnings (actual: ${mapped.warnings.length})`);
  expect(mapped.groupIssues.every(g => g.containerTypeId === 'epic'),
    `all capability containers are "epic"`);
  expect(mapped.tasks.every(t => t.request.initialStatus === 'BACKLOG'),
    `all tasks start in BACKLOG`);
  const allDefined = mapped.tasks.every(t =>
    t.request.effort !== undefined &&
    t.request.riskLevel !== undefined &&
    t.request.taskType !== undefined &&
    t.request.aiSuitability !== undefined
  );
  expect(allDefined, `no silent metadata loss (all fields defined post-map)`);
}

// ─── Mapper — Scrum profile ───

console.log('\n▸ Mapper — Scrum profile');
{
  const mapped = mapSpec(parsed, SCRUM_PROFILE);
  expect(mapped.errors.length === 0 && mapped.warnings.length === 0,
    `zero errors and warnings`);
  expect(mapped.groupIssues.every(g => g.containerTypeId === 'epic'),
    `all capability containers are "epic"`);
  expect(mapped.tasks.every(t => t.request.initialStatus === 'BACKLOG'),
    `all tasks start in BACKLOG`);
}

// ─── Mapper — Shape Up profile ───

console.log('\n▸ Mapper — Shape Up profile');
{
  const mapped = mapSpec(parsed, SHAPE_UP_PROFILE);
  expect(mapped.errors.length === 0 && mapped.warnings.length === 0,
    `zero errors and warnings`);
  expect(mapped.groupIssues.every(g => g.containerTypeId === 'bet'),
    `all capability containers are "bet"`);
  expect(mapped.tasks.every(t => t.request.initialStatus === 'RAW'),
    `all tasks start in RAW`);
}

// ─── Summary ───

console.log('\n═══════════════════════════════════════════');
const total = pass + fail;
console.log(`  Results: ${pass} passed, ${fail} failed (${total} total)`);
if (fail === 0) {
  console.log('  ✓ ROUND 3 ARTIFACT FLOWS CLEANLY');
  console.log('═══════════════════════════════════════════');
  process.exit(0);
} else {
  console.log('  ✗ INGESTION CONTRACT REGRESSION');
  console.log('═══════════════════════════════════════════');
  process.exit(1);
}
