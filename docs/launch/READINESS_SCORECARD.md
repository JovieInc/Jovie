# Readiness Scorecard

Use this scorecard in go/no-go review. Prefer binary answers over narrative.

Related docs:

- [Production Readiness Review](./PRODUCTION_READINESS_REVIEW.md)
- [Launch Gates](./LAUNCH_GATES.md)
- [Synthetic Monitoring](../SYNTHETIC_MONITORING.md)
- [On-Call Process](../ON_CALL_PROCESS.md)

## Blocking Scorecard

| Check | Status |
| --- | --- |
| Blocking CI launch gates are green | ☐ |
| Staging auth journey gate is green | ☐ |
| Staging billing gate is green | ☐ |
| Last 3 production synthetic runs are green | ☐ |
| Sentry error soak is green | ☐ |
| Cron monitors are configured for all scheduled routes | ☐ |
| No unresolved P0 incidents exist | ☐ |
| Migration plan is additive / expand-contract compatible | ☐ |
| Runtime kill switches are known and reachable | ☐ |
| On-call owner is confirmed for launch window | ☐ |

## Notes

- Any unchecked box should be treated as a named launch risk.
- More than one unchecked blocking box is a default no-go.
