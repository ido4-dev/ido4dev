#!/bin/bash
# Release script for ido4dev plugin.
# Usage: bash scripts/release.sh [--dry-run] [patch|minor|major] "Release message"
#
# --dry-run: runs all Layer 1 pre-flight checks without bumping, committing, or pushing.
#
# Layer 1 pre-flight runs before any push. Layer 2 bumps, commits, tags, pushes.
# Marketplace sync and GitHub release happen automatically via sync-marketplace.yml.

set -euo pipefail

DRY_RUN=false
YES_FLAG=false
args=()
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --yes) YES_FLAG=true ;;
    *) args+=("$arg") ;;
  esac
done
BUMP_TYPE="${args[0]:-patch}"
MESSAGE="${args[1]:-Release}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$REPO_ROOT"

# ═══════════════════════════════════════════════════════════
# Layer 1 — Pre-flight checks (abort on first failure)
# ═══════════════════════════════════════════════════════════

# ─── Pre-flight: Branch check ────────────────────────────

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo "ERROR: Releases must be cut from 'main', but you're on '$CURRENT_BRANCH'."
  echo ""
  echo "  git checkout main"
  exit 1
fi
echo "Pre-flight: on main branch ✓"

# ─── Pre-flight: Clean working tree ──────────────────────

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "ERROR: Working tree has uncommitted changes. Commit or stash before releasing."
  echo ""
  git status --short
  exit 1
fi

UNTRACKED=$(git ls-files --others --exclude-standard)
if [ -n "$UNTRACKED" ]; then
  echo "ERROR: Untracked files present. Commit, stash, or .gitignore them before releasing."
  echo ""
  echo "$UNTRACKED" | head -10
  exit 1
fi
echo "Pre-flight: clean working tree ✓"

# ─── Pre-flight: Bundle Validation ─────────────────────────
#
# ido4dev ships three bundles, each version-locked with a marker + checksum:
#   1. dist/tech-spec-validator.js       — @ido4/tech-spec-format (ours)
#   2. hooks/lib/vendored/yaml.js        — js-yaml (vendored OSS)
#   3. hooks/lib/vendored/mustache.js    — mustache (vendored OSS)
#
# #1 backs skills/ingest-spec fail-fast pre-validation; #2 and #3 back the
# Phase 3 hook rule-runner. Bundles are not in package.json — the hook layer
# stays zero-npm-dep so SessionStart graceful-degradation remains meaningful
# (§4.9 of ~/dev-projects/ido4-suite/docs/hook-and-rule-strategy.md).
#
# Release refuses to proceed if any bundle is missing or malformed; drift
# against npm is a warning (--yes auto-confirms).

check_bundle() {
  local label="$1"
  local bundle_file="$2"
  local version_file="$3"
  local npm_package="$4"
  local header_match="$5"
  # Optional: custom remediation script. Defaults to legacy "update-<label>-validator.sh"
  # naming used by tech-spec-validator; new vendored bundles pass e.g. update-yaml-vendor.sh.
  local update_script="${6:-scripts/update-${label}-validator.sh}"

  if [ ! -f "$bundle_file" ]; then
    echo "ERROR: $bundle_file not found."
    echo "Run: $update_script <version>"
    exit 1
  fi

  if ! head -3 "$bundle_file" | grep -q "$header_match"; then
    echo "ERROR: $bundle_file missing version header — not a valid bundle"
    exit 1
  fi

  local bundled_version
  bundled_version=$(cat "$version_file" 2>/dev/null || echo "unknown")
  local latest_npm
  latest_npm=$(npm view "$npm_package" version 2>/dev/null || echo "unknown")

  if [ "$bundled_version" != "$latest_npm" ] && [ "$latest_npm" != "unknown" ]; then
    echo "WARNING: Bundled $label is v$bundled_version, latest on npm is v$latest_npm"
    echo "Consider running: $update_script $latest_npm"
    if [ "$YES_FLAG" = "true" ]; then
      echo "  --yes flag: proceeding despite bundle drift"
    else
      read -p "Continue anyway? [y/N] " -n 1 -r
      echo
      [[ $REPLY =~ ^[Yy]$ ]] || exit 1
    fi
  fi

  echo "Pre-flight: $label v$bundled_version ✓"
}

check_bundle "tech-spec" \
  "$REPO_ROOT/dist/tech-spec-validator.js" \
  "$REPO_ROOT/dist/.tech-spec-format-version" \
  "@ido4/tech-spec-format" \
  "@ido4/tech-spec-format v"

check_bundle "yaml-vendor" \
  "$REPO_ROOT/hooks/lib/vendored/yaml.js" \
  "$REPO_ROOT/hooks/lib/vendored/.yaml-version" \
  "js-yaml" \
  "@ido4/vendored js-yaml v" \
  "scripts/update-yaml-vendor.sh"

check_bundle "mustache-vendor" \
  "$REPO_ROOT/hooks/lib/vendored/mustache.js" \
  "$REPO_ROOT/hooks/lib/vendored/.mustache-version" \
  "mustache" \
  "@ido4/vendored mustache v" \
  "scripts/update-mustache-vendor.sh"

echo ""

# ─── Pre-flight: Local vs remote sync ────────────────────

echo "Pre-flight: checking local vs origin/main..."
git fetch --quiet origin main 2>/dev/null || {
  echo "WARNING: Could not fetch origin/main (offline?). Skipping sync check."
  echo ""
}

if git rev-parse --verify origin/main >/dev/null 2>&1; then
  LOCAL_SHA=$(git rev-parse @)
  REMOTE_SHA=$(git rev-parse origin/main)
  BASE_SHA=$(git merge-base @ origin/main)

  if [ "$LOCAL_SHA" = "$REMOTE_SHA" ]; then
    echo "Pre-flight: local in sync with remote ✓"
  elif [ "$LOCAL_SHA" = "$BASE_SHA" ]; then
    AHEAD_COUNT=$(git rev-list --count @..origin/main)
    echo ""
    echo "ERROR: Your local main is behind origin/main by ${AHEAD_COUNT} commit(s)."
    echo ""
    echo "Commits on remote that you don't have locally:"
    git log --oneline @..origin/main | sed 's/^/  /'
    echo ""
    echo "To resolve, pull the missing commits and re-run the release:"
    echo "  git pull --ff-only origin main"
    echo "  bash scripts/release.sh ${BUMP_TYPE} \"${MESSAGE}\""
    exit 1
  elif [ "$REMOTE_SHA" = "$BASE_SHA" ]; then
    BEHIND_COUNT=$(git rev-list --count origin/main..@)
    echo "Pre-flight: local has ${BEHIND_COUNT} unpushed commit(s) ahead of remote — ok, continuing"
  else
    LOCAL_ONLY=$(git rev-list --count origin/main..@)
    REMOTE_ONLY=$(git rev-list --count @..origin/main)
    echo ""
    echo "ERROR: Local and remote main have diverged."
    echo ""
    echo "Your local has ${LOCAL_ONLY} commit(s) that aren't on remote AND"
    echo "remote has ${REMOTE_ONLY} commit(s) that aren't on local."
    echo ""
    echo "Local-only commits:"
    git log --oneline origin/main..@ | sed 's/^/  /'
    echo ""
    echo "Remote-only commits:"
    git log --oneline @..origin/main | sed 's/^/  /'
    echo ""
    echo "To resolve:"
    echo "  1. Inspect the remote commits above"
    echo "  2. Rebase your local work on top of remote:"
    echo "       git pull --rebase origin main"
    echo "  3. Re-run the release:"
    echo "       bash scripts/release.sh ${BUMP_TYPE} \"${MESSAGE}\""
    exit 1
  fi
fi
echo ""

# ─── Pre-flight: Plugin validation suite ─────────────────

echo "Pre-flight: running plugin validation suite..."
VALIDATE_LOG=$(mktemp)
if ! bash "$REPO_ROOT/tests/validate-plugin.sh" > "$VALIDATE_LOG" 2>&1; then
  echo "ERROR: Plugin validation failed. Aborting release."
  echo ""
  echo "--- Last 40 lines of validation output ---"
  tail -40 "$VALIDATE_LOG"
  echo ""
  echo "Full log: $VALIDATE_LOG"
  exit 1
fi
PASS_COUNT=$(grep -c "✓" "$VALIDATE_LOG" 2>/dev/null) || PASS_COUNT=0
rm -f "$VALIDATE_LOG"
echo "Pre-flight: plugin validation ✓ ($PASS_COUNT checks passed)"

echo "Pre-flight: running MCP compatibility test..."
COMPAT_LOG=$(mktemp)
if ! node "$REPO_ROOT/tests/compatibility.mjs" > "$COMPAT_LOG" 2>&1; then
  echo "ERROR: MCP compatibility test failed. Aborting release."
  echo ""
  echo "--- Last 40 lines of compatibility output ---"
  tail -40 "$COMPAT_LOG"
  echo ""
  echo "Full log: $COMPAT_LOG"
  exit 1
fi
rm -f "$COMPAT_LOG"
echo "Pre-flight: MCP compatibility ✓"
echo ""

# ═══════════════════════════════════════════════════════════
# Layer 2 — Version bump, commit, tag, push
# ═══════════════════════════════════════════════════════════

if [ "$DRY_RUN" = true ]; then
  CURRENT_VERSION=$(python3 -c "import json; print(json.load(open('.claude-plugin/plugin.json'))['version'])")
  echo "==========================================="
  echo "DRY RUN — pre-flight passed"
  echo "==========================================="
  echo "Current version: $CURRENT_VERSION"
  echo "Bump type: $BUMP_TYPE"
  echo "Message: $MESSAGE"
  echo ""
  echo "To release for real:"
  echo "  bash scripts/release.sh ${BUMP_TYPE} \"${MESSAGE}\""
  exit 0
fi

# Read current version
CURRENT_VERSION=$(python3 -c "import json; print(json.load(open('.claude-plugin/plugin.json'))['version'])")
echo "Current version: $CURRENT_VERSION"

# Bump version
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"
case "$BUMP_TYPE" in
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  patch) PATCH=$((PATCH + 1)) ;;
  *) echo "Usage: release.sh [patch|minor|major] \"message\""; exit 1 ;;
esac
NEW_VERSION="$MAJOR.$MINOR.$PATCH"
echo "New version: $NEW_VERSION"

# Update plugin.json
python3 -c "
import json
with open('.claude-plugin/plugin.json', 'r') as f:
    data = json.load(f)
data['version'] = '$NEW_VERSION'
with open('.claude-plugin/plugin.json', 'w') as f:
    json.dump(data, f, indent=2)
    f.write('\n')
"

# Update package.json
python3 -c "
import json
with open('package.json', 'r') as f:
    data = json.load(f)
data['version'] = '$NEW_VERSION'
with open('package.json', 'w') as f:
    json.dump(data, f, indent=2)
    f.write('\n')
"

# Cross-version coherence check (after bump, before commit)
PKG_VER=$(python3 -c "import json; print(json.load(open('package.json'))['version'])")
PLUGIN_VER=$(python3 -c "import json; print(json.load(open('.claude-plugin/plugin.json'))['version'])")
if [ "$PKG_VER" != "$PLUGIN_VER" ]; then
  echo "ERROR: Version drift after bump — package.json=$PKG_VER, plugin.json=$PLUGIN_VER"
  echo "This is a bug in the release script. Aborting."
  exit 1
fi
echo "Version coherence: $PKG_VER ✓"

# Commit to ido4dev repo
git add .claude-plugin/plugin.json package.json
git commit -m "release v$NEW_VERSION — $MESSAGE"
git tag "v$NEW_VERSION"
git push origin main --tags

echo ""
echo "==========================================="
echo "Released ido4dev v${NEW_VERSION}"
echo "==========================================="
echo ""
echo "CI will automatically:"
echo "  1. Run validation tests (Validate Plugin)"
echo "  2. Sync to ido4-plugins marketplace (if catalogued)"
echo "  3. Create GitHub release"
