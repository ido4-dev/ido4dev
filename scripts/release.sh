#!/bin/bash
# Release script for ido4dev plugin.
# Usage: bash scripts/release.sh [patch|minor|major] "Release message"
#
# Bumps version in plugin.json, commits, and syncs to ido4-plugins marketplace.

set -euo pipefail

BUMP_TYPE="${1:-patch}"
MESSAGE="${2:-Release}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
MARKETPLACE_DIR="$(dirname "$REPO_ROOT")/ido4-plugins"

cd "$REPO_ROOT"

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

# Commit to ido4dev repo
git add -A
git commit -m "release v$NEW_VERSION — $MESSAGE"
git tag "v$NEW_VERSION"
git push origin main --tags

echo "ido4dev v$NEW_VERSION released"

# Sync to marketplace
if [ -d "$MARKETPLACE_DIR" ]; then
  echo "Syncing to ido4-plugins marketplace..."
  python3 -c "
import json
with open('$MARKETPLACE_DIR/.claude-plugin/marketplace.json', 'r') as f:
    data = json.load(f)
for plugin in data['plugins']:
    if plugin['name'] == 'ido4dev':
        plugin['version'] = '$NEW_VERSION'
with open('$MARKETPLACE_DIR/.claude-plugin/marketplace.json', 'w') as f:
    json.dump(data, f, indent=2)
    f.write('\n')
"
  cd "$MARKETPLACE_DIR"
  git add -A
  git commit -m "sync ido4dev v$NEW_VERSION"
  git push origin main
  echo "Marketplace synced"
else
  echo "Marketplace repo not found at $MARKETPLACE_DIR — sync manually"
fi

echo "Done."
