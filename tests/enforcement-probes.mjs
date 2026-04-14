#!/usr/bin/env node
/**
 * Ingestion Enforcement Probes
 *
 * Synthetic fixtures exercising the fatal / warning / silent code paths that
 * the Round 3 agent artifact didn't hit. Each probe is a single-claim
 * ground-truth statement about parseSpec or mapSpec behavior — "what does the
 * pipeline actually catch for violation X, and at what severity?"
 *
 * These probes back the enforcement matrix in docs/ingestion-enforcement.md.
 * Any rule audit that claims "downstream enforcement catches X" should be
 * verifiable by pointing at a probe here.
 *
 * Run: node tests/enforcement-probes.mjs
 * Requires: @ido4/core installed
 */

let pass = 0;
let fail = 0;
function ok(msg)  { console.log(`  ✓ ${msg}`); pass++; }
function bad(msg) { console.log(`  ✗ ${msg}`); fail++; }
function expect(cond, msg) { if (cond) ok(msg); else bad(msg); }

// ─── Load @ido4/core ingestion API ───

let parseSpec, mapSpec, HYDRO_PROFILE;
try {
  const core = await import('@ido4/core');
  parseSpec = core.parseSpec;
  mapSpec = core.mapSpec;
  HYDRO_PROFILE = core.HYDRO_PROFILE;
  if (!parseSpec || !mapSpec || !HYDRO_PROFILE) {
    console.log('  ✗ @ido4/core is missing parseSpec, mapSpec, or HYDRO_PROFILE');
    process.exit(1);
  }
} catch (e) {
  console.log(`  ✗ Cannot import @ido4/core: ${e.message}`);
  process.exit(1);
}

// ─── Helpers ───

function minimal(body) {
  return `# Test Project
> A minimal spec used as a baseline for enforcement probes.

---

## Capability: Test Capability
> size: M | risk: low

${body}
`;
}

function oneTaskSpec(metadataLine) {
  return minimal(`
### TEST-01: Probe task
> ${metadataLine}
> depends_on: -

A task body with enough characters to register as a real description for this probe.

**Success conditions:**
- A
- B
`);
}

// ─── Parser — fatal / error paths ───

console.log('▸ Parser — fatal and error paths');

{
  const spec = minimal(`
### TEST-01: First task
> effort: S | risk: low | type: feature | ai: full
> depends_on: -

First task body with enough characters to register as a real description.

**Success conditions:**
- A
- B

### TEST-01: Duplicate ref
> effort: S | risk: low | type: feature | ai: full
> depends_on: -

Duplicate task body with enough characters to register as a real description.

**Success conditions:**
- A
- B
`);
  const parsed = parseSpec(spec);
  const errs = parsed.errors.filter(e => e.severity === 'error');
  expect(
    errs.length > 0 && errs[0].message.includes('Duplicate task ref'),
    `duplicate task refs → severity=error ("Duplicate task ref" message)`
  );
}

{
  const spec = `# Empty Project\n> No tasks.\n\n---\n\n## Capability: Empty\n> size: S | risk: low\n\nNothing here.\n`;
  const parsed = parseSpec(spec);
  const warns = parsed.errors.filter(e => e.severity === 'warning');
  expect(
    warns.some(w => /no tasks/i.test(w.message)),
    `empty spec (no tasks) → severity=warning`
  );
}

{
  const spec = minimal(`
### TEST-01: Unknown metadata key
> effort: S | risk: low | type: feature | ai: full | bogus_key: whatever
> depends_on: -

Body.

**Success conditions:**
- A
- B
`);
  const parsed = parseSpec(spec);
  const warns = parsed.errors.filter(e => e.severity === 'warning');
  expect(
    warns.some(w => w.message.includes('Unknown task metadata key')),
    `unknown task metadata key → severity=warning (known metadata still captured)`
  );
  expect(
    parsed.groups[0]?.tasks[0]?.effort === 'S',
    `known metadata is still captured alongside the unknown-key warning`
  );
}

// ─── Parser — silent-drop paths ───

console.log('\n▸ Parser — silent-drop paths (no error, no warning)');

{
  const spec = minimal(`
### test-01: Lowercase ref — malformed
> effort: S | risk: low | type: feature | ai: full
> depends_on: -

Body.

**Success conditions:**
- A
- B
`);
  const parsed = parseSpec(spec);
  expect(
    parsed.groups[0]?.tasks.length === 0
      && parsed.errors.filter(e => e.severity === 'error').length === 0,
    `lowercase task ref → silently dropped (no task, no error, no warning)`
  );
}

{
  const spec = minimal(`
### TOOLONG-01: Six-letter prefix
> effort: S | risk: low | type: feature | ai: full
> depends_on: -

Body.

**Success conditions:**
- A
- B
`);
  const parsed = parseSpec(spec);
  expect(
    parsed.groups[0]?.tasks.length === 0
      && parsed.errors.filter(e => e.severity === 'error').length === 0,
    `task ref prefix >5 letters → silently dropped`
  );
}

{
  const spec = `# Test\n> Test.\n\n---\n\n## Group: Wrong Heading\n> size: M | risk: low\n\n### TEST-01: Task\n> effort: S | risk: low | type: feature | ai: full\n> depends_on: -\n\nBody with enough chars for this probe.\n\n**Success conditions:**\n- A\n- B\n`;
  const parsed = parseSpec(spec);
  expect(
    parsed.groups.length === 0 && parsed.orphanTasks.length === 1,
    `"## Group:" heading → capability silently unrecognized, task becomes orphan`
  );
}

// ─── Mapper — fatal errors ───

console.log('\n▸ Mapper — fatal and non-fatal errors');

{
  const spec = minimal(`
### TEST-01: Task A
> effort: S | risk: low | type: feature | ai: full
> depends_on: TEST-02

Body.

**Success conditions:**
- A
- B

### TEST-02: Task B
> effort: S | risk: low | type: feature | ai: full
> depends_on: TEST-01

Body.

**Success conditions:**
- A
- B
`);
  const parsed = parseSpec(spec);
  const mapped = mapSpec(parsed, HYDRO_PROFILE);
  const circular = mapped.errors.filter(e => e.message.includes('Circular dependency'));
  expect(
    circular.length > 0,
    `circular dependency → mapping error with "Circular dependency" message (fatal in IngestionService)`
  );
}

{
  const spec = minimal(`
### TEST-01: Task with unresolved dep
> effort: S | risk: low | type: feature | ai: full
> depends_on: NONEXISTENT-99

Body.

**Success conditions:**
- A
- B
`);
  const parsed = parseSpec(spec);
  const mapped = mapSpec(parsed, HYDRO_PROFILE);
  const unresolved = mapped.errors.filter(e => e.message.includes('not found in spec'));
  expect(
    unresolved.length > 0 && mapped.tasks.length === 1 && mapped.tasks[0].dependsOn.length === 0,
    `unresolved depends_on → non-fatal mapping error; task still created with bad dep dropped`
  );
}

// ─── Mapper — metadata value probes (warning + silent-loss) ───

console.log('\n▸ Mapper — metadata value probes');

{
  const mapped = mapSpec(
    parseSpec(oneTaskSpec('effort: XXL | risk: low | type: feature | ai: full')),
    HYDRO_PROFILE
  );
  expect(
    mapped.warnings.some(w => w.includes('unknown effort value'))
      && mapped.tasks[0].request.effort === undefined,
    `unknown effort value → warning + request.effort === undefined`
  );
}

{
  const mapped = mapSpec(
    parseSpec(oneTaskSpec('effort: S | risk: nuclear | type: feature | ai: full')),
    HYDRO_PROFILE
  );
  expect(
    mapped.warnings.some(w => w.includes('unknown risk value'))
      && mapped.tasks[0].request.riskLevel === undefined,
    `unknown risk value → warning + request.riskLevel === undefined`
  );
}

{
  const mapped = mapSpec(
    parseSpec(oneTaskSpec('effort: S | risk: low | type: chore | ai: full')),
    HYDRO_PROFILE
  );
  expect(
    mapped.warnings.some(w => w.includes('unknown type value'))
      && mapped.tasks[0].request.taskType === undefined,
    `unknown type value → warning + request.taskType === undefined`
  );
}

{
  const mapped = mapSpec(
    parseSpec(oneTaskSpec('effort: S | risk: low | type: feature | ai: autopilot')),
    HYDRO_PROFILE
  );
  expect(
    mapped.warnings.some(w => w.includes('unknown ai value'))
      && mapped.tasks[0].request.aiSuitability === undefined,
    `unknown ai value → warning + request.aiSuitability === undefined`
  );
}

{
  const mapped = mapSpec(
    parseSpec(oneTaskSpec('effort: XL | risk: low | type: feature | ai: full')),
    HYDRO_PROFILE
  );
  expect(
    mapped.warnings.length === 0 && mapped.tasks[0].request.effort === 'Large',
    `XL effort → silently conflated with L (both map to "Large", no warning)`
  );
}

{
  const mapped = mapSpec(
    parseSpec(oneTaskSpec('effort: S | risk: critical | type: feature | ai: full')),
    HYDRO_PROFILE
  );
  expect(
    mapped.warnings.some(w => w.includes('critical risk mapped to High'))
      && mapped.tasks[0].request.riskLevel === 'High',
    `critical risk → warning + downgraded to High`
  );
}

{
  const mapped = mapSpec(
    parseSpec(oneTaskSpec('effort: s | risk: CRITICAL | type: FEATURE | ai: Full')),
    HYDRO_PROFILE
  );
  const t = mapped.tasks[0].request;
  expect(
    t.effort === 'Small' && t.riskLevel === 'High' && t.taskType === 'FEATURE' && t.aiSuitability === 'AI_ONLY',
    `metadata lookup is case-insensitive ("s", "CRITICAL", "FEATURE", "Full" all resolve)`
  );
}

// ─── Summary ───

console.log('\n═══════════════════════════════════════════');
const total = pass + fail;
console.log(`  Results: ${pass} passed, ${fail} failed (${total} total)`);
if (fail === 0) {
  console.log('  ✓ ENFORCEMENT MATRIX MATCHES DOCUMENTED BEHAVIOR');
  console.log('═══════════════════════════════════════════');
  process.exit(0);
} else {
  console.log('  ✗ ENFORCEMENT BEHAVIOR DRIFT — update docs/ingestion-enforcement.md');
  console.log('═══════════════════════════════════════════');
  process.exit(1);
}
