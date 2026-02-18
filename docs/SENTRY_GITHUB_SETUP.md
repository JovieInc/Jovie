# Sentry to GitHub Issue Automation Setup

This document explains how to configure the Sentry alert rule that automatically creates GitHub Issues from production errors, which kicks off the full Sentry Autofix pipeline.

## Pipeline Overview

```
Sentry Alert Rule → GitHub Issue [sentry, bug] → CodeRabbit Plan → Claude Fix → PR
```

## Prerequisites

1. **Sentry GitHub Integration** must be installed on the Jovie repository
   - Go to Sentry > Settings > Integrations > GitHub
   - Install and authorize for the `JovieInc/Jovie` repository
2. **CodeRabbit** must be active on the repository (already configured)
3. **Claude Code Action** must be configured (already in `.github/workflows/claude.yml`)

## Step 1: Create the Sentry Alert Rule

Navigate to **Sentry > Alerts > Create Alert Rule** (Issue Alert).

### Conditions (When)

| Condition | Value |
|-----------|-------|
| A new issue is created | *(default)* |
| OR the issue is seen more than | **10 times in 1 hour** |

### Filters (If)

| Filter | Value |
|--------|-------|
| The issue's level is equal to | **error** or **fatal** |
| The issue's environment is | **production** |

### Actions (Then)

Select **"Create a new GitHub issue"** and configure:

| Setting | Value |
|---------|-------|
| Repository | `JovieInc/Jovie` |
| Assignee | *(leave blank — Claude handles it)* |
| Labels | `sentry`, `bug` |

### Alert Name

`Auto-create GitHub Issue for production errors`

### Rate Limit

Set the rate limit to **1 alert per issue per hour** to prevent duplicate issue creation.

## Step 2: Configure the Issue Body Template

In the Sentry alert rule action, use this body template:

```markdown
## Sentry Error Report

**Error**: {title}
**Level**: {level}
**First Seen**: {firstSeen}
**Events**: {count} occurrences

### Error Details

**Type**: {metadata.type}
**Value**: {metadata.value}
**Culprit**: {culprit}

### Links

- [View in Sentry]({url})
- Sentry Issue ID: {id}

---

*This issue was automatically created by a Sentry alert rule.*
*CodeRabbit will auto-generate an implementation plan.*
```

> **Note**: The exact template variables depend on your Sentry plan. Adjust the placeholders to match what Sentry provides in your alert rule configuration.

## Step 3: Verify the Pipeline

### Test Manually

1. Create a GitHub issue with the `sentry` label and a mock error body
2. Wait 5-10 minutes for CodeRabbit to auto-generate a plan
3. Check that the `sentry-autofix.yml` workflow triggers
4. Verify the guard job passes and Claude starts working

### Test End-to-End

1. Trigger a test error in your production app
2. Verify Sentry creates a GitHub Issue with `sentry` and `bug` labels
3. Verify CodeRabbit posts an implementation plan comment
4. Verify Claude implements the fix and opens a PR

## Disabling the Pipeline

### Per-Issue

Add the `ai:opt-out` label to any GitHub issue to prevent the autofix workflow from running.

### Globally

- **Disable the Sentry alert rule** in Sentry > Alerts to stop new issue creation
- **Disable the workflow** in GitHub > Actions > Sentry Autofix > Disable workflow

## Label Reference

| Label | Purpose |
|-------|---------|
| `sentry` | Marks issues created by Sentry (triggers CodeRabbit auto-planning) |
| `bug` | Standard bug classification |
| `ai:fixing` | Claude is actively working on a fix |
| `ai:fixed` | Fix PR has been created successfully |
| `ai:failed` | Automation failed, needs human intervention |
| `ai:opt-out` | Blocks automation for this specific issue |
| `needs-human` | Human developer intervention required |

## Troubleshooting

### Sentry issue not creating GitHub issue

- Verify the Sentry GitHub integration is installed and authorized
- Check the alert rule conditions and filters match the error
- Review the alert rule activity log in Sentry

### CodeRabbit not planning

- Verify `.coderabbit.yaml` has `issue_enrichment.planning.auto_planning.enabled: true`
- Verify the `labels` array includes `sentry`
- Check CodeRabbit's status at https://status.coderabbit.ai

### Workflow not triggering

- Check GitHub Actions > Sentry Autofix for recent runs
- Verify the comment is from `coderabbitai[bot]`
- Verify the comment contains plan markers (`## Plan`, `### Tasks`)
- Check if `ai:fixing`, `ai:fixed`, or `ai:failed` labels are already present

### Fix fails validation

- Review the workflow run logs for typecheck/lint/test errors
- The `ai:failed` and `needs-human` labels indicate manual intervention is needed
- The failure comment on the issue includes a link to the workflow run
