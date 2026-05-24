# Linear: Issue Gating + Ownership Contract

How agents claim, transition, and finish Linear-tracked work without colliding with each other.

## Issue Gating

Before working on any Linear issue, check for the `human-review-required` label. If present, **SKIP** the issue entirely. Do not attempt to work on it, close it, or add comments. These issues require human decision-making.

Also skip any issue whose description contains:

> "This issue requires human review"

When scanning Linear for issues to work on, always filter with:
- Exclude label: `human-review-required`
- Exclude description containing: "This issue requires human review"

### When to apply the `human-review-required` label

- Automation/infrastructure setup tasks
- Architectural decisions requiring human judgment
- Process or workflow changes
- Issues filed by automated scanners that haven't been triaged

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

1. **On start — mark the Linear issue `In Progress`.** Do this BEFORE reading code or editing files. If the issue is unassigned, assign it to yourself (or the human owner) at the same time. This is the required initial manual transition (the only one for orchestrator-dispatched work; ad-hoc work also needs a manual `In Review` transition on PR open — see step 2).

2. **On PR open —** behavior depends on how the work was started:
   - **Orchestrator-dispatched work** (branches created by `linear-ai-orchestrator.yml`): no action required. The `sync_linear_in_review` job auto-transitions the issue to `In Review` when the PR opens.
   - **Ad-hoc work** (direct agent sessions, manually opened PRs): manually transition the Linear issue to `In Review` when you open the PR. The orchestrator's `sync_linear_in_review` job does NOT run for branches it didn't dispatch.

   In both cases, preserve the PR body's `<!-- linear-issue-id:... -->` comment and the `jov-XXXX` branch pattern so `linear-sync-on-merge.yml` can find the issue at merge time.

3. **On merge — no action required.** `linear-sync-on-merge.yml` auto-transitions the issue to `Done` and posts the merge SHA as a comment.

Do NOT manually perform the In Review or Done transitions — you will race the workflows and produce confusing state.

### Orchestrator-dispatched work

When the Linear AI orchestrator dispatches work (`linear-ai-orchestrator.yml` `assign_to_codex` job), it sets `In Progress` at dispatch time. If your session was started by the orchestrator, the transition is already done — skip step 1.

### How to transition

With Linear MCP available (most Claude Code sessions):

```
# 1. Get the team's state IDs
mcp__claude_ai_Linear__list_issue_statuses({ team: "<team-id-or-key>" })

# 2. Set the issue to In Progress
mcp__claude_ai_Linear__save_issue({ id: "<issue-id>", state: "<in-progress-state-id>" })
```

Without Linear MCP, use the GraphQL API directly (same pattern as `.github/workflows/linear-ai-orchestrator.yml` — look up the state where `name` matches `/in progress/i`, then call `issueUpdate`).

### No Linear issue (ad-hoc work)

If the user asks you to fix something without a Linear issue, either:

1. Create a Linear issue for it and move it to In Progress, OR
2. Explicitly state "no Linear issue — ad-hoc" in your first status message so the human knows coordination is manual and other agents won't see this work.
