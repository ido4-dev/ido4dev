---
name: status
description: Show the current ido4dev governance status on demand — last compliance grade, open audit findings, compliance trajectory, recent AI-audit activity
user-invocable: true
allowed-tools: Bash
---

You show the user the plugin's governance resume banner on demand.

Claude Code injects the SessionStart banner into the AI's context but does not display it in the user's terminal (platform issue #24425). This skill is how users see that banner content whenever they ask.

## Execute Immediately When Invoked

Run the banner script in one Bash call and relay its output. The script lives in the plugin install; state lives in the plugin data directory (`CLAUDE_PLUGIN_DATA` is reliably set for hooks but may be empty in Bash-tool context, so derive it from the state file's location when unset):

```bash
DATA_DIR="$CLAUDE_PLUGIN_DATA"
if [ -z "$DATA_DIR" ]; then
  HOOKS_DIR=$(ls -d ~/.claude/plugins/data/*/hooks 2>/dev/null | head -1)
  [ -n "$HOOKS_DIR" ] && DATA_DIR=$(dirname "$HOOKS_DIR")
fi
OUT=$([ -n "$DATA_DIR" ] && CLAUDE_PLUGIN_DATA="$DATA_DIR" node "${CLAUDE_SKILL_DIR}/../../hooks/scripts/session-start-banner.js" 2>/dev/null)
echo "${OUT:-[ido4dev] No governance state yet — fresh project or no prior session activity.}"
```

## Presenting the result

Relay the banner lines to the user as-is — they are already formatted (resume line, compliance trajectory, open findings, last-session AI-audit summary; blocks are elided when empty by design).

If open audit findings are listed, add one sentence: the project-manager agent can investigate them (`/agents project-manager`). If the output is the no-state fallback, say so plainly — that is a healthy state for a fresh project, not an error.

Do not narrate the script invocation or re-interpret the data beyond this.
