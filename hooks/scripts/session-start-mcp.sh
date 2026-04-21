#!/bin/bash
# SessionStart hook: install @ido4/mcp dependencies when package.json changes.
#
# Graceful degradation: if anything fails, emit a user-visible warning to stderr
# and exit 0 so the session continues with whatever surface is still usable.
# The plugin never leaves the user with a silent dead state.
#
# Principle: §2.7 of ~/dev-projects/ido4-suite/docs/hook-and-rule-strategy.md.

set -u

if [ -z "${CLAUDE_PLUGIN_ROOT:-}" ] || [ -z "${CLAUDE_PLUGIN_DATA:-}" ]; then
  echo "WARNING: CLAUDE_PLUGIN_ROOT or CLAUDE_PLUGIN_DATA not set; skipping MCP install." >&2
  exit 0
fi

# Skip install if package.json hasn't changed since last session
if diff -q "${CLAUDE_PLUGIN_ROOT}/package.json" "${CLAUDE_PLUGIN_DATA}/package.json" >/dev/null 2>&1; then
  exit 0
fi

# Copy current package.json and install
if ! cp "${CLAUDE_PLUGIN_ROOT}/package.json" "${CLAUDE_PLUGIN_DATA}/package.json" 2>/dev/null; then
  echo "WARNING: Failed to stage package.json into ${CLAUDE_PLUGIN_DATA}. MCP tools may not be available." >&2
  exit 0
fi

if ! (cd "${CLAUDE_PLUGIN_DATA}" && npm install --production 2>&1); then
  # Install failed: clean up so next session retries, warn the user, continue the session.
  rm -f "${CLAUDE_PLUGIN_DATA}/package.json" 2>/dev/null
  echo "" >&2
  echo "WARNING: @ido4/mcp install failed. MCP tools will not be available this session." >&2
  echo "Remediation: cd \"${CLAUDE_PLUGIN_DATA}\" && npm install --production" >&2
  exit 0
fi

exit 0
