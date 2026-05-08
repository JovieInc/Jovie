# AgentOS Architecture

> Issue: JOV-1922
> Status: Accepted for v1 internal proof
> Date: 2026-05-08

## Decision

Jovie AgentOS v1 uses Vercel Workflow/WDK as the first durable coordinator, not Trigger.dev. Trigger stays the fallback if WDK cannot satisfy local durability, retries, queues, or operator visibility after the dry-run proof.

The control plane is intentionally Jovie-owned:

- Linear remains the source of truth for product work and ownership.
- GitHub Actions and GStack remain the merge, review, ship, and deploy gates.
- Vercel Workflow coordinates dry-run orchestration and later durable run state.
- Hermes and Ruflo are adapters that execute bounded agent work.
- Vercel AI SDK and AI Gateway remain product AI and model-call infrastructure.
- OpenRouter free routes are read-only economy cognition only.

Workflow code must not merge, deploy, mutate Linear, bypass CI, or grant itself authority over protected surfaces.

## Layer Contract

| Layer | Owns | Does not own |
| --- | --- | --- |
| Linear | Issue source of truth, owner, priority, human-review labels | Hidden agent state |
| Admin Ops | Private operator surface for run state, approvals, and gate evidence | Customer-facing workflow UX in v1 |
| Vercel Workflow/WDK | Durable dry-run coordination, steps, retries, status emission | Merge/deploy authority |
| Hermes/Ruflo | Bounded agent execution behind allowed paths and HOT ZONE claims | Source of truth, direct merge, direct deploy |
| GitHub Actions | Required checks, status publication, PR automation, deploy gates | 24/7 exploratory cognition |
| GStack | QA, review, ship, land discipline | Durable job runtime |
| OpenRouter free models | Classify, rank, summarize, draft internal artifacts | Code mutation, security/billing/auth decisions, outbound sends |

## AgentRunArtifact Contract

`AgentRunArtifact` is the canonical run record introduced in the next implementation PR. It should evolve the existing `HermesAiOps*` model instead of creating a parallel shape.

Minimum fields:

- `id`
- `source`: `github | linear | sentry | hermes | ci | ruflo | vercel-workflow`
- `kind`: `qa | design_review | code_review | triage | gtm | yc | cost | deploy_readiness | workflow`
- `status`: `queued | running | blocked | review | done | failed | stale`
- `modelRoute`: `deterministic | openrouter-free | ai-sdk-gateway | claude-code | codex-cli`
- `allowedActions`
- `forbiddenActions`
- `humanApprovalRequired`
- `linearIssueId`
- `pullRequestUrl`
- `adminSurface`
- `verificationGates`
- `costEstimateUsd`
- `blockedReason`

Gate evidence names are stable strings:

- `gstack.qa.exhaustive`
- `gstack.review`
- `gstack.ship`
- `github.ci`
- `github.scope-judge`
- `github.coderabbit`
- `github.greptile`
- `github.branch-protection`
- `gstack.land-and-deploy`
- `sentry.canary`

Agent PR automation must treat missing required gate evidence as blocked, not successful.

## PR Rollout

AgentOS ships as sequential agent-owned PRs:

1. GStack tooling sync.
2. Architecture ADR and Linear dedupe.
3. `AgentRunArtifact` schema.
4. Gate enforcement before non-dry-run agents.
5. WDK compile foundation.
6. WDK dry-run workflow.
7. Admin Ops surface.
8. Hermes/Ruflo normalized adapter.
9. OpenRouter free model broker.

Only non-overlapping docs/schema/UI chunks may run in parallel. Shared infrastructure changes run one at a time. The release conductor lands PRs sequentially with `/land-and-deploy`.

## Admin Ops Boundary

The private operator surface belongs under `/app/admin/ops`. The current `/hud` route remains a readable kiosk/status board and must not become a dense command center.

Admin Ops v1 should use compact admin-shell patterns. Feature-specific components live under `apps/web/components/features/admin/agent-os/*`. Components should move to shared workflow organisms only after a second product surface actually reuses them.

## Trigger Fallback Criteria

Do not install Trigger in this wave. Revisit it only if WDK fails one of these proof points:

- `withWorkflow()` cannot compile in the current CommonJS Next config without high-risk config conversion.
- Local dry-run state is not durable or inspectable enough for Admin Ops.
- Retry/resume/step behavior cannot be tested reliably in CI.
- Jovie needs a self-hosted durable worker outside Vercel's execution model.

## Linear Dedupe

Duplicates linked during this ADR:

| Duplicate | Canonical |
| --- | --- |
| JOV-1906 `HUD: Founder Ops Deployment System` | JOV-1854 |
| JOV-1916 `HUD: ship read-only /admin/ops v0...` | JOV-1864 |
| JOV-1910 `VELOCITY: Agent OS Cost + Duplication Control` | JOV-1858 |
| JOV-1913 `OPS: create daily runway cron / no_agent report` | JOV-1861 |

Human-review-required canonical issues remain untouched.

## Verification Policy

Every implementation PR after this ADR must run the narrowest relevant local checks plus the GStack sequence:

1. Focused typecheck/lint/tests for edited paths.
2. `/qa --exhaustive`.
3. `/review`.
4. `/ship`.
5. Release conductor runs `/land-and-deploy` after CI and bot-review gates pass.

Workflow, GitHub Actions, Hermes, and WDK PRs require `needs-human` if compile behavior, runner availability, or gate publication is ambiguous.
