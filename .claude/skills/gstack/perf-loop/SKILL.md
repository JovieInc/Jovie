---
name: perf-loop
preamble-tier: 2
version: 1.0.0
description: |
  MANUAL TRIGGER ONLY: invoke only when user types /perf-loop.
  Autonomous performance optimization loop. Fire and forget — runs until
  the page passes its Lighthouse/budget threshold. Measures, hypothesizes,
  optimizes, re-measures, keeps winners, reverts losers. Returns only on
  PASS, BLOCKED, or EXHAUSTED.
  Use when: "optimize performance", "perf loop", "make this page faster",
  "gmail loop", "improve lighthouse score", "reduce load time".
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - AskUserQuestion
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run gen:skill-docs -->

## Preamble (run first)

```bash
_UPD=$(~/.claude/skills/gstack/bin/gstack-update-check 2>/dev/null || .claude/skills/gstack/bin/gstack-update-check 2>/dev/null || true)
[ -n "$_UPD" ] && echo "$_UPD" || true
mkdir -p ~/.gstack/sessions
touch ~/.gstack/sessions/"$PPID"
_SESSIONS=$(find ~/.gstack/sessions -mmin -120 -type f 2>/dev/null | wc -l | tr -d ' ')
find ~/.gstack/sessions -mmin +120 -type f -delete 2>/dev/null || true
_CONTRIB=$(~/.claude/skills/gstack/bin/gstack-config get gstack_contributor 2>/dev/null || true)
_PROACTIVE=$(~/.claude/skills/gstack/bin/gstack-config get proactive 2>/dev/null || echo "true")
_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
echo "BRANCH: $_BRANCH"
echo "PROACTIVE: $_PROACTIVE"
source <(~/.claude/skills/gstack/bin/gstack-repo-mode 2>/dev/null) || true
REPO_MODE=${REPO_MODE:-unknown}
echo "REPO_MODE: $REPO_MODE"
_LAKE_SEEN=$([ -f ~/.gstack/.completeness-intro-seen ] && echo "yes" || echo "no")
echo "LAKE_INTRO: $_LAKE_SEEN"
_TEL=$(~/.claude/skills/gstack/bin/gstack-config get telemetry 2>/dev/null || true)
_TEL_PROMPTED=$([ -f ~/.gstack/.telemetry-prompted ] && echo "yes" || echo "no")
_TEL_START=$(date +%s)
_SESSION_ID="$$-$(date +%s)"
echo "TELEMETRY: ${_TEL:-off}"
echo "TEL_PROMPTED: $_TEL_PROMPTED"
mkdir -p ~/.gstack/analytics
echo '{"skill":"perf-loop","ts":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","repo":"'$(basename "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || echo "unknown")'"}'  >> ~/.gstack/analytics/skill-usage.jsonl 2>/dev/null || true
# zsh-compatible: use find instead of glob to avoid NOMATCH error
for _PF in $(find ~/.gstack/analytics -maxdepth 1 -name '.pending-*' 2>/dev/null); do [ -f "$_PF" ] && ~/.claude/skills/gstack/bin/gstack-telemetry-log --event-type skill_run --skill _pending_finalize --outcome unknown --session-id "$_SESSION_ID" 2>/dev/null || true; break; done
```

If `PROACTIVE` is `"false"`, do not proactively suggest gstack skills — only invoke
them when the user explicitly asks. The user opted out of proactive suggestions.

If output shows `UPGRADE_AVAILABLE <old> <new>`: read `~/.claude/skills/gstack/gstack-upgrade/SKILL.md` and follow the "Inline upgrade flow" (auto-upgrade if configured, otherwise AskUserQuestion with 4 options, write snooze state if declined). If `JUST_UPGRADED <from> <to>`: tell user "Running gstack v{to} (just updated!)" and continue.

If `LAKE_INTRO` is `no`: Before continuing, introduce the Completeness Principle.
Tell the user: "gstack follows the **Boil the Lake** principle — always do the complete
thing when AI makes the marginal cost near-zero. Read more: https://garryslist.org/posts/boil-the-ocean"
Then offer to open the essay in their default browser:

```bash
open https://garryslist.org/posts/boil-the-ocean
touch ~/.gstack/.completeness-intro-seen
```

Only run `open` if the user says yes. Always run `touch` to mark as seen. This only happens once.

If `TEL_PROMPTED` is `no` AND `LAKE_INTRO` is `yes`: After the lake intro is handled,
ask the user about telemetry. Use AskUserQuestion:

> Help gstack get better! Community mode shares usage data (which skills you use, how long
> they take, crash info) with a stable device ID so we can track trends and fix bugs faster.
> No code, file paths, or repo names are ever sent.
> Change anytime with `gstack-config set telemetry off`.

Options:
- A) Help gstack get better! (recommended)
- B) No thanks

If A: run `~/.claude/skills/gstack/bin/gstack-config set telemetry community`

If B: ask a follow-up AskUserQuestion:

> How about anonymous mode? We just learn that *someone* used gstack — no unique ID,
> no way to connect sessions. Just a counter that helps us know if anyone's out there.

Options:
- A) Sure, anonymous is fine
- B) No thanks, fully off

If B→A: run `~/.claude/skills/gstack/bin/gstack-config set telemetry anonymous`
If B→B: run `~/.claude/skills/gstack/bin/gstack-config set telemetry off`

Always run:
```bash
touch ~/.gstack/.telemetry-prompted
```

This only happens once. If `TEL_PROMPTED` is `yes`, skip this entirely.

## AskUserQuestion Format

**ALWAYS follow this structure for every AskUserQuestion call:**
1. **Re-ground:** State the project, the current branch (use the `_BRANCH` value printed by the preamble — NOT any branch from conversation history or gitStatus), and the current plan/task. (1-2 sentences)
2. **Simplify:** Explain the problem in plain English a smart 16-year-old could follow. No raw function names, no internal jargon, no implementation details. Use concrete examples and analogies. Say what it DOES, not what it's called.
3. **Recommend:** `RECOMMENDATION: Choose [X] because [one-line reason]` — always prefer the complete option over shortcuts (see Completeness Principle). Include `Completeness: X/10` for each option. Calibration: 10 = complete implementation (all edge cases, full coverage), 7 = covers happy path but skips some edges, 3 = shortcut that defers significant work. If both options are 8+, pick the higher; if one is ≤5, flag it.
4. **Options:** Lettered options: `A) ... B) ... C) ...` — when an option involves effort, show both scales: `(human: ~X / CC: ~Y)`

Assume the user hasn't looked at this window in 20 minutes and doesn't have the code open. If you'd need to read the source to understand your own explanation, it's too complex.

Per-skill instructions may add additional formatting rules on top of this baseline.

## Completeness Principle — Boil the Lake

AI makes completeness near-free. Always recommend the complete option over shortcuts — the delta is minutes with CC+gstack. A "lake" (100% coverage, all edge cases) is boilable; an "ocean" (full rewrite, multi-quarter migration) is not. Boil lakes, flag oceans.

**Effort reference** — always show both scales:

| Task type | Human team | CC+gstack | Compression |
|-----------|-----------|-----------|-------------|
| Boilerplate | 2 days | 15 min | ~100x |
| Tests | 1 day | 15 min | ~50x |
| Feature | 1 week | 30 min | ~30x |
| Bug fix | 4 hours | 15 min | ~20x |

Include `Completeness: X/10` for each option (10=all edge cases, 7=happy path, 3=shortcut).

## Contributor Mode

If `_CONTRIB` is `true`: you are in **contributor mode**. At the end of each major workflow step, rate your gstack experience 0-10. If not a 10 and there's an actionable bug or improvement — file a field report.

**File only:** gstack tooling bugs where the input was reasonable but gstack failed. **Skip:** user app bugs, network errors, auth failures on user's site.

**To file:** write `~/.gstack/contributor-logs/{slug}.md`:
```
# {Title}
**What I tried:** {action} | **What happened:** {result} | **Rating:** {0-10}
## Repro
1. {step}
## What would make this a 10
{one sentence}
**Date:** {YYYY-MM-DD} | **Version:** {version} | **Skill:** /{skill}
```
Slug: lowercase hyphens, max 60 chars. Skip if exists. Max 3/session. File inline, don't stop.

## Completion Status Protocol

When completing a skill workflow, report status using one of:
- **DONE** — All steps completed successfully. Evidence provided for each claim.
- **DONE_WITH_CONCERNS** — Completed, but with issues the user should know about. List each concern.
- **BLOCKED** — Cannot proceed. State what is blocking and what was tried.
- **NEEDS_CONTEXT** — Missing information required to continue. State exactly what you need.

### Escalation

It is always OK to stop and say "this is too hard for me" or "I'm not confident in this result."

Bad work is worse than no work. You will not be penalized for escalating.
- If you have attempted a task 3 times without success, STOP and escalate.
- If you are uncertain about a security-sensitive change, STOP and escalate.
- If the scope of work exceeds what you can verify, STOP and escalate.

Escalation format:
```
STATUS: BLOCKED | NEEDS_CONTEXT
REASON: [1-2 sentences]
ATTEMPTED: [what you tried]
RECOMMENDATION: [what the user should do next]
```

## Telemetry (run last)

After the skill workflow completes (success, error, or abort), log the telemetry event.
Determine the skill name from the `name:` field in this file's YAML frontmatter.
Determine the outcome from the workflow result (success if completed normally, error
if it failed, abort if the user interrupted).

**PLAN MODE EXCEPTION — ALWAYS RUN:** This command writes telemetry to
`~/.gstack/analytics/` (user config directory, not project files). The skill
preamble already writes to the same directory — this is the same pattern.
Skipping this command loses session duration and outcome data.

Run this bash:

```bash
_TEL_END=$(date +%s)
_TEL_DUR=$(( _TEL_END - _TEL_START ))
rm -f ~/.gstack/analytics/.pending-"$_SESSION_ID" 2>/dev/null || true
~/.claude/skills/gstack/bin/gstack-telemetry-log \
  --skill "SKILL_NAME" --duration "$_TEL_DUR" --outcome "OUTCOME" \
  --used-browse "USED_BROWSE" --session-id "$_SESSION_ID" 2>/dev/null &
```

Replace `SKILL_NAME` with the actual skill name from frontmatter, `OUTCOME` with
success/error/abort, and `USED_BROWSE` with true/false based on whether `$B` was used.
If you cannot determine the outcome, use "unknown". This runs in the background and
never blocks the user.

## Plan Status Footer

When you are in plan mode and about to call ExitPlanMode:

1. Check if the plan file already has a `## GSTACK REVIEW REPORT` section.
2. If it DOES — skip (a review skill already wrote a richer report).
3. If it does NOT — run this command:

\`\`\`bash
~/.claude/skills/gstack/bin/gstack-review-read
\`\`\`

Then write a `## GSTACK REVIEW REPORT` section to the end of the plan file:

- If the output contains review entries (JSONL lines before `---CONFIG---`): format the
  standard report table with runs/status/findings per skill, same format as the review
  skills use.
- If the output is `NO_REVIEWS` or empty: write this placeholder table:

\`\`\`markdown
## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | \`/plan-ceo-review\` | Scope & strategy | 0 | — | — |
| Codex Review | \`/codex review\` | Independent 2nd opinion | 0 | — | — |
| Eng Review | \`/plan-eng-review\` | Architecture & tests (required) | 0 | — | — |
| Design Review | \`/plan-design-review\` | UI/UX gaps | 0 | — | — |

**VERDICT:** NO REVIEWS YET — run \`/autoplan\` for full review pipeline, or individual reviews above.
\`\`\`

**PLAN MODE EXCEPTION — ALWAYS RUN:** This writes to the plan file, which is the one
file you are allowed to edit in plan mode. The plan file review report is part of the
plan's living status.

# /perf-loop — Autonomous Performance Optimization

You are a performance optimization agent. Your job is to make a page pass its
performance budget by iterating: measure, hypothesize, optimize, remeasure.
Keep winners, revert losers, repeat until green.

## OUTPUT POLICY — READ THIS FIRST

**You MUST include at least one tool call (Bash, Read, Edit, Glob, or Grep) in
EVERY response.** A text-only response ends the loop and wastes the user's time.

TERMINAL STATES (the ONLY responses that may be text-only):
- **PASS**: All target metrics meet their thresholds
- **BLOCKED**: Infrastructure failure preventing measurement
- **EXHAUSTED**: maxNoProgress consecutive rejected hypotheses with no remaining ideas

**Rules:**
- Do NOT say "shall I continue" or "let me know" or "would you like me to proceed"
- Do NOT produce interim summaries as standalone text
- Do NOT use AskUserQuestion mid-loop (only at INIT for mode confirmation, and at PASS to push threshold lower)
- Progress summaries go inside `echo` commands in Bash tool calls
- If you are tempted to explain what you just did, do it INSIDE the next tool call
- JUST PROCEED. Always.

---

## Step 0: Parse Arguments

Parse the user's input to determine mode and threshold:

| Input | Mode | Threshold |
|-------|------|-----------|
| `/perf-loop /app/dashboard/releases` or `/perf-loop dashboard` | `dashboard` | 100 (warm-shell ms) |
| `/perf-loop /` or `/perf-loop homepage` | `homepage` | 95 (Lighthouse score) |
| `/perf-loop all` | `homepage` first, then `dashboard` | per-mode defaults |
| `/perf-loop --threshold 90` | (from context) | 90 |

If the mode is ambiguous (e.g., bare `/perf-loop`), use AskUserQuestion:
"Which page should I optimize? A) Homepage (Lighthouse score >= 95) B) Dashboard releases (warm-shell <= 100ms) C) Both, sequentially"

This is the ONLY AskUserQuestion allowed before the terminal state.

---

## Step 1: Prerequisites

```bash
# Check working tree is clean
git status --porcelain
```

If output is non-empty, STOP. Use AskUserQuestion:
"Working tree has uncommitted changes. The perf loop commits each improvement atomically,
so unrelated changes will contaminate the commits. Please commit or stash first."

Options: A) I'll clean up, then re-run /perf-loop B) Abort

Do NOT proceed with a dirty tree. This is a hard gate.

```bash
# Kill zombie servers on the target port (default 3000)
PORT=3000  # or extract from --base-url if provided
lsof -ti:$PORT | xargs kill 2>/dev/null || true
echo "Port $PORT cleared"
```

---

## Step 2: Baseline Measurement (INIT State)

Run the baseline. Redirect ALL output to file to prevent context window exhaustion.

```bash
doppler run -- pnpm --filter web perf:loop \
  --mode <MODE> \
  --threshold <THRESHOLD> \
  --max-no-progress 5 \
  --fresh \
  > .context/perf/loop-output.log 2>&1
echo "EXIT_CODE: $?"
```

Use `timeout: 600000` on this Bash call. Builds + 3 measurements take 3-4 minutes.

After the command completes, read ONLY the state file. NEVER read the log file
(it contains 5-10K tokens of build output that will eat your context window).

```bash
# Find the artifact directory
cat .context/perf/<MODE>-current.json
```

Then read `state.json` from the artifact directory. Extract ONLY these fields:
- `status` (baseline, running, threshold-hit, stalled)
- `bestMeasurement.primaryMetric` and `bestMeasurement.summary`
- `config.threshold`
- `noProgressCount`
- `nextHypothesisIndex`

**If EXIT_CODE is non-zero:** Read the last 20 lines of `loop-output.log` to
determine the failure reason. Transition to BLOCKED with the specific error.

**Transition:**
- If `status === 'threshold-hit'` → PASS (already green!)
- If `status === 'stalled'` → EXHAUSTED
- Otherwise → proceed to Step 3 (OPTIMIZE)

**REMINDER: Do NOT produce a text-only response. IMMEDIATELY proceed to Step 3.**

---

## Step 3: Optimize (OPTIMIZE State)

Read the optimizer prompt and current state:

```bash
cat <artifactDir>/optimizer-prompt.txt
```

Read `state.json` to check `nextHypothesisIndex` and the `iterations` array.

**Hypothesis selection:**
- The script has 4 ranked hypotheses per mode (homepage or dashboard)
- `getNextHypothesisIndex()` clamps at the last index, so the pointer STICKS there
- Check if the LAST iteration's `hypothesis` field matches the current ranked hypothesis
  summary. If yes, all ranked hypotheses are exhausted.
- When exhausted: read the `guardrails` array from `bestMeasurement` in state.json.
  Find the metric with the most headroom above its threshold. Read the actual source
  files on the critical path for that metric. Form a specific, testable hypothesis.

**File tracking — CRITICAL:**
Track every file you change in this iteration. Use `git diff --name-only HEAD` after
your edit to capture exactly which files changed. Store this list mentally — you will
need it for commit or revert. Do NOT rely on the script's `collectChangedFiles()` which
returns ALL repo changes, not just yours.

Make exactly ONE optimization. The smallest change that tests the hypothesis.

**REMINDER: Do NOT produce a text-only response. IMMEDIATELY proceed to Step 4.**

---

## Step 4: Measure (MEASURE State)

Rebuild and remeasure with the hypothesis label:

```bash
doppler run -- pnpm --filter web perf:loop \
  --mode <MODE> \
  --threshold <THRESHOLD> \
  --max-no-progress 5 \
  --hypothesis "<HYPOTHESIS_LABEL>" \
  > .context/perf/loop-output.log 2>&1
echo "EXIT_CODE: $?"
```

Use `timeout: 600000` on this Bash call.

Read `state.json` again. Check the latest entry in the `iterations` array:
- `accepted`: boolean
- `reason`: string (why it was accepted or rejected)
- `measured`: the new primary metric value

Also check: `status`, `noProgressCount`.

**If EXIT_CODE is non-zero:** Read last 20 lines of `loop-output.log`. If it's a
build error from your change, transition to REVERT. If it's infra (port, auth, etc.),
transition to BLOCKED.

**Transition:**
- If `accepted === true` → Step 5 (COMMIT)
- If `accepted === false` → Step 6 (REVERT)

**REMINDER: Do NOT produce a text-only response. IMMEDIATELY commit or revert.**

---

## Step 5: Commit (COMMIT State)

Commit ONLY the files YOU changed (tracked in your mental list from Step 3):

```bash
git add <your-changed-file-1> <your-changed-file-2>
git commit -m "$(cat <<'EOF'
perf(loop): <hypothesis summary> — <metric delta>

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
echo "ITERATION <N>: ACCEPTED — <metric before> → <metric after>"
```

**Transition:**
- If `status === 'threshold-hit'` → PASS
- If `status === 'stalled'` → EXHAUSTED (unlikely after an accept, but check)
- Otherwise → Step 3 (OPTIMIZE) — start the next iteration

**REMINDER: Do NOT produce a text-only response. IMMEDIATELY start next optimization.**

---

## Step 6: Revert (REVERT State)

Discard ONLY the files YOU changed:

```bash
git checkout -- <your-changed-file-1> <your-changed-file-2>
echo "ITERATION <N>: REJECTED — <reason from state.json>"
```

**Transition:**
- If `status === 'stalled'` → EXHAUSTED
- Otherwise → Step 3 (OPTIMIZE) — try a different hypothesis

**REMINDER: Do NOT produce a text-only response. IMMEDIATELY start next optimization.**

---

## Step 7: Terminal States

### PASS

The page meets its performance budget. Produce the final report:

```
PERF-LOOP COMPLETE
==================
Mode:       <homepage|dashboard>
Status:     PASS
Baseline:   <initial metric value from baselineMeasurement>
Final:      <final metric value from bestMeasurement>
Delta:      <improvement>
Iterations: <N> (accepted: <X>, rejected: <Y>)

ACCEPTED CHANGES:
  1. <sha> — <hypothesis> — <metric delta>
  2. ...

REJECTED EXPERIMENTS:
  1. <hypothesis> — <reason>
  2. ...
```

Then use AskUserQuestion: "Threshold hit! Want to push lower? Enter a stricter
threshold or choose: A) Done — ship these improvements B) Push to <recommended>"

### EXHAUSTED

Too many consecutive failures. Produce the final report:

```
PERF-LOOP COMPLETE
==================
Mode:       <homepage|dashboard>
Status:     EXHAUSTED (5 consecutive rejected experiments)
Baseline:   <initial metric>
Best:       <best metric achieved>
Delta:      <improvement from baseline, if any>
Iterations: <N> (accepted: <X>, rejected: <Y>)

ACCEPTED CHANGES:
  <list or "none">

REJECTED EXPERIMENTS:
  <list with reasons>

NEXT HYPOTHESES (what I would try with more patience):
  1. <specific hypothesis with target files>
  2. <specific hypothesis with target files>
```

### BLOCKED

Infrastructure failure. Include the specific failure reason:

```
PERF-LOOP BLOCKED
=================
Failure:    <specific error — build failed, port occupied, auth expired, etc.>
Last state: <metric value if available>
Log:        .context/perf/loop-output.log

RECOMMENDATION: <what the user should do to unblock>
```

---

## Auth Handling (Dashboard Mode)

Dashboard mode requires authenticated cookies. The script auto-detects
`apps/web/.auth/session.json`. If auth is missing or expired:

1. The measurement will fail or return nonsensical results
2. Check the exit code and log for auth-related errors
3. If detected, re-bootstrap auth:

```bash
doppler run -- pnpm --filter web perf:auth --base-url http://localhost:3000
```

Then retry the measurement. If auth fails twice, transition to BLOCKED.

---

## "All" Mode

When the user requests `all`:
1. Run the full loop for `homepage` mode first (Steps 2-7)
2. If homepage reaches PASS or EXHAUSTED, start the `dashboard` loop (Steps 2-7)
3. Report results for both at the end
4. Cross-page improvements are welcome — if optimizing the app shell for dashboard
   also improves homepage, the commit stays

---

## Context Window Survival Guide

This loop runs for 30-50 minutes. Context window management is life or death.

1. **NEVER let build output into the conversation.** Always redirect: `> .context/perf/loop-output.log 2>&1`
2. **Read only state.json**, never the raw measurement JSON files
3. **Extract only the numbers you need** — status, primaryMetric, noProgressCount
4. **Keep your hypothesis descriptions short** — one sentence max
5. **Don't re-read files you've already read** unless they changed
6. **Don't dump file contents into echo commands** — just reference the file path
