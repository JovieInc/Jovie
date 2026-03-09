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
