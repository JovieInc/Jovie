---
trigger: always_on
---
## PR & Integration Rules
- Feature branches from `preview`; names `feat|fix|chore/<kebab-slug>`.
- Trigger PostHog events for key actions (both light/dark modes).
- Unit + E2E smoke; pass typecheck, lint, unit, E2E; preview build succeeds.
- PR title: `[feat|fix|chore]: <slug>`; body: Goal, KPI (if any), PostHog events, Rollback plan.
- Fast-Path: ≤200 LOC, ≤3 files, revenue/activation scope, smoke green; auto-promote after green CI.
- Protected: no direct pushes to `preview`/`production`; PRs only; keep branches in sync.
