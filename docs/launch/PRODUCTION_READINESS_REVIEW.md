# Production Readiness Review

Use this doc as the repo-tracked PRR for launch batches.

Related docs:

- [Launch Gates](./LAUNCH_GATES.md)
- [Readiness Scorecard](./READINESS_SCORECARD.md)
- [Synthetic Monitoring](../SYNTHETIC_MONITORING.md)
- [On-Call Process](../ON_CALL_PROCESS.md)

## P0 Journeys

| Journey | Evidence | Owner | Kill Switch |
| --- | --- | --- | --- |
| Sign up availability | `/signup` renders or intentionally serves unavailable state | Growth / Tim | `signupEnabled` |
| Sign in + dashboard shell | `smoke-prod-auth.spec.ts`, staging auth journey gate, synthetic seeded-user flow | Product / Tim | Forward-fix or deploy rollback |
| Public profile open from dashboard | staging auth journey gate, synthetic seeded-user flow | Product / Tim | Forward-fix or deploy rollback |
| Checkout entry | staging billing gate | Billing / Tim | `checkoutEnabled` |
| Stripe webhook processing | staging billing gate plus Stripe event delivery | Billing / Tim | `stripeWebhooksEnabled` |
| High-risk cron fanout | Sentry Cron monitors for scheduled routes | Ops / Tim | `cronFanoutEnabled` |

## Deploy Model Notes

- Production DB migrations run before staging app verification.
- Schema changes therefore require additive compatibility.
- Rollback posture is forward-fix unless database isolation changes.

## Evidence Links

Fill these in for each launch batch:

- Launch candidate PR:
- Latest staging deploy:
- Latest staging auth journey gate:
- Latest staging billing gate:
- Latest 3 production synthetic runs:
- Latest Sentry error soak:
- Latest `/qa` report:

## Decision

- Go
- No-go
- Conditional go with named mitigation
