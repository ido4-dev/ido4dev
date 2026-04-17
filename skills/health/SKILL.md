---
name: health
description: Quick multi-dimensional governance dashboard — one-line GREEN/YELLOW/RED verdict with key metrics across flow, compliance, and team health. Methodology-aware — adapts to Hydro (wave health, blockers, compliance grade), Scrum (Sprint Goal achievement risk + burndown), or Shape Up (circuit breaker proximity + ship rate) based on the active profile. Use for the 5-second project pulse check; for deeper analysis use /ido4dev:standup or /ido4dev:compliance.
allowed-tools: Bash(node *)
---

!`node "${CLAUDE_PLUGIN_DATA}/node_modules/@ido4/mcp/dist/render-prompt-cli.js" health "$ARGUMENTS"`
