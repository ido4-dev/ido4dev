---
name: review
description: Methodology-aware review ceremony — inspect deliverables, assess outcomes, gather stakeholder feedback on a completed container. Adapts to Hydro (Wave Review), Scrum (Sprint Review — inspection and adaptation), or Shape Up (Cycle Demo with ship/kill accounting) based on the active profile. Use when the user wants to review a completed wave/sprint/cycle, demo work to stakeholders, or feed outcomes into the next planning cycle.
argument-hint: [container-name]
allowed-tools: Bash(node *)
---

!`node "${CLAUDE_PLUGIN_DATA}/node_modules/@ido4/mcp/dist/render-prompt-cli.js" review "$ARGUMENTS"`
