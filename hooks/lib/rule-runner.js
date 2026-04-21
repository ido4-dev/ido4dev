// Rule runner — deterministic evaluator for hooks/rules/*.rules.yaml.
//
// Canonical reference: ~/dev-projects/ido4-suite/docs/hook-and-rule-strategy.md
// Phase 3 spec:         ~/dev-projects/ido4dev/docs/phase-3-brief.md §3–§4.6
//
// Responsibilities:
//   1. Read a hook event (JSON) from stdin OR from an in-memory object.
//   2. Resolve the active methodology profile (Hydro / Scrum / Shape Up).
//   3. Load a rule file and filter to rules whose `profiles:` includes it.
//   4. Evaluate each surviving rule's `when:` JS expression against a sandboxed
//      context. Failures are logged to stderr and never crash the runner.
//   5. Apply the hit policy (first / collect / unique).
//   6. Render `emit:` Mustache templates. Missing vars render as empty.
//   7. Honor `debounce_seconds` using last_rule_fires in state.json.
//   8. Record an `escalate_to:` suggestion when requested. Stage 2 only wires
//      `additionalContext` mode; `direct` mode is surfaced structurally and
//      gets consumed in Stage 7.
//   9. Update state (last_rule_fires) atomically.
//  10. Emit a Claude Code hook response (JSON on stdout).
//
// What it deliberately does NOT do:
//   - Import any npm dependency at runtime (yaml + mustache vendored under
//     hooks/lib/vendored; §4.9 graceful-degradation invariant).
//   - Interpret tool results via LLM (§2.1 — deterministic data stays in data).
//   - Log every hook invocation to an event history (§2.3 — YAGNI until a
//     rule needs cross-session event queries).
//
// Trust boundary: rule files are authored by plugin maintainers and reviewed
// in-tree. `when:` expressions and `post_evaluation.persist` expressions run
// via `new Function(...)` — not a generic eval surface. Do NOT accept
// user-supplied rule files without sandboxing.
//
// State writes (Stage 4):
//   Rule files can declare a top-level `post_evaluation.persist` block. Each
//   key is a state field to write; each value is a JS expression evaluated
//   against the same context as `when:` (plus `now_iso` / `now_ms` helpers).
//   The result is written to state[key] (overwrite semantics — the new value
//   replaces the old). This is how rules advance the baselines that other
//   rules diff against (e.g., last_compliance for grade-drop detection).
//   `last_rule_fires` remains merge-semantics (per-fire debounce timestamps).

'use strict';

const fs = require('fs');
const path = require('path');

const yaml = require('./vendored/yaml.js');
const mustache = require('./vendored/mustache.js');
const state = require('./state.js');

const DEFAULT_HIT_POLICY = 'collect';
const VALID_HIT_POLICIES = new Set(['first', 'collect', 'unique']);

function warn(msg) {
  process.stderr.write(`[rule-runner] ${msg}\n`);
}

// ────────────────────────────────────────────────────────────────
// Loading

function loadRuleFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  let doc;
  try {
    doc = yaml.load(text);
  } catch (e) {
    throw new Error(`Rule file ${filePath}: YAML parse failed — ${e.message}`);
  }
  validateRuleFile(doc, filePath);
  return doc;
}

function validateRuleFile(doc, filePath) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new Error(`Rule file ${filePath}: top level must be a mapping`);
  }
  if (!Array.isArray(doc.rules)) {
    throw new Error(`Rule file ${filePath}: "rules" must be an array`);
  }
  if (doc.hit_policy && !VALID_HIT_POLICIES.has(doc.hit_policy)) {
    throw new Error(`Rule file ${filePath}: hit_policy "${doc.hit_policy}" is not one of ${[...VALID_HIT_POLICIES].join(', ')}`);
  }
  const seen = new Set();
  for (const r of doc.rules) {
    if (!r || typeof r !== 'object') {
      throw new Error(`Rule file ${filePath}: rule entries must be mappings`);
    }
    if (typeof r.id !== 'string' || r.id.length === 0) {
      throw new Error(`Rule file ${filePath}: rule missing id`);
    }
    if (seen.has(r.id)) {
      throw new Error(`Rule file ${filePath}: duplicate rule id "${r.id}"`);
    }
    seen.add(r.id);
    if (typeof r.when !== 'string' || r.when.length === 0) {
      throw new Error(`Rule file ${filePath}: rule ${r.id} missing "when" expression`);
    }
    if (r.profiles !== undefined && !Array.isArray(r.profiles)) {
      throw new Error(`Rule file ${filePath}: rule ${r.id} "profiles" must be an array`);
    }
    if (r.debounce_seconds !== undefined && (typeof r.debounce_seconds !== 'number' || r.debounce_seconds < 0)) {
      throw new Error(`Rule file ${filePath}: rule ${r.id} "debounce_seconds" must be a non-negative number`);
    }
    if (r.escalate_mode !== undefined && r.escalate_mode !== 'additionalContext' && r.escalate_mode !== 'direct') {
      throw new Error(`Rule file ${filePath}: rule ${r.id} "escalate_mode" must be "additionalContext" or "direct"`);
    }
  }
  if (doc.post_evaluation !== undefined) {
    if (!doc.post_evaluation || typeof doc.post_evaluation !== 'object' || Array.isArray(doc.post_evaluation)) {
      throw new Error(`Rule file ${filePath}: "post_evaluation" must be a mapping`);
    }
    if (doc.post_evaluation.persist !== undefined) {
      const persist = doc.post_evaluation.persist;
      if (!persist || typeof persist !== 'object' || Array.isArray(persist)) {
        throw new Error(`Rule file ${filePath}: "post_evaluation.persist" must be a mapping`);
      }
      for (const [key, expr] of Object.entries(persist)) {
        if (typeof expr !== 'string' || expr.length === 0) {
          throw new Error(`Rule file ${filePath}: post_evaluation.persist["${key}"] must be a non-empty JS expression string`);
        }
      }
    }
  }
}

function loadProfile(profilePath) {
  if (!profilePath || !fs.existsSync(profilePath)) return { profile: null, values: {} };
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
  } catch (e) {
    warn(`profile file ${profilePath} unreadable — continuing with null profile (${e.message})`);
    return { profile: null, values: {} };
  }
  const profile = raw && (raw.methodology || raw.profile) || null;
  const values = (raw && raw.values && typeof raw.values === 'object' && !Array.isArray(raw.values)) ? raw.values : {};
  return { profile, values };
}

// ────────────────────────────────────────────────────────────────
// Expression evaluation

// Evaluate a JS expression against a context object. Returns { value, error }.
// Expression runs via `new Function` in sloppy mode so `with(ctx)` lifts
// context fields as identifiers. Returns the raw expression value — used by
// post_evaluation.persist to persist arbitrary shapes.
//
// Scope: the context object ONLY. Globals reachable via constructor chains are
// not blocked; see trust-boundary note at the top of the file. Do NOT use this
// with user-supplied expressions.
function evalExpr(expr, ctx) {
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function('ctx', `with (ctx) { return (${expr}); }`);
    return { value: fn(ctx) };
  } catch (e) {
    return { value: undefined, error: e.message };
  }
}

// Evaluate a `when:` expression and coerce to boolean. Wraps evalExpr.
function evalWhen(expr, ctx) {
  const r = evalExpr(expr, ctx);
  return { value: !!r.value, error: r.error };
}

// ────────────────────────────────────────────────────────────────
// Rendering

function renderString(template, ctx) {
  if (typeof template !== 'string') return template;
  try {
    return mustache.render(template, ctx);
  } catch (e) {
    warn(`Mustache render failed for "${template.slice(0, 60)}…" — ${e.message}`);
    return template;
  }
}

function renderEmit(emit, ctx) {
  if (!emit || typeof emit !== 'object') return {};
  const out = {};
  for (const k of Object.keys(emit)) {
    const v = emit[k];
    if (typeof v === 'string') {
      out[k] = renderString(v, ctx);
    } else if (Array.isArray(v)) {
      out[k] = v.map((item) => (typeof item === 'string' ? renderString(item, ctx) : item));
    } else {
      out[k] = v;
    }
  }
  return out;
}

// ────────────────────────────────────────────────────────────────
// Filtering and debounce

function filterByProfile(rules, profile) {
  return rules.filter((r) => {
    if (!Array.isArray(r.profiles) || r.profiles.length === 0) return true; // profile-agnostic
    if (profile === null) return true; // unknown active profile — do not filter out
    return r.profiles.includes(profile);
  });
}

function debounceKey(rule, ctx) {
  const target = typeof rule.debounce_target === 'string'
    ? renderString(rule.debounce_target, ctx)
    : '*';
  return `${rule.id}:${target || '*'}`;
}

function shouldDebounce(rule, ctx, stateIn, now) {
  if (!rule.debounce_seconds || rule.debounce_seconds <= 0) return { debounced: false };
  const key = debounceKey(rule, ctx);
  const last = stateIn.last_rule_fires && stateIn.last_rule_fires[key];
  if (!last) return { debounced: false, key };
  const lastMs = new Date(last).getTime();
  if (!Number.isFinite(lastMs)) return { debounced: false, key };
  const windowMs = rule.debounce_seconds * 1000;
  return { debounced: (now - lastMs) < windowMs, key };
}

// ────────────────────────────────────────────────────────────────
// Core evaluation — pure function, no I/O

function evaluate({ ruleFile, event, profile, profileValues, state: currentState, now }) {
  const nowMs = typeof now === 'number' ? now : Date.now();
  const ctx = {
    tool_input: (event && event.tool_input) || {},
    tool_response: (event && event.tool_response) || {},
    profile,
    profile_values: profileValues || {},
    state: currentState || state.emptyState(),
    event: event || {},
    now_ms: nowMs,
    now_iso: new Date(nowMs).toISOString(),
  };

  const hitPolicy = ruleFile.hit_policy || DEFAULT_HIT_POLICY;
  const applicable = filterByProfile(ruleFile.rules, profile);

  const findings = [];
  const escalate = [];
  const stateMutations = { last_rule_fires: {} };

  for (const rule of applicable) {
    const { value, error } = evalWhen(rule.when, ctx);
    if (error) {
      warn(`rule ${rule.id}: when-expression error — ${error}`);
      continue;
    }
    if (!value) continue;

    const { debounced, key } = shouldDebounce(rule, ctx, ctx.state, nowMs);
    if (debounced) continue;

    const emit = renderEmit(rule.emit, ctx);
    findings.push({
      rule_id: rule.id,
      severity: rule.severity || 'info',
      ...emit,
    });

    if (rule.escalate_to) {
      escalate.push({
        rule_id: rule.id,
        agent: rule.escalate_to,
        mode: rule.escalate_mode || 'additionalContext',
      });
    }

    if (key) stateMutations.last_rule_fires[key] = new Date(nowMs).toISOString();

    if (hitPolicy === 'first') break;
  }

  if (hitPolicy === 'unique' && findings.length > 1) {
    warn(`hit_policy "unique" produced ${findings.length} findings in ${ruleFile.matcher || 'rule file'}`);
  }

  // post_evaluation.persist — always runs after rule evaluation regardless of
  // which rules fired. Each persist value is a JS expression; its result is
  // recorded as an overwrite mutation for the named state key. Errors are
  // warned and skipped; undefined results are skipped (no-op, not a write).
  if (ruleFile.post_evaluation && ruleFile.post_evaluation.persist) {
    for (const [key, expr] of Object.entries(ruleFile.post_evaluation.persist)) {
      const r = evalExpr(expr, ctx);
      if (r.error) {
        warn(`post_evaluation.persist["${key}"]: expression error — ${r.error}`);
        continue;
      }
      if (r.value === undefined) continue;
      stateMutations[key] = r.value;
    }
  }

  return { findings, escalate, stateMutations };
}

// ────────────────────────────────────────────────────────────────
// Claude Code hook response shaping

function formatHookResponse(event, result) {
  if (result.findings.length === 0 && result.escalate.length === 0) {
    return {}; // no-op response; Claude Code treats as allow/continue
  }

  const blocks = result.findings.map((f) => {
    const parts = [];
    if (f.title) parts.push(`**${f.title}**`);
    if (f.body) parts.push(f.body);
    if (f.cta) parts.push(f.cta);
    return parts.join('\n\n');
  });

  // Stage 2 only surfaces escalate_to via additionalContext suggestions. Direct
  // mode ships its wiring in Stage 7.
  const escalateBlocks = result.escalate
    .filter((e) => e.mode !== 'direct')
    .map((e) => `Suggested next action: invoke \`/agents ${e.agent}\` to review finding ${e.rule_id}.`);

  const additionalContext = [...blocks, ...escalateBlocks].filter(Boolean).join('\n\n---\n\n');

  if (!additionalContext) return {};

  return {
    hookSpecificOutput: {
      hookEventName: event && event.hook_event_name ? event.hook_event_name : 'PostToolUse',
      additionalContext,
    },
  };
}

// ────────────────────────────────────────────────────────────────
// I/O wrapper (CLI entry)

function readStdinJson() {
  return new Promise((resolve, reject) => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { buf += c; });
    process.stdin.on('end', () => {
      if (!buf.trim()) return resolve({});
      try { resolve(JSON.parse(buf)); } catch (e) { reject(new Error(`stdin not valid JSON: ${e.message}`)); }
    });
    process.stdin.on('error', reject);
  });
}

async function runFromStdin({ ruleFilePath, profilePath, stateFilePath, now = Date.now() }) {
  const event = await readStdinJson();
  const ruleFile = loadRuleFile(ruleFilePath);
  const { profile, values } = loadProfile(profilePath);
  const currentState = state.read(stateFilePath);

  const result = evaluate({
    ruleFile,
    event,
    profile,
    profileValues: values,
    state: currentState,
    now,
  });

  const hasFireMutations = Object.keys(result.stateMutations.last_rule_fires).length > 0;
  const persistKeys = Object.keys(result.stateMutations).filter((k) => k !== 'last_rule_fires');
  if (stateFilePath && (hasFireMutations || persistKeys.length > 0)) {
    try {
      state.update(stateFilePath, (s) => {
        // last_rule_fires is merged (each per-rule fire timestamp accumulates).
        s.last_rule_fires = { ...s.last_rule_fires, ...result.stateMutations.last_rule_fires };
        // post_evaluation.persist keys overwrite — the new snapshot replaces the baseline.
        for (const key of persistKeys) {
          s[key] = result.stateMutations[key];
        }
        return s;
      });
    } catch (e) {
      warn(`state update failed — ${e.message}`);
    }
  }

  const response = formatHookResponse(event, result);
  process.stdout.write(JSON.stringify(response) + '\n');
}

// CLI dispatch: node rule-runner.js --rules <path> [--profile <path>] [--state <path>]
function parseCliArgs(argv) {
  const args = { ruleFilePath: null, profilePath: null, stateFilePath: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--rules') args.ruleFilePath = argv[++i];
    else if (a === '--profile') args.profilePath = argv[++i];
    else if (a === '--state') args.stateFilePath = argv[++i];
  }
  return args;
}

if (require.main === module) {
  const args = parseCliArgs(process.argv.slice(2));
  if (!args.ruleFilePath) {
    warn('missing --rules <path>');
    process.exit(2);
  }
  // Default profile/state paths from environment when not given explicitly.
  if (!args.profilePath) {
    const cwdProfile = path.join(process.cwd(), '.ido4', 'methodology-profile.json');
    if (fs.existsSync(cwdProfile)) args.profilePath = cwdProfile;
  }
  if (!args.stateFilePath && process.env.CLAUDE_PLUGIN_DATA) {
    args.stateFilePath = path.join(process.env.CLAUDE_PLUGIN_DATA, 'hooks', 'state.json');
  }
  runFromStdin(args).catch((e) => {
    warn(`fatal — ${e.message}`);
    // Graceful: never block the session on a rule-runner failure.
    process.stdout.write('{}\n');
    process.exit(0);
  });
}

module.exports = {
  // Pure (testable) surface
  evaluate,
  filterByProfile,
  evalWhen,
  evalExpr,
  renderString,
  renderEmit,
  shouldDebounce,
  debounceKey,
  validateRuleFile,
  formatHookResponse,
  // I/O surface
  loadRuleFile,
  loadProfile,
  runFromStdin,
  parseCliArgs,
  // Constants
  DEFAULT_HIT_POLICY,
  VALID_HIT_POLICIES,
};
