---
paths: ["scripts/backlog-orchestrator/**", "scripts/hermes/**", "docs/PR_FLOW.md"]
---

# Linear: Issue Gating + Ownership Contract

How agents claim, transition, and finish Linear-tracked work without colliding with each other.

## Issue Gating

<!-- JOV-INV-028 -->
Legacy `human-review-required`, `needs-human`, and `no-auto` labels are invalid
automation holds. Remove them when encountered and continue through the normal
machine gates. Product taste is steered before PR creation or certified after
landing behind a feature flag. A physical or external action ships disabled and
is tracked as a separate post-landing authority action; it never parks the code
or issue.

## Durable Follow-Up Capture

Linear is the durable destination for every actionable follow-up an agent chooses not to implement, including optional or candidate work. Before closing out the current work, any final answer, PR body, plan, review, handoff, or status update that says "did not do X", "consider later", "follow-up PR", "deferred", "future work", "not in scope", or similar must include a created Linear issue ID.

Do not leave follow-up work only in inline `// TODO` comments, `TODOS.md`, PR-body bullets, chat memory, review summaries, or "remaining risks" prose. If it is worth mentioning as future work, it is worth tracking in Linear.

Create follow-up issues on the relevant team, usually `Jovie`. Do not add the `automated` label by default, so optional work stays visible without being blindly dispatched by automation.

### Required follow-up issue shape

Use this structure for every follow-up issue:

```markdown
## Source
- Current issue: <JOV-XXXX or "ad-hoc">
- Source PR: <PR URL or "not opened yet">
- Source branch/session: <branch name or session context>

## Follow-up
<What was not done. Be specific enough that another agent can find the code or workflow.>

## Why it matters
<User impact, risk reduction, cleanup value, or product reason.>

## Classification
Required / Candidate

## Acceptance criteria or triage question
<Required work gets acceptance criteria. Candidate work gets the decision question.>

## Dependency
<Use blockedBy or note that this depends on the source issue/PR landing first. Otherwise "None".>
```

For optional work, title the issue `Candidate follow-up: <title>` and include this exact note in the description:

> Pickup agent must first judge whether to implement, close, or split this.

If the follow-up depends on the current work landing first, use `blockedBy` to link it to the current issue when possible. If no direct relationship can be created, include the dependency in the issue description and reference the follow-up issue ID in the current PR description and any planning/design docs.

This applies equally to scope deferred to ship faster, scope noticed but intentionally skipped, pre-existing failures discovered during verification, test gaps, design debt, optional polish, and future product work.

## Linear Ownership Contract

Every agent working a Linear-tracked task MUST follow this three-state contract.

Multiple agents run in parallel (Conductor workspaces, autopilot, ad-hoc sessions). Linear state is the shared signal other agents use to see what is in flight — if you do not mark your issue In Progress, you invite collisions where two agents edit the same files.

### The contract

1. **On start — require an `In Progress` Linear receipt.** Linear-backed Symphony records the transition as part of an admitted lease. Ad-hoc agents must do it manually before edits. If the issue is unassigned, assign it to yourself (or the human owner) at the same time.

2. **On PR open —** behavior depends on how the work was started:
   - **Symphony-dispatched work:** follow the lease handoff and require its `In Review` transition receipt.
   - **Ad-hoc work** (direct agent sessions, manually opened PRs): manually transition the Linear issue to `In Review` when you open the PR.

   In both cases, preserve the PR body's `<!-- linear-issue-id:... -->` comment and the `jov-XXXX` branch pattern so `linear-sync-on-merge.yml` can find the issue at merge time.

3. **On merge — no action required.** `linear-sync-on-merge.yml` auto-transitions the issue to `Done` and posts the merge SHA as a comment.

Do not duplicate a Symphony-owned transition. Never manually perform the `Done` transition; that races the merge workflow.

### Symphony-dispatched work

When Linear-backed Symphony dispatches work, it must hold the Linear lease and record the `In Progress` transition before implementation begins. If your session was started by Symphony, verify that receipt and do not create or consult a GitHub Issue as fallback intake.

### How to transition

With Linear MCP available (most Claude Code sessions):

```
# 1. Get the team's state IDs
mcp__claude_ai_Linear__list_issue_statuses({ team: "<team-id-or-key>" })

# 2. Set the issue to In Progress
mcp__claude_ai_Linear__save_issue({ id: "<issue-id>", state: "<in-progress-state-id>" })
```

Without Linear MCP, use the existing Linear GraphQL client pattern: look up the state where `name` matches `/in progress/i`, then call `issueUpdate`. Fail closed on authentication, rate-limit, or mutation errors; never fall back to GitHub Issues.

### No Linear issue (ad-hoc work)

If the user asks you to fix something without a Linear issue, either:

1. Create a Linear issue for it and move it to In Progress, OR
2. Explicitly state "no Linear issue — ad-hoc" in your first status message so the human knows coordination is manual and other agents won't see this work.
