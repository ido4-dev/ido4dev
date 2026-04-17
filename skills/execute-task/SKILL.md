---
name: execute-task
description: Methodology-aware task execution guidance for a specific issue. Delivers specs-driven reasoning that adapts to the active methodology — Hydro (Epic Integrity, wave-scope discipline), Scrum (DoD compliance, Sprint Goal alignment, story point tracking), or Shape Up (appetite, scope hammering, hill chart progress). Use when the user is about to start implementing a specific task.
argument-hint: [issue-number]
allowed-tools: Bash(node *)
---

!`node "${CLAUDE_PLUGIN_DATA}/node_modules/@ido4/mcp/dist/render-prompt-cli.js" execute-task "$ARGUMENTS"`
