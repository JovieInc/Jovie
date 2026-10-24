---
paths: [".github/workflows/**", "scripts/lanes/**", "scripts/backlog-orchestrator/**", "canon/automation-registry.jsonl", "docs/metrics/**"]
---

# Event-Driven Pipelines: Act on the Event, Backstop on a Clock

Tim, 2026-10-21: "Everything is supposed to be event based and action is a
must." Work must never sit waiting for the next tick of a timer.

## Rule

Any pipeline stage that waits on a schedule (cron, lanes clock, `clock_*`
repository_dispatch, hourly catch-up, polling loop) needs all three of these:

1. **An event trigger.** The stage runs on the event that makes it actionable:
   a provider webhook (Linear `Issue`, Sentry, Stripe), `workflow_run` /
   `check_suite` / `check_run` completion, `pull_request` (`ready_for_review`,
   `synchronize`), `merge_group`, `deployment_status`, `repository_dispatch`, or
   a push. Coalesce on the entity's identity (issue id, exact head SHA) instead
   of debouncing on a timer.
2. **A backstop.** Keep a clock only to recover missed or ambiguous events. It
   runs the same code path and fences as the event, and its interval is no
   longer than the dwell SLO.
3. **A measured dwell SLO.** Register the stage in
   `docs/metrics/stage-manifest.json` with `enteredAt`/`exitedAt` per entity,
   and register a dead-man entry in `canon/automation-registry.jsonl`. The
   entry's `maxStalenessMinutes` is the SLO, so `automation-liveness.yml` files
   a fingerprinted Linear issue when the oldest waiting item is over it.

Every event ends in an action: either the state change, or an explicit
held/hand-off record that a human or owner sees (an Ovie card, or a Linear
comment naming what is needed). A handler that completes with no effect and no
record is a defect, even when it exits 0.

## Current SLOs

| Stage | Event | Backstop | SLO | Registry id |
|---|---|---|---|---|
| Linear Triage → classified (team, priority, labels, out of Triage, or Ovie card) | Linear `Issue` create / entered-triage webhook → Summer scoped triage turn | Summer hourly `triage-sweep` catch-up | 15 min | `summer:triage-dwell` |
| Required-green ready PR → in merge queue | `workflow_run` of required checks, `pull_request_target` `ready_for_review`/`synchronize` → Merge Queue Green Enroll | push-to-main roster sweep | 10 min | `github:jovie:green-to-enqueue` |
| Green lane draft → ready | lane gate verdict on the exact head → lanes `publish_verified` (writer proof, JOV-INV-022) | lanes tick | measured in the `green-to-enqueue` reason (`draft-green`) | lanes-owned |

## When adding or changing automation

- Before adding a schedule, name the event that should drive it. A schedule
  with no event is allowed only for work that is inherently time-based
  (nightly measurements, expiry checks, SLO snapshots), and its registry
  entry says so.
- Never lengthen a backstop beyond the dwell SLO, or make it the main path.
- GitHub budget: read with the Jovie Bot app token through
  `packages/api-client` and coalesce per head SHA (see
  `.claude/rules/external-apis.md`). A high-volume `workflow_run` wake must
  not spend one `GITHUB_TOKEN` call per run.
