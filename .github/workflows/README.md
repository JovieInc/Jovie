# GitHub Workflows

## Vercel Preview Deployments

### Preview Deployment Workflow

Vercel preview deployments for pull requests and feature branches are handled by the `ci.yml` workflow via the `ci-pr-vercel-preview` and `deploy` jobs.

#### Features:

- Automated preview deployments for pull requests
- PR comment with deployment URL
- Manual triggering via workflow_dispatch for specific PRs
- Fork safety and concurrency controls

#### Triggers:

- Pull request events (opened, reopened, synchronize)
- Push events to non-production, non-main branches
- Manual workflow dispatch with PR number input

#### Secrets:

- `VERCEL_TOKEN` - Vercel API token
- `VERCEL_ORG_ID` - Vercel organization ID
- `VERCEL_PROJECT_ID` - Vercel project ID
- `GITHUB_TOKEN` - Automatically provided by GitHub Actions

## CI and Merge Queue

The main CI workflow `ci.yml` is the gatekeeper for PRs to `main` and `production`. It includes fast checks (typecheck, lint) and full CI (build, unit, E2E). To support GitHub Merge Queue, `ci.yml` listens to the `merge_group` event so required status checks re-run in-queue before merging.
