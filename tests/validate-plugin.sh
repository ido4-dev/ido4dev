#!/bin/bash
# ido4dev plugin validation suite
# Validates structure, config, skills, agents, hooks, tool prefixes, and MCP dependency.
# Run: bash tests/validate-plugin.sh

set -uo pipefail
# Note: NOT using set -e because grep returns 1 when no match found,
# which is the success case for "no stale references" checks.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PLUGIN_ROOT"

PASS=0
FAIL=0
WARN=0

pass() { echo "  ✓ $1"; PASS=$((PASS + 1)); }
fail() { echo "  ✗ $1"; FAIL=$((FAIL + 1)); }
warn() { echo "  ⚠ $1"; WARN=$((WARN + 1)); }

# ─── A. Manifest & Config ───

echo "▸ Manifest & Config"

[ -f ".claude-plugin/plugin.json" ] && pass "plugin.json exists" || fail "plugin.json missing"

if [ -f ".claude-plugin/plugin.json" ]; then
  python3 -c "import json; json.load(open('.claude-plugin/plugin.json'))" 2>/dev/null \
    && pass "plugin.json is valid JSON" || fail "plugin.json is invalid JSON"

  NAME=$(python3 -c "import json; print(json.load(open('.claude-plugin/plugin.json')).get('name',''))" 2>/dev/null)
  [ "$NAME" = "ido4dev" ] && pass "plugin name is 'ido4dev'" || fail "plugin name is '$NAME', expected 'ido4dev'"
fi

[ -f "package.json" ] && pass "package.json exists" || fail "package.json missing"

if [ -f "package.json" ]; then
  python3 -c "import json; d=json.load(open('package.json')); assert '@ido4/mcp' in d.get('dependencies',{})" 2>/dev/null \
    && pass "package.json has @ido4/mcp dependency" || fail "package.json missing @ido4/mcp dependency"
fi

if [ -f ".mcp.json" ]; then
  grep -q 'CLAUDE_PLUGIN_DATA' .mcp.json \
    && pass ".mcp.json references CLAUDE_PLUGIN_DATA" || fail ".mcp.json does not reference CLAUDE_PLUGIN_DATA"
else
  fail ".mcp.json missing"
fi

# ─── B. Directory Structure ───

echo ""
echo "▸ Directory Structure"

for DIR in skills agents hooks .claude-plugin; do
  [ -d "$DIR" ] && pass "$DIR/ exists" || fail "$DIR/ missing"
done

# ─── C. Skills Validation ───

echo ""
echo "▸ Skills"

EXPECTED_SKILLS="standup board health compliance onboard guided-demo sandbox-explore sandbox plan-wave plan-sprint plan-cycle retro-wave retro-sprint retro-cycle decompose spec-validate spec-quality pilot-test sandbox-hydro sandbox-scrum sandbox-shape-up"

for SKILL in $EXPECTED_SKILLS; do
  SKILL_FILE="skills/$SKILL/SKILL.md"
  if [ -f "$SKILL_FILE" ]; then
    pass "$SKILL exists"

    # Check YAML frontmatter
    head -1 "$SKILL_FILE" | grep -q "^---" \
      && pass "$SKILL has frontmatter" || fail "$SKILL missing frontmatter"

    # Check description
    grep -q "^description:" "$SKILL_FILE" \
      && pass "$SKILL has description" || fail "$SKILL missing description"

    # Check allowed-tools
    grep -q "allowed-tools:" "$SKILL_FILE" \
      && pass "$SKILL has allowed-tools" || fail "$SKILL missing allowed-tools"
  else
    fail "$SKILL SKILL.md missing"
  fi
done

# ─── D. Tool Prefix Consistency ───

echo ""
echo "▸ Tool Prefix Consistency"

# No old tool prefix
OLD_TOOL_COUNT=$(grep -r "mcp__plugin_ido4_ido4__" --include="*.md" --include="*.json" . 2>/dev/null | grep -v ".git/" | wc -l | tr -d ' ')
[ "$OLD_TOOL_COUNT" = "0" ] \
  && pass "No stale mcp__plugin_ido4_ido4__ references" \
  || fail "$OLD_TOOL_COUNT stale mcp__plugin_ido4_ido4__ references found"

# No old skill prefix (excluding ido4shape refs)
OLD_SKILL_COUNT=$(grep -r "/ido4:" --include="*.md" . 2>/dev/null | grep -v ".git/" | grep -v "ido4dev:" | grep -v "ido4shape:" | grep -v "ido4:context" | wc -l | tr -d ' ')
[ "$OLD_SKILL_COUNT" = "0" ] \
  && pass "No stale /ido4: skill references" \
  || fail "$OLD_SKILL_COUNT stale /ido4: references found"

# Hook matchers use correct prefix
if [ -f "hooks/hooks.json" ]; then
  grep -q "mcp__plugin_ido4dev_ido4__" hooks/hooks.json \
    && pass "Hook matchers use ido4dev prefix" || fail "Hook matchers use wrong prefix"
fi

# Settings permission uses correct prefix
if [ -f "settings.json" ]; then
  grep -q "mcp__plugin_ido4dev_ido4" settings.json \
    && pass "settings.json uses ido4dev permission" || fail "settings.json uses wrong permission"
fi

# ─── E. Agents ───

echo ""
echo "▸ Agents"

EXPECTED_AGENTS="agents/code-analyzer.md agents/spec-reviewer.md agents/technical-spec-writer.md agents/project-manager/AGENT.md"

for AGENT in $EXPECTED_AGENTS; do
  if [ -f "$AGENT" ]; then
    pass "$(basename $AGENT) exists"

    head -1 "$AGENT" | grep -q "^---" \
      && pass "$(basename $AGENT) has frontmatter" || fail "$(basename $AGENT) missing frontmatter"

    grep -qE "^(name|description):" "$AGENT" \
      && pass "$(basename $AGENT) has name/description" || warn "$(basename $AGENT) missing name or description"
  else
    fail "$AGENT missing"
  fi
done

# ─── F. Hooks ───

echo ""
echo "▸ Hooks"

if [ -f "hooks/hooks.json" ]; then
  python3 -c "import json; json.load(open('hooks/hooks.json'))" 2>/dev/null \
    && pass "hooks.json is valid JSON" || fail "hooks.json is invalid JSON"

  python3 -c "import json; d=json.load(open('hooks/hooks.json')); assert 'SessionStart' in d.get('hooks',{})" 2>/dev/null \
    && pass "Has SessionStart hook" || fail "Missing SessionStart hook"

  python3 -c "import json; d=json.load(open('hooks/hooks.json')); assert 'PostToolUse' in d.get('hooks',{})" 2>/dev/null \
    && pass "Has PostToolUse hook" || fail "Missing PostToolUse hook"

  grep -q 'CLAUDE_PLUGIN_DATA' hooks/hooks.json \
    && pass "SessionStart references CLAUDE_PLUGIN_DATA" || fail "SessionStart missing CLAUDE_PLUGIN_DATA"
else
  fail "hooks.json missing"
fi

# ─── G. MCP Dependency ───

echo ""
echo "▸ MCP Dependency"

if [ -f "package.json" ]; then
  MCP_VERSION=$(python3 -c "import json; print(json.load(open('package.json')).get('dependencies',{}).get('@ido4/mcp',''))" 2>/dev/null)
  echo "$MCP_VERSION" | grep -qE '^\^|^~' \
    && pass "MCP version is semver range ($MCP_VERSION)" || fail "MCP version '$MCP_VERSION' is not a semver range"
fi

if [ -f ".mcp.json" ]; then
  grep -q 'CLAUDE_PLUGIN_DATA.*node_modules' .mcp.json \
    && pass ".mcp.json server path includes PLUGIN_DATA/node_modules" || fail ".mcp.json server path wrong"
fi

# ─── H. Cross-References ───

echo ""
echo "▸ Cross-References"

# Check that skills referencing other skills use /ido4dev: prefix
SKILL_REFS=$(grep -roh "/ido4dev:[a-z-]*" --include="*.md" . 2>/dev/null | sort -u | sed 's|/ido4dev:||')
MISSING_REFS=0
for REF in $SKILL_REFS; do
  if [ ! -d "skills/$REF" ] && [ ! -f "commands/$REF.md" ]; then
    # Some refs are to tools (init, board) that may not be skills
    # Only fail on clear skill refs
    if echo "$REF" | grep -qE "standup|board|health|compliance|onboard|guided-demo|sandbox|decompose|plan-|retro-"; then
      [ -d "skills/$REF" ] || [ -f "commands/$REF.md" ] || MISSING_REFS=$((MISSING_REFS + 1))
    fi
  fi
done
[ "$MISSING_REFS" = "0" ] \
  && pass "All skill cross-references resolve" || warn "$MISSING_REFS cross-references may not resolve"

[ -f "README.md" ] && pass "README.md exists" || fail "README.md missing"
[ -f "LICENSE" ] && pass "LICENSE exists" || fail "LICENSE missing"

# ─── I. Content Quality ───

echo ""
echo "▸ Content Quality"

AGGRESSIVE=$(grep -rl "CRITICAL!\|YOU MUST\|NEVER EVER\|IMPORTANT:" skills/ --include="*.md" 2>/dev/null | wc -l | tr -d ' ')
[ "$AGGRESSIVE" = "0" ] \
  && pass "No aggressive anti-patterns in skills" || warn "$AGGRESSIVE files with aggressive patterns"

# ─── J. Claude Code Native Validation ───

echo ""
echo "▸ Claude Code Native Validation"

if command -v claude &>/dev/null; then
  claude plugin validate "$PLUGIN_ROOT" 2>&1 | grep -q "Validation passed" \
    && pass "claude plugin validate passed" || fail "claude plugin validate failed"
else
  warn "claude CLI not found — skipping native validation (CI runs it separately)"
fi

# ─── Summary ───

echo ""
echo "═══════════════════════════════════════════"
TOTAL=$((PASS + FAIL))
echo "  Results: $PASS passed, $FAIL failed, $WARN warnings ($TOTAL total)"
if [ $FAIL -eq 0 ]; then
  echo "  ✓ ALL TESTS PASSED"
  echo "═══════════════════════════════════════════"
  exit 0
else
  echo "  ✗ $FAIL FAILURE(S)"
  echo "═══════════════════════════════════════════"
  exit 1
fi
