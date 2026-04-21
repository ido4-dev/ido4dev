#!/bin/bash
# SessionStart hook: copy bundled tech-spec-validator.js to CLAUDE_PLUGIN_DATA.
#
# Used by skills/ingest-spec Stage 0b for fail-fast structural pre-validation.
# Graceful: if the copy fails, ingest-spec's "bundle unavailable" branch handles it.

set -u

if [ -z "${CLAUDE_PLUGIN_ROOT:-}" ] || [ -z "${CLAUDE_PLUGIN_DATA:-}" ]; then
  exit 0
fi

SRC="${CLAUDE_PLUGIN_ROOT}/dist/tech-spec-validator.js"
DST="${CLAUDE_PLUGIN_DATA}/tech-spec-validator.js"

if [ ! -f "$SRC" ]; then
  echo "WARNING: tech-spec-validator.js not found at $SRC; ingest-spec pre-validation disabled this session." >&2
  exit 0
fi

if ! cp "$SRC" "$DST" 2>/dev/null; then
  echo "WARNING: Failed to copy tech-spec-validator.js to $DST; ingest-spec pre-validation disabled this session." >&2
  exit 0
fi

exit 0
