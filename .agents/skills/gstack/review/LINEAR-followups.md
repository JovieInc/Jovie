# Linear Follow-Up Issue Format

Shared reference for durable follow-up capture. Use Linear issues for new follow-up work; do not add new items to `TODOS.md`. Existing `TODOS.md` files are legacy context only.

## Required Issue Fields

Every follow-up issue description should include:

```markdown
## Source
- Current issue: <JOV-XXXX or "ad-hoc">
- Source PR: <PR URL or "not opened yet">
- Source branch/session: <branch name or session context>
- Created follow-up issue ID: <fill with the Linear issue key after creation>

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

## Closeout Requirement

After creating the issue, record the Linear issue ID (for example `JOV-1234`) in the PR body or final output next to the follow-up. Do not close out with "created" but no ID.

## Candidate Follow-Ups

Optional work must use the title format:

```text
Candidate follow-up: <title>
```

Include this exact note in the description:

> Pickup agent must first judge whether to implement, close, or split this.

Do not add the `automated` label by default. Candidate issues must remain visible for triage without being blindly dispatched.

## Required Follow-Ups

Required deferred work should have a direct action title, concrete acceptance criteria, and a dependency link when it cannot start until the source issue or PR lands.
