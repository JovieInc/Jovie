---
description: Review and process all open PRs (including drafts) to completion with AI agent assignment and validation
allowed-tools: Bash(gh:*), Bash(git:*), Bash(pnpm:*)
---

# Orchestrate PR Workflow

Systematically process all open pull requests to completion, ensuring all checks pass and PRs are properly merged.

## Workflow

For each open PR (including drafts):

### 1. Assessment Phase
- Check PR status, CI/CD results, and review comments
- Determine if work is complete or needs additional changes
- Identify what's blocking the PR from being merge

### 2. Work Assignment (if needed)
If code changes are required, add a comment tagging the appropriate AI agent:
- `@claude` - General code quality, refactoring, or complex logic
- `@codex` - Straightforward implementation tasks
- `@cursor` - Rapid iterations or simple fixes

Clearly describe what needs to be done in the comment.

### 3. Review Response
- Address ALL comments from CodeRabbit, Claude reviews, or human reviewers
- Make necessary code changes or respond with explanations
- Request re-review when changes are complete

### 4. CI/CD Validation
- Ensure all required checks pass (tests, linting, type checking, security scans)
- If checks fail, diagnose and fix the issues
- NEVER skip or override failing checks

### 5. Merge Criteria
ALL of the following must be true before merging:
- ✅ All checks are green
- ✅ All review comments are resolved
- ✅ No merge conflicts
- ✅ Follows proper merge strategy (no force operations)

### 6. Process Completion
- Continue until all PRs are either merged or in a stable "waiting for external input" state
- Provide a summary of PRs processed, merged, and any that remain open with reasons

## Critical Constraints

**NEVER:**
- Use `--force`, `--no-verify`, or override any checks
- Skip git hooks or CI/CD guardrails
- Bypass repository branching/merging policies
- Merge PRs with failing checks

**ALWAYS:**
- Respect all validation guardrails
- Follow proper check procedures
- If blocked by external factors (awaiting human review, third-party issues), note it and move on
- Work in parallel where possible but validate each PR fully before merging

## Current Repository Status

Branch: !`git branch --show-current`

Status: !`git status --short`

Recent commits: !`git log --oneline -5`

## Getting Started

First, list all open PRs to create a plan:

!`gh pr list --state open --json number,title,isDraft,statusCheckRollup,mergeable --limit 50`
