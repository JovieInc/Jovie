# On-Call Process for Production Incidents

This runbook defines how Jovie responds to launch-critical production incidents.

## Scope

Use this process for any production issue that impacts:

- Sign up, login, or onboarding
- Public artist profile rendering
- Dashboard access or core creator workflows
- Payment, tipping, or subscriptions
- Sustained elevated error rates in Sentry

## Alert Sources

Primary detection channels:

1. **Sentry P0 alert rules** (new high-priority production errors)
2. **Synthetic monitoring Slack alerts** (golden-path regressions)
3. **Uptime monitor alerts** (availability / health endpoint failures)

Live Sentry detectors and the October 2, 2026 notification wiring are listed in
[Production Sentry monitors](COST_MONITORING.md#production-sentry-monitors-october-2-2026).
Use those IDs during triage:

- jov.ie error rate: monitor [10520248](https://jovie.sentry.io/monitors/10520248/), alert [2854889](https://jovie.sentry.io/monitors/alerts/2854889/)
- summer.jov.ie error rate: monitor [10520461](https://jovie.sentry.io/monitors/10520461/), same alert 2854889. It sees Summer only when `jovie-web` events carry a `summer.jov.ie` url, transaction, or server name.
- Uptime: [10520249](https://jovie.sentry.io/monitors/10520249/) (`https://jov.ie`), [10327180](https://jovie.sentry.io/monitors/10327180/) (`https://jov.ie/api/health/build-info`), [10327184](https://jovie.sentry.io/monitors/10327184/) (`https://summer.jov.ie/runtime/v1/health`), alert [6106070](https://jovie.sentry.io/monitors/alerts/6106070/)

The deep production synthetic job is red because Doppler `jovie-web/prd` is
missing the six waitlist canary secrets. That blocker, and the runs that show
it, are in
[Current production blocker](SYNTHETIC_MONITORING.md#current-production-blocker-october-2-2026).
A green daily Web AI workflow run does not clear it.

If multiple channels trigger for the same window, treat the incident as **P0 until proven otherwise**.

## Severity Model

- **P0 (Launch blocker)**: Revenue-critical or trust-critical user flow broken in production.
- **P1 (High)**: Major degradation with workaround available.
- **P2 (Medium)**: Non-critical bug with limited blast radius.

For launch outreach windows, unresolved production 500s in seeded artist flows are considered **P0** by default.

## On-Call Ownership

- **Primary on-call**: Tim
- **Backup**: Any available engineering owner in `#alerts-critical`
- **Decision owner**: Primary on-call unless explicitly delegated

## Response SLOs

- **Acknowledge P0**: within **5 minutes** of alert receipt
- **Initial mitigation**: within **15 minutes**
- **Status updates**: every **15 minutes** until resolved
- **Post-incident write-up**: within **24 hours**

## P0 Incident Workflow

### 1) Triage immediately

1. Confirm user impact (who is broken, where, and since when).
2. Open the top unresolved Sentry event and capture:
   - Error signature
   - First seen / latest seen
   - Affected release and route
   - User impact estimate
3. Check synthetic monitor and uptime dashboards for correlated failures.

### 2) Stabilize user impact

Prefer fastest safe mitigation:

- Roll back the latest deploy if regression is clear
- Feature-flag off the failing path
- Hotfix guardrails to prevent 500s
- Add temporary fallback UI/response where feasible

### 3) Communicate clearly

Post in `#alerts-critical` using this format:

```text
[P0] <short incident title>
Status: Investigating | Mitigating | Monitoring | Resolved
Impact: <who is affected>
Started: <time in PT + UTC>
Owner: <name>
Next update: <time>
```

### 4) Resolve and verify

Before closing the incident:

- Confirm Sentry issue is no longer reproducing
- Confirm uptime checks and synthetic tests are green
- Confirm no new related P0 alerts for at least one alert cycle

### 5) Close out

- Resolve/ignore Sentry issue with a clear reason
- Document root cause, mitigation, and permanent fix
- Add follow-up tasks for structural prevention

## Red monitors need an owner

A monitor that stays red is an incident or it is deleted. A check that is red
run after run with no owner teaches everyone to ignore it, and then it cannot
tell us when something real breaks.

**Rule.** For every scheduled or post-deploy workflow in
`canon/automation-registry.jsonl` (trigger `github-cron`, `lanes-clock` or
`github-event`), a red streak needs an open incident with a live owner lease
when either is true:

- more than 3 consecutive failed runs, or
- red for more than 24 hours, counted from the streak's first failed run (not
  from the last green run, which for a daily or weekly monitor is a cadence
  ago).

A monitor whose newest run is green is never red, however long ago it last
ran. Skipped and cancelled runs carry no verdict.

**Owner lease.** Add one line to `canon/monitor-incidents.jsonl`:
`{"workflow": "<file>.yml", "incident": "<Linear key or URL>", "owner": "<who>",
"openedAt": "<ISO>", "until": "<ISO>", "reason": "<why it is red>"}`. It has
the `jovie-hold/v1` shape: the lease is live until `until`, and never longer
than 7 days from `openedAt`. When it lapses, renew it with a new line, fix the
monitor, or retire it from the registry. There is no fourth option.

**Gate.** `scripts/automation-liveness.mjs` reads the same runs page it already
fetches for each monitor and runs `scripts/lib/red-monitor-owner-gate.mjs`. The
result is in the liveness report (`redMonitors`), the step summary and one
annotation per offender.

- Report-only until **2026-11-25**: offenders are warnings.
- From **2026-11-25T00:00Z** (`ENFORCE_FROM`): the liveness check fails while any
  offender has no live lease.

Offenders on 2026-11-11, when the gate landed: `cost-anomaly-gate.yml`,
`claim-checkout-dogfood.yml`, `visual-regression.yml`, `e2e-full-matrix.yml`,
`vs-linktree-claims.yml`, `postdeploy-probes.yml` and `spend-guard.yml` (needs
the `VERCEL_READONLY_TOKEN` secret from the founder).

**One spec asserts one class.** A functional journey spec may not contain a
performance or layout budget. A budget lives in its own spec and reports as its
own check, so a layout regression never turns a revenue canary red and a real
checkout break never hides behind a known layout red. Example:
`apps/web/tests/e2e/claim-checkout.spec.ts` (journey) and
`claim-checkout-layout.perf.spec.ts` (layout budget, check
`Claim checkout layout budget (perf)`).

## Escalation Triggers

Escalate from P1 to P0 immediately if any of the following occur:

- Error rate or impact is rising rapidly
- Public profile or onboarding is unavailable
- Payment/tipping flow is failing
- Multiple monitoring channels fail simultaneously

## Launch Readiness Gate

Launch outreach should pause if **any unresolved P0** exists in Sentry.

The system is considered launch-ready only when:

- Unresolved P0 count is **zero**
- P0 alert rules are active and tested
- Synthetic monitoring and uptime checks are green

## Post-Incident Template

Use this lightweight structure in the issue or PR:

1. **What happened**
2. **User impact**
3. **Root cause**
4. **Mitigation applied**
5. **Permanent fix**
6. **Preventive actions**

For GitHub control-plane incidents, list the branch Git ref, REST PR head/base,
GraphQL head/base, timeline or webhook payload, Actions event identity, and
synthetic merge parents/tree separately with timestamps. Include every mutation
receipt and the semantic ancestry/tree proof; do not flatten divergent planes
into one “GitHub state.” Prevent recurrence with one absolute controller
timeout, bounded child cleanup, no blind mutation retries, and the canonical
single signed refresh-child rule in [`PR_FLOW.md`](PR_FLOW.md).
