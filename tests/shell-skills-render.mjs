#!/usr/bin/env node
/**
 * Shell skills integration test — renders each shell skill against fixture
 * profiles for all three methodologies and verifies the output.
 *
 * This is the closest we can get to the real bash-injection flow without a
 * live Claude Code session. The test:
 *   1. Extracts the bash command from each shell's SKILL.md body
 *   2. Substitutes $ARGUMENTS (empty) and ${CLAUDE_PLUGIN_DATA} (test fixture)
 *   3. Runs the command with IDO4_PROJECT_ROOT pointing at a temp profile
 *   4. Asserts the output is non-empty and contains methodology-specific markers
 *
 * Runs against the actual compiled `render-prompt-cli.js` from @ido4/mcp.
 * Requires: `@ido4/mcp` built (run `npm run build` in ido4/packages/mcp first).
 *
 * Exit codes: 0 on success, 1 on any failure.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(__dirname, '..');

// Locate render-prompt-cli.js. Prefer installed ${CLAUDE_PLUGIN_DATA}/node_modules
// if available; fall back to the in-repo dist at ~/dev-projects/ido4/packages/mcp/dist.
// The fallback supports running tests before the plugin is installed anywhere.
const CANDIDATE_CLI_PATHS = [
  process.env.CLAUDE_PLUGIN_DATA && path.join(process.env.CLAUDE_PLUGIN_DATA, 'node_modules/@ido4/mcp/dist/render-prompt-cli.js'),
  path.join(PLUGIN_ROOT, 'node_modules/@ido4/mcp/dist/render-prompt-cli.js'),
  path.resolve(PLUGIN_ROOT, '../ido4/packages/mcp/dist/render-prompt-cli.js'),
].filter(Boolean);

const CLI_PATH = CANDIDATE_CLI_PATHS.find((p) => fs.existsSync(p));

let pass = 0;
let fail = 0;

function ok(msg) { console.log(`  ✓ ${msg}`); pass++; }
function bad(msg) { console.log(`  ✗ ${msg}`); fail++; }

if (!CLI_PATH) {
  bad(`render-prompt-cli.js not found. Searched:\n    ${CANDIDATE_CLI_PATHS.join('\n    ')}`);
  console.log('\n  Hint: build @ido4/mcp first: (cd ~/dev-projects/ido4/packages/mcp && npm run build)');
  process.exit(1);
}

console.log(`▸ Shell Skills Render Integration`);
console.log(`  CLI: ${CLI_PATH}`);

// ─── Shell skill definitions to exercise ───

const shellSkills = [
  {
    name: 'review',
    ceremony: 'review',
    acceptsContainer: true,
    hydroMarker: 'Wave Review',
    scrumMarker: 'Sprint Review',
    shapeUpMarker: 'Demo',
    minBytes: 2000,
  },
  {
    name: 'execute-task',
    ceremony: 'execute-task',
    acceptsIssue: true,
    hydroMarker: 'Epic Integrity',
    scrumMarker: 'Definition of Done',
    shapeUpMarker: 'Scope Hammering',
    minBytes: 3000,
  },
];

// ─── Verify each shell's SKILL.md structure is as expected ───

console.log(`\n▸ SKILL.md source integrity`);
for (const shell of shellSkills) {
  const skillPath = path.join(PLUGIN_ROOT, 'skills', shell.name, 'SKILL.md');
  if (!fs.existsSync(skillPath)) {
    bad(`${shell.name}: SKILL.md not found at ${skillPath}`);
    continue;
  }
  const body = fs.readFileSync(skillPath, 'utf-8');

  // Required: bash injection calling render-prompt-cli.js with the right ceremony
  const pattern = new RegExp(
    `!\`node\\s+"\\\${CLAUDE_PLUGIN_DATA}/node_modules/@ido4/mcp/dist/render-prompt-cli\\.js"\\s+${shell.ceremony}\\s+"\\$ARGUMENTS"\``,
  );
  if (pattern.test(body)) {
    ok(`${shell.name}: bash injection matches expected shape`);
  } else {
    bad(`${shell.name}: bash injection pattern mismatch — expected !\`node "$\{CLAUDE_PLUGIN_DATA}/.../render-prompt-cli.js" ${shell.ceremony} "$ARGUMENTS"\``);
  }
}

// ─── For each shell × methodology, render via subprocess ───

function makeFixtureProjectRoot(methodologyId) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `ido4dev-shell-test-${methodologyId}-`));
  fs.mkdirSync(path.join(dir, '.ido4'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.ido4/methodology-profile.json'),
    JSON.stringify({ id: methodologyId }),
  );
  return dir;
}

function runCli(projectRoot, args) {
  try {
    const stdout = execFileSync('node', [CLI_PATH, ...args], {
      env: { ...process.env, IDO4_PROJECT_ROOT: projectRoot },
      encoding: 'utf-8',
      timeout: 10000,
    });
    return { ok: true, stdout, stderr: '' };
  } catch (err) {
    return {
      ok: false,
      stdout: err.stdout?.toString() ?? '',
      stderr: err.stderr?.toString() ?? String(err),
      code: err.status,
    };
  }
}

const methodologies = [
  { id: 'hydro', label: 'Hydro', markerField: 'hydroMarker' },
  { id: 'scrum', label: 'Scrum', markerField: 'scrumMarker' },
  { id: 'shape-up', label: 'Shape Up', markerField: 'shapeUpMarker' },
];

for (const shell of shellSkills) {
  console.log(`\n▸ Render: ${shell.name}`);
  for (const methodology of methodologies) {
    const projectRoot = makeFixtureProjectRoot(methodology.id);
    try {
      // Invoke with empty "" positional — the $ARGUMENTS substitution with no user input
      const result = runCli(projectRoot, [shell.ceremony, '']);
      if (!result.ok) {
        bad(`${shell.name} × ${methodology.label}: CLI exited with code ${result.code}. stderr: ${result.stderr}`);
        continue;
      }
      const bytes = result.stdout.length;
      if (bytes < shell.minBytes) {
        bad(`${shell.name} × ${methodology.label}: output too small (${bytes} bytes < ${shell.minBytes} expected)`);
        continue;
      }
      const marker = shell[methodology.markerField];
      if (!result.stdout.includes(marker)) {
        bad(`${shell.name} × ${methodology.label}: output missing expected marker "${marker}"`);
        continue;
      }
      ok(`${shell.name} × ${methodology.label}: ${bytes} bytes, contains "${marker}"`);
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  }

  // Parameter path: for shells that accept container or issue, verify the param flows through
  if (shell.acceptsContainer) {
    const projectRoot = makeFixtureProjectRoot('hydro');
    try {
      const result = runCli(projectRoot, [shell.ceremony, 'Wave-042']);
      if (result.ok && result.stdout.includes('Wave to review: Wave-042')) {
        ok(`${shell.name} container-name suffix propagates (Wave-042)`);
      } else {
        bad(`${shell.name} container-name suffix missing in output`);
      }
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  }
  if (shell.acceptsIssue) {
    const projectRoot = makeFixtureProjectRoot('hydro');
    try {
      const result = runCli(projectRoot, [shell.ceremony, '42']);
      if (result.ok && result.stdout.includes('Task to execute: #42')) {
        ok(`${shell.name} issue-number suffix propagates (#42)`);
      } else {
        bad(`${shell.name} issue-number suffix missing in output`);
      }
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  }
}

// ─── Empty-$ARGUMENTS behavior: shells should render cleanly even when user provides no input ───

console.log(`\n▸ Empty-$ARGUMENTS behavior`);
for (const shell of shellSkills) {
  const projectRoot = makeFixtureProjectRoot('hydro');
  try {
    const result = runCli(projectRoot, [shell.ceremony, '']);
    if (result.ok && result.stdout.length > 0) {
      ok(`${shell.name}: empty $ARGUMENTS produces clean output (no error)`);
    } else {
      bad(`${shell.name}: empty $ARGUMENTS failed. code=${result.code}, stderr=${result.stderr}`);
    }
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
}

// ─── Summary ───

console.log('\n═══════════════════════════════════════════');
const total = pass + fail;
console.log(`  Results: ${pass} passed, ${fail} failed (${total} total)`);
if (fail === 0) {
  console.log('  ✓ ALL SHELL RENDER TESTS PASSED');
  console.log('═══════════════════════════════════════════');
  process.exit(0);
} else {
  console.log(`  ✗ ${fail} FAILURE(S)`);
  console.log('═══════════════════════════════════════════');
  process.exit(1);
}
