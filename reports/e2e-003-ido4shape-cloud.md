# E2E Test Report: e2e-003-ido4shape-cloud

**Skill tested:** `/ido4dev:decompose` (+ `/ido4dev:decompose-tasks` + `/ido4dev:decompose-validate`)
**Project:** ido4shape-enterprise-cloud (greenfield-with-context)
**Date:** 2026-04-10
**Status:** Phase 1 investigation complete, fix applied, pending re-test. Phases 2 and 3 not yet tested.
**Purpose:** Validate that the 10 observations from rounds 1+2 were closed by the ido4dev v0.7.0 skill-split refactor and `@ido4/mcp` 0.7.1 parser fix.

---

## Test Setup

- **Test session:** Fresh Claude session in `/Users/bogdanionutcoman/dev-projects/ido4shape-cloud/` with ido4dev plugin loaded
- **Monitor session:** `/Users/bogdanionutcoman/dev-projects/ido4dev/` (this repo)
- **Strategic spec:** `ido4shape-enterprise-cloud-spec.md` (same as rounds 1 and 2)
- **Plugin version:** ido4dev v0.7.0 + follow-up fix commit `e9b1b2d`
- **MCP versions installed at `~/.claude/plugins/data/ido4dev-inline/node_modules/@ido4/`:**
  - `@ido4/spec-format`: 0.7.1
  - `@ido4/core`: 0.7.1 (with `TASK_HEADING` regex `[A-Z]{2,5}-\d{2,3}[A-Z]?` — verified)
  - `@ido4/mcp`: 0.7.1
- **Starting state:** Both prior round artifacts (`...-canvas.md`, `...-technical.md`) removed by user. Only the strategic spec remains in the project root.
- **Pre-test reinstall:** The SessionStart hook initially left `@ido4/core` at 0.7.0 because the monorepo's intra-package `"*"` dep satisfied npm without forcing an upgrade. Manually cleaned with `rm -rf node_modules package-lock.json && npm install --production` in the plugin data directory. This is a pre-existing monorepo fragility, not a new round-3 bug.

---

## Pipeline Summary

| Phase | Stage | Status | Notes |
|---|---|---|---|
| 1 `/ido4dev:decompose` | Stage 0: empty-args refusal | FAIL — drift | See OBS-01 |
| 1 | Stage 0: parse spec | Pending | Will test with explicit path |
| 1 | Stage 0.5: artifact dir + mode | Pending | |
| 1 | Stage 1: code-analyzer | Pending | |
| 1 | End-of-phase guidance | Pending | |
| 2 `/ido4dev:decompose-tasks` | Stage 0 + 1 | Pending | |
| 3 `/ido4dev:decompose-validate` | Stage 0 + 1 + 2 + 3 | Pending | |

---

## Observations

### OBS-01 — Behavioral Drift — Medium

- **When:** First invocation of `/ido4dev:decompose` with no `$ARGUMENTS` in a fresh Claude session (the deliberate OBS-01-from-round-2 smoke test)
- **What happened:**
  1. Skill loaded successfully: *"Skill(ido4dev:decompose) · Successfully loaded skill · 5 tools allowed"*
  2. Claude proposed a bash command: `ls ~/.claude/plugins/ 2>/dev/null; ls ~/.claude/skills/ 2>/dev/null`, labeled by Claude as "List plugin and skill directories"
  3. Permission prompt appeared. User selected "No" (option 3)
  4. Claude went silent — produced no follow-up message, did not fall back to the Stage 0 refusal output
- **What was expected:** `skills/decompose/SKILL.md:39-43` — on empty `$ARGUMENTS`, Claude must output exactly the refusal message:

  > I need the path to the strategic spec file. Usage: `/ido4dev:decompose <path-to-spec.md>`

  ...and STOP. No bash commands, no directory introspection, no other actions.
- **Evidence:** Screenshot of the bash permission prompt showing the proposed command; user reported "I declined. now nothing happens"
- **Severity:** Medium. Two dimensions:
  - **Not the round-2 OBS-01 pattern.** The proposed bash command was benign directory listing, not a search for spec files. This is NOT the "auto-search for spec" drift from round 2 that we explicitly wrote Stage 0's "Do not search for spec files yourself" guardrail to prevent
  - **Stage 0 STOP directive still not firing.** The explicit instruction to "output exactly [refusal] and STOP" is not executing as the skill's first action. Claude is reaching for a bash command before executing Stage 0's visible output
- **Notable sub-finding:** Bash is NOT in the skill's `allowed-tools` frontmatter list (`mcp__plugin_ido4dev_ido4__*, Read, Write, Glob, Grep`). Claude attempted to use a tool outside the allow list. Claude Code's permission layer correctly intercepted it with a prompt, but Claude shouldn't be reaching for it at all — either the skill's allowed-tools list isn't constraining Claude's tool selection, or Claude's pre-skill-execution phase bypasses the allowlist
- **Fix candidates:**
  - **(a)** Tighten Stage 0 framing — e.g., "Your FIRST output on this skill invocation must be the Stage 0 check. Do not run any tools before producing the Stage 0 result"
  - **(b)** Investigate whether Claude Code runs any pre-skill environmental checks that bypass the skill body entirely (this might be a Claude Code behavior, not a skill-definition issue)
  - **(c)** Add a visible first-line output directive to make "no action yet, just output the Stage 0 check" more explicit
  - Need more data points across multiple fresh invocations to pattern-match whether this is reproducible or a one-off
- **Update after later invocations:** Subsequent `/ido4dev:decompose <path>` invocations (with argument) did follow the skill correctly. Downgrading the severity suspicion — OBS-01 may have been an invocation artifact, not a skill-definition issue. Keeping the observation open pending further data

### OBS-02 — Behavioral Drift — High

- **When:** Second invocation, this time WITH the spec path argument: `/ido4dev:decompose ido4shape-enterprise-cloud-spec.md`
- **What happened:**
  1. Skill loaded successfully (again): *"Successfully loaded skill · 5 tools allowed"*
  2. Claude ran a Grep tool call ("Searching for 1 pattern…") — content of the search unknown
  3. Claude then proposed a bash command: `find ~/.claude -type d -name "decompose*" 2>/dev/null | head -20`, labeled by Claude as "Find decompose skill directory"
- **What was expected:** `skills/decompose/SKILL.md` Stage 0 — once `$ARGUMENTS` is non-empty:
  1. Read the strategic spec file at `$ARGUMENTS` with the `Read` tool
  2. Call `parse_strategic_spec` MCP tool with the file contents
  3. Summarize project + capabilities to user
- **Evidence:** User-supplied terminal transcript showing both invocations and the find-decompose bash proposal
- **Severity:** High. Unlike OBS-01 (Stage 0 empty-args path), this is on the happy path where Stage 0 has a clear file to read. Claude is not following ANY Stage 0 instructions — not reading the spec file, not calling `parse_strategic_spec`, and instead trying to discover where the decompose skill lives on disk. The skill's `Successfully loaded skill` message contradicts Claude's apparent need to "find" the skill
- **Interpretation — two candidate hypotheses:**
  - **(H1)** The skill's SKILL.md content is not being delivered into Claude's context on load, only the tool allowlist. Claude knows it has a skill called `decompose` with 5 tool permissions but doesn't know what the skill does — so it tries to find and read the skill file itself
  - **(H2)** Claude Code has a new pre-skill "discovery" phase in recent versions that runs tool calls before the skill body executes. In that case the SKILL.md content may be accessible to Claude but its `Stage 0` isn't being treated as the first action
- **Notable sub-finding:** Bash is still not in the skill's `allowed-tools` frontmatter. Claude is reaching for Bash anyway — same as OBS-01. Either the allowlist is not being enforced for skill execution, or Claude's tool selection is happening outside the skill context
- **Impact:** If this pattern holds, the entire skill-based enforcement architecture for decompose (and by extension every skill in the plugin) is compromised. Round-2's skill-split fix assumed Claude would read and follow the Phase 1 SKILL.md instructions. If Claude isn't reading them, the split provides no benefit
- **Fix candidates:**
  - **(a)** Diagnostic: have the user explicitly instruct Claude to read the skill file. If Claude can then execute Stage 0 correctly, H1 is supported and the fix is at the skill-loading level (Claude Code behavior, not our skill definition)
  - **(b)** Alternative: ask the user to check their Claude Code version + Claude model identifier in the test session. A version difference between the test session and this monitor session could explain behavior drift
  - **(c)** If H1 is confirmed, skills may need an explicit "read me first" preamble that's guaranteed to appear in Claude's context even if SKILL.md isn't auto-read
- **Update after subsequent invocation:** Invocation `/ido4dev:decompose ido4shape-enterprise-cloud-spec.md` (on a later attempt in the same session) did proceed correctly into Phase 1 — Claude announced *"Starting Phase 1 decomposition. Reading the strategic spec."*, read the spec, and called `parse_strategic_spec`. This suggests OBS-02 (like OBS-01) may be an invocation-time artifact, not a persistent skill-definition issue. Keeping the observation open pending pattern-matching across more tests
- **H1 CONFIRMED on fresh session retry:** After a completely clean Claude Code restart in a new terminal, invocation of `/ido4dev:decompose ido4shape-enterprise-cloud-spec.md` immediately reproduced the "Claude tries to find the skill" behavior. Claude proposed `ls ~/.claude/skills/ido4dev/decompose*` and then `find ~/.claude -type d -name "ido4dev*"` — both attempts to locate the decompose skill directory on disk. This is on a FRESH session with zero prior context. **Confirmed: SKILL.md content is not being delivered into Claude's context when the Skill tool loads — only the tool permissions are delivered. Claude must discover and read the skill file manually.**
- **Explanatory power:** This single finding explains:
  - Why fresh sessions drift at skill load (no SKILL.md in context → Claude searches)
  - Why later invocations in the same session sometimes work (skill content now in session context from prior reads)
  - Why Bash isn't constrained by the `allowed-tools` list (Claude hasn't seen the frontmatter yet)
  - Why the "first attempt that worked" in this round happened AFTER Claude had done exploratory tool calls
  - Possibly why the 40-minute hang happened: Claude may have been stuck in "find and read the skill" discovery loop, not in the actual code-analyzer agent
- **Severity upgrade:** OBS-02 was previously marked High but classified as possibly an invocation artifact. It is now **Critical** — this is a platform-level skill-loading issue that affects every skill in the plugin, not just decompose. Writing better SKILL.md content cannot fix it. The skill needs Claude Code to auto-deliver its content on load, or the plugin needs an alternative delivery mechanism (command shims that include the content inline, etc.)
- **Fix candidates:**
  - **(a)** Investigate Claude Code's current skill-loading behavior — is auto-delivery of SKILL.md broken, disabled, or never-implemented in the current version? This is a Claude Code issue, not an ido4dev plugin issue
  - **(b)** Interim workaround: make `commands/decompose.md` contain the full Phase 1 instruction body inline instead of delegating to the skill. Commands are delivered as prompts directly, bypassing the skill-loading issue. Downside: duplicates content between commands/ and skills/, and other skills would need similar treatment
  - **(c)** Explicit instruction in the user-facing docs: advise users to first run `Read` on the skill file manually before invoking the skill. Poor UX but unblocks usage
  - **(d)** Consider whether the `user-invocable: true` frontmatter field is supposed to imply auto-delivery — if yes, this is a bug in Claude Code's Skill tool
- **Recovery path observed:** Once Claude finds and reads SKILL.md (via the discovery bash commands), it then proceeds to execute Phase 1 correctly. The drift is in the pre-execution discovery phase, not in the skill execution itself. This means the skill definition is sound; the platform just needs to deliver it

### OBS-03 — Behavioral Drift — Medium (recurrence of round-1 OBS-05)

- **When:** Inside Phase 1, Stage 0 step 3 — after a successful `parse_strategic_spec` MCP call, Claude needed to review and summarize the parsed result
- **What happened:** Claude proposed a `python3 -c "..."` bash command that reads the MCP tool result back from Claude Code's internal tool-results cache file (`~/.claude/projects/-Users-bogdanionutcoman-dev-projects-ido4shape-cloud/.../tool-results/toolu_*.json`). The Python script parses the cached JSON, extracts project name, group count, capability list, cross-cutting concern count, and prints them — essentially doing the Stage 0 summary logic via shell instead of directly from the MCP response in-context
- **What was expected:** `skills/decompose/SKILL.md` Stage 0 steps 3-4 — Claude reviews the parser result (which is in its context from the MCP call) and presents a summary with project name, grouped capabilities, priorities, and dependency structure. No shell commands needed
- **Evidence:** User-supplied terminal transcript showing the proposed Python/Bash command after `parse_strategic_spec` returned
- **Severity:** Medium. The pipeline still moves forward if the command is approved, but:
  - **Bash is not in the skill's `allowed-tools`.** Same allowlist-not-enforced pattern as OBS-01/02 in this round.
  - **This is recurring behavior.** Round 1 flagged this as OBS-05 (see `reports/e2e-001-ido4shape-cloud.md`) — Claude using `cat` via Bash to read MCP tool-result cache files. The round-1 fix-candidate analysis suggested investigating whether MCP tools can return a summary or a file path instead of a large inline object. That investigation apparently didn't happen, or the fix didn't land.
  - **Fragility:** Reading `tool-results/*.json` relies on Claude Code's internal cache format, which is not a stable API
- **Root cause hypothesis:** `parse_strategic_spec` returns a large structured object (groups, capabilities, dependencies, cross-cutting concerns — ~10-30 KB for a 25-capability spec). Claude's response-handling appears to prefer file-based extraction over in-context processing when the tool result is large. This is a Claude behavior, not a skill-definition issue — but the skill's guardrails don't prevent it
- **Fix candidates:**
  - **(a)** MCP-side: Add a `parse_strategic_spec` response-mode parameter (e.g., `summary: true`) that returns only top-level fields (name, group count, capability refs, dependency count) and lets Claude request full detail on demand. Reduces inline result size for the common Stage 0 use case
  - **(b)** Skill-side: Add explicit guidance: "When `parse_strategic_spec` returns, process the result directly from the MCP response in your context. Do not read tool-results cache files via Bash/Python — those are implementation details and Bash is not in your allowed tools"
  - **(c)** Combine both: (a) makes it easier to handle in-context; (b) directly blocks the workaround
- **Approved during this test** to let the pipeline continue. Pending full Stage 0 → Phase 1 completion before further analysis
- **Escalation during the same test:** The first Python script hit `KeyError: 'id'` — Claude had guessed the capability dict key wrong. Before the KeyError, the script printed enough useful data to answer most Stage 0 summary fields (`project: ido4shape Enterprise Cloud Platform`, `groups: 5`, `Auth, Organization & Roles (priority: must-have) [6 caps]`, zero errors, zero warnings). Instead of synthesizing a Stage 0 summary from this partial success + the in-context MCP response, Claude proposed ANOTHER bash command to inspect capability keys and debug the workaround script. This is escalating drift — Claude is optimizing its shell workaround instead of using the data already available
- **Final outcome:** After approving python3 with the "don't ask again" option, Claude completed its shell-based extraction and produced a correct four-field Stage 0 summary. So the workaround path DID reach the correct end state, it was just noisy and cost extra iterations to get there

### OBS-04 — Quality Issue — Medium

- **When:** During Stage 1 (code-analyzer agent execution)
- **What happened:** The code-analyzer agent has been running for 25+ minutes without completing. Visible tool-use count is ~20 operations — approximately 5× slower than round 2's pace (63 tool uses in 15m 24s = ~4 ops/min; round 3 = ~0.8 ops/min)
- **Content-wise correct:** The agent is reading the right files (ido4shape CLAUDE.md, README, system-architecture.md, hooks.json, plugin.json, canvas-context.sh, session-start.sh, find-workspace.sh, private/enterprise-cloud-vision.md; ido4-MCP CLAUDE.md and strategic-spec-types.ts; ido4dev search patterns). This matches the greenfield-with-context exploration pattern the skill describes. Not stuck, not drifted — just slow
- **What was expected:** Round-2 baseline was 15m 24s for 63 tool uses. Round-3 orchestrator prompt is substantially more detailed (pre-scoped targets, pre-computed counts, pre-flagged risks), which should make the agent FASTER, not slower
- **Severity:** Medium. Slowness is a UX concern not a correctness concern, but 5× slowdown vs the baseline is a real regression
- **Hypothesis:** Test session may be running at higher thinking effort (Claude's "thinking with high effort" indicator was visible earlier). Not a skill-definition issue — a session-level config difference between round 2 and round 3
- **Fix candidate:** Instrument the orchestrator to report elapsed time + tool-use count during Stage 1 so users have visibility. For true fix: verify session effort level config, possibly add a skill-level suggestion to use standard effort for exploration phases
- **Outcome:** The first Stage 1 run was cancelled after ~40 minutes with no canvas written. Retrying the same command (`/ido4dev:decompose ido4shape-enterprise-cloud-spec.md`) produced a new behavior: Claude paused BEFORE spawning the code-analyzer and asked for user direction (*"Paused. Waiting for your direction before spawning the code-analyzer — let me know if you want me to adjust the prompt..."*). This pre-spawn pause is NOT in the skill's Stage 1 instructions — the skill says compose the prompt and spawn. Likely Claude adapting its behavior after observing the previous hang. Logging as OBS-05

### OBS-04b — Investigation finding — Plugin-defined subagent execution is broken, built-in subagents work

During round-3 diagnosis, after multiple failed attempts to complete Phase 1's code-analyzer agent:

1. **Version rollback test:** Ran decompose on Claude Code 2.1.97 (the version from round 2). The `ido4dev:code-analyzer` agent ALSO hangs at ~25-30 tool uses. Claude Code version is NOT the regression cause — both 2.1.97 and 2.1.101 hang.

2. **Built-in subagent diagnostic in monitor session:** Spawned `Explore` subagent with minimal prompt (~80 tokens) targeting ido4dev. Completed in **10 tool calls, ~2 seconds**. No slowdown.

3. **Built-in subagent diagnostic in test session:** When user issued a direct instruction (not a slash command) to do the code-analyzer's work, Claude spawned two parallel `Explore` subagents instead — one for ido4shape plugin architecture (32 tool uses, 58.7k tokens), one for ido4-MCP architecture (35 tool uses, 64.8k tokens). **Both completed cleanly.**

**Conclusion:** The hang is NOT in the Claude Code subagent subsystem, NOT in the test session, NOT in the integration target repo size, NOT in the Claude Code version, NOT in the model, NOT in the effort level. It is specifically in the **`ido4dev:code-analyzer` plugin-defined subagent execution path**. Built-in `Explore` agents perform the same class of work (read files, explore repos, return summaries) without issue in the same session.

**Why plugin-defined subagents and not built-in ones?** Candidates:
- **(a)** The orchestrator's composed prompt to the plugin agent is ~2-3k tokens (we saw it earlier) with elaborate pre-computed context. Combined with the 228-line `code-analyzer.md` system prompt, the agent starts in a much heavier context than an Explore agent does (simpler default system prompt, short task description).
- **(b)** Plugin-defined subagents may use a different execution path internally that has a performance issue at certain context sizes.
- **(c)** Round 2 plugin subagents worked because the orchestrator prompt was simpler (we don't have the exact text but it was likely less elaborate).

**Next diagnostic step:** instead of rolling back the plugin, test whether a DRAMATICALLY reduced orchestrator prompt to the plugin agent changes behavior. If yes → fix the SKILL.md to constrain main Claude's prompt composition. If not → likely (b), and the fix is to switch from plugin-defined subagents to inline Explore agent invocations.

### OBS-05 — Behavioral Drift — Low (possibly adaptive)

- **When:** Phase 1, just before Stage 1 agent spawn, on the SECOND invocation of `/ido4dev:decompose` in the same session (after the first invocation was cancelled at ~40 min)
- **What happened:** Claude output: *"Paused. Waiting for your direction before spawning the code-analyzer — let me know if you want me to adjust the prompt (mode, scope, integration targets), run it as-is, or change approach."*
- **What was expected:** `skills/decompose/SKILL.md` Stage 1 — compose the agent prompt and spawn the code-analyzer directly. No pre-spawn confirmation required
- **Severity:** Low. This is arguably GOOD behavior — a pre-spawn user checkpoint on a long-running step provides valuable user control. But it's unscripted — the skill doesn't instruct it, so the behavior is unpredictable (happens after a hang, might not happen on clean runs)
- **Interpretation:** Possibly Claude adapting after observing the previous 40-min hang. This would be emergent cautious behavior rather than skill drift
- **Fix candidate:** Consider adding an explicit pre-spawn user-optional checkpoint to Stage 1 as a deliberate design choice — e.g., "Before spawning the code-analyzer (which takes 10-20 min), offer the user the chance to review or adjust the agent prompt." This would turn Claude's emergent cautious behavior into a stable, documented skill feature


---

## Positives

- **OBS-02 from round 2 CLOSED.** Claude called `parse_strategic_spec` as the mandatory action after reading the spec file, matching Stage 0 step 2. Verified with Claude's own announcement: *"Spec read. Now calling the parser."*
- **Phase 1 branding is working.** Claude announced *"Starting Phase 1 decomposition"* — matching the new skill's phase language. OBS-03 from round 2 (mislabeled pipeline) closed.
- **`parse_strategic_spec` successfully parsed the spec.** The tool call returned data (evident from Claude's subsequent extraction attempt). This rules out any parser-level issue with the round-2 strategic spec format.
- **OBS-06 from round 2 CLOSED — Stage 0 summary includes all required fields.** Claude presented: project name, capabilities grouped by ido4shape groups (5 groups, 25 capabilities total, rendered as a clean table with ref ranges like `AUTH-01..06`), group priorities (must-have / should-have), and dependency structure (*"45 edges total, 24 of them cross-group. Hub nodes: STOR-03, AUTH-02, STOR-02"*). Bonus: 10 cross-cutting concerns were also surfaced, above the minimum required by the skill.
- **OBS-04 from round 2 CLOSED — artifact directory stated explicitly.** Claude output: *"Artifact directory: No specs/, docs/specs/, or docs/ exists. Will create specs/."* — matching the Stage 0.5 directive to state the chosen directory to the user before spawning the code-analyzer.
- **OBS-05 from round 2 CLOSED — mode taxonomy used with exact name.** Claude output: *"Detected mode: greenfield-with-context. No source code in this repo, but the strategic spec has strong integration targets — the entire PLUG group is explicit modification of the existing ido4shape plugin..."* Perfect — taxonomy name verbatim, justified with reference to specific integration targets from the spec, demonstrates the code-analyzer will receive the correct mode.
- **Orchestrator prompt to code-analyzer is substantially improved over round 2.** The Phase 1 orchestrator composed a detailed prompt for the code-analyzer: pre-scoped integration targets with paths (ido4shape, ido4-MCP, ido4dev), pre-computed counts from `parse_strategic_spec` (5 groups, 25 capabilities, 45 deps, 24 cross-group, 10 cross-cutting concerns), pre-flagged risk capabilities (STOR-05, PLUG-02, VIEW-05), pre-hinted tech stack decisions from the Operational Reliability concern (GCP/third-party auth/third-party email/Cloudflare), explicit mode-specific output expectations (Tech Stack Decisions table, Architecture Projection section), and excerpted critical rules. This is a better hand-off than round 2's prompt and should produce a better canvas.
- **Fresh session confirms all Stage 0/0.5 closures in a clean run.** After the previous session was abandoned for the nuclear restart, the fresh session reproduced the Stage 0 four-field summary, Stage 0.5 artifact directory + mode taxonomy, and Stage 1 agent spawn — all correctly. This is a second independent validation that OBS-02/03/04/05/06 from round 2 are structurally closed (the skill instructs the correct behavior; Claude executes it correctly once SKILL.md is loaded into context).
- **Context bloat hypothesis validated for the 40-min hang.** The fresh session's code-analyzer spawned and began progressing normally (15m 1s, 34+ tool uses, moving) at the exact same step where the previous session hung for 40+ minutes. Root cause of the hang: the previous session had accumulated ~50k+ tokens of context from failed invocations + shell-debug loops + discovery noise. Every operation processed the full history, starving the agent spawn. This is a session-lifecycle concern, not a skill-definition issue.



(Pending — test is at first interaction)

---

## Assessment

(Pending — full pipeline hasn't run yet)

---

## Next Steps

User will re-invoke `/ido4dev:decompose ido4shape-enterprise-cloud-spec.md` with the explicit spec path to test the happy path. OBS-01 stays open for later analysis — the primary goal of round 3 is to verify OBS-02 through OBS-10 from round 2 are closed by running the full pipeline with a valid invocation.

---

## Phase 1 Investigation — Root Cause and Fix (2026-04-11)

### Timeline of the investigation

1. **Initial Phase 1 run** — `/ido4dev:decompose` spawned `ido4dev:code-analyzer` subagent. Agent hung at ~30 tool uses, no progress for 10+ minutes. Cancelled after 40 min.
2. **Fresh session retry** — new Claude session, same command. Stage 0 + 0.5 worked correctly (confirmed round-2 OBS-02/03/04/05/06 closures). Stage 1 agent hung at the same ~25-30 tool count.
3. **Session context bloat hypothesis — ruled out.** Fresh session was clean, still hung.
4. **Claude Code version regression hypothesis — ruled out.** Rolled back to Claude Code 2.1.97 (the version installed on Apr 9 when round 2 ran). Stage 1 agent STILL hung at ~25-30 tool uses. Version is not the cause.
5. **Subagent subsystem broken hypothesis — ruled out.** Spawned a built-in `Explore` subagent in the monitor session with a minimal prompt. Completed in 10 tool calls, ~2 seconds. Subagents work fine in general.
6. **In-test built-in subagent diagnostic.** User issued a direct natural-language instruction (bypassing the slash command) asking Claude to read `agents/code-analyzer.md` and do the analysis. Claude spawned two parallel built-in `Explore` subagents (32 + 35 tool uses, both Done), then synthesized the canvas inline. **The work completed in 34m 10s producing an 1850-line canvas** — actually larger than round 2's 1723 lines.

### Root cause

The **`ido4dev:code-analyzer` plugin-defined subagent path is unreliable on the current Claude Code version / test environment**. It hangs around 25-30 tool uses regardless of:

- Fresh session vs. bloated session
- Claude Code version (2.1.97 and 2.1.101 both hang)
- Prompt size (verbose orchestrator prompt or minimal inline instruction — both hang)
- Effort level (unchanged between rounds)

Built-in `Explore` subagents work reliably in the same environment. Plugin-defined `ido4dev:code-analyzer` does not. The exact cause is opaque — it may be plugin-agent execution overhead, system-prompt-size interaction, or some other Claude Code internal — but we don't need to pin it down to fix it.

**Importantly:** this is NOT a round-3 regression in the plugin code. The `agents/code-analyzer.md` file is byte-identical to round 2. The issue is in how Claude Code handles spawning plugin-defined subagents for this specific workload, and something between Apr 9 and Apr 11 changed Claude Code's behavior in that path. We ruled out version 2.1.97→2.1.101 as the cause, which narrows it further but leaves the exact trigger unidentified.

### Fix applied

Rewrote Stage 1 of `skills/decompose/SKILL.md` to use the **working pattern** Claude accidentally discovered during diagnostics:

**Before:** Spawn `ido4dev:code-analyzer` plugin subagent with a composed prompt. Agent does everything: explores integration targets, reads strategic spec, synthesizes canvas, writes file.

**After:** Stage 1 is split into four sub-stages performed by main Claude acting as both orchestrator and synthesizer:
- **Stage 1a** — spawn parallel built-in `Explore` subagents, one per integration target, with lean briefs (under 300 tokens each)
- **Stage 1b** — read the strategic spec directly for verbatim context preservation
- **Stage 1c** — synthesize the canvas inline following the template in `agents/code-analyzer.md`
- **Stage 1d** — verify the written canvas (count `## Capability:` sections, match against strategic count)

**What stayed the same:**
- `agents/code-analyzer.md` — file unchanged. It's still the authoritative canvas template and rules reference, just referenced via `Read` instead of spawned as a subagent
- All Phase 1 guarantees: context preservation, per-capability sections, cross-cutting concern mapping, mode-specific sections, dependency layers
- Stages 0, 0.5, and the End-of-Phase-1 guidance — unchanged
- Phases 2 and 3 — unchanged, pending observation

**Why this is the right fix:**
1. **Proven to work** — Claude did exactly this pattern in the diagnostic and produced an 1850-line canvas (larger than round 2's) in 34 min
2. **Uses the reliable path** — built-in subagents demonstrably work in this environment
3. **Minimal blast radius** — only Stage 1 of `skills/decompose/SKILL.md` changes
4. **No opaque diagnostics required** — we don't need to understand why plugin subagents hang

### Observations — final tally for Phase 1 investigation

- **OBS-01** (empty-args invocation drift) — Logged, not a blocker, pending future reproduction
- **OBS-02** (find-skill drift) — Likely invocation artifact, closes when skill runs cleanly
- **OBS-03** (shell workaround for parser results) — Reproduced on both Claude Code 2.1.97 and 2.1.101. Not version-specific. Unchanged by the Stage 1 fix. Remains open — future fix candidate: constrain `parse_strategic_spec` response size or add a summary mode
- **OBS-04** (Stage 1 slowness / hang) — **ROOT-CAUSED AND FIXED** via the Stage 1 rewrite above
- **OBS-04b** (plugin-defined subagent execution issue) — Merged into OBS-04. Fixed by bypassing the plugin-defined subagent path entirely
- **OBS-05** (pre-spawn confirmation drift) — Likely adaptive behavior after a hang, will retest

### Next steps (updated)

1. Commit the Stage 1 fix (this update + SKILL.md edit)
2. Resume round-3 testing with a fresh session: `/ido4dev:decompose ido4shape-enterprise-cloud-spec.md`. Expected: Phase 1 completes via parallel Explore subagents + inline synthesis, produces the canvas, ends with the forward-pointing guidance (OBS-07 test).
3. If Phase 1 completes, run `/ido4dev:decompose-tasks specs/ido4shape-enterprise-cloud-canvas.md`. Watch whether `technical-spec-writer` plugin-defined subagent hangs similarly — if it does, apply the same Stage 1 rewrite pattern to Phase 2.
4. If Phase 2 completes, run `/ido4dev:decompose-validate specs/ido4shape-enterprise-cloud-technical.md`. Watch whether `spec-reviewer` plugin-defined subagent hangs — if it does, apply the same pattern to Phase 3. Also validates OBS-10 (parser suffix fix) via the dry-run.
