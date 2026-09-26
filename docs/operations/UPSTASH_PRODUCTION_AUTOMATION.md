# Upstash production automation

## Bound resource

The operator is fail-closed against one independently resolved resource:

| Field | Value |
|---|---|
| Database | `Jovie-1` |
| Database ID | `11d5c151-1fe9-4b37-af35-842dfe495090` |
| Endpoint | `real-kiwi-157253.upstash.io` |
| Vercel project | `prj_HPZm5iGtARQ2qef6g2xtjgFIGDVY` |

`scripts/upstash-production-operator.mjs` re-reads the database from the
provider and matches all three database fields before it returns stats or
permits a password reset. It does not accept an arbitrary database ID, endpoint,
URL, or HTTP method.

## Allowed management operations

- `GET /v2/redis/database/{exact-database-id}`
- `GET /v2/redis/stats/{exact-database-id}`
- `POST /v2/redis/reset-password/{exact-database-id}`, only after the exact
  database ID and endpoint are supplied as a second confirmation

Billing, plan changes, auto-upgrade, database configuration mutation, flush,
delete, and arbitrary provider API calls are not implemented. `auto_upgrade`
was verified false during setup and automation must not change it.

The Upstash reset-password operation replaces the active REST credential; it is
not a second simultaneously valid token. A rotation orchestrator must therefore
consume the returned credential in-process, update only Vercel production
`UPSTASH_REDIS_REST_TOKEN`, deploy the approved source SHA, and prove the Redis
canary plus web and iOS authentication before declaring success. Never print or
persist the returned credential in logs or artifacts.

## Quota headroom monitoring (JOV-5022)

`node scripts/upstash-production-operator.mjs quota` verifies the bound
database identity, reads `total_monthly_requests` from the stats endpoint,
and evaluates it against the verified 500,000 monthly request ceiling
(`auto_upgrade` is false, so the ceiling is a hard failure point, not a
billing threshold). It prints a JSON receipt with `percentUsed`,
`breachedThreshold`, and `status`, then exits `2` when any alert threshold —
70%, 85%, or 95% — is crossed. Malformed or missing usage data fails closed.

`.github/workflows/upstash-quota-headroom.yml` runs this every 6 hours on a
declared schedule (enablement and the Production `UPSTASH_EMAIL`,
`UPSTASH_API_KEY`, and `SLACK_WEBHOOK_URL` secrets are operational
prerequisites). A breached threshold routes one Slack alert through the
existing Production webhook — the founder/owner route — and leaves the run
red. The monthly usage counter resets with the provider billing period.

This monitor is read-only and alert-only. Choosing and applying the capacity
remedy (upgrade, plan change, or traffic reduction) remains a human-gated
billing decision; nothing here mutates the database, plan, or credentials.

## Runtime canary and alerts

The existing hourly `redisOperability` sub-job in `/api/cron/frequent` executes
one namespaced `SET`, `GETDEL`, and idempotent `DEL`, with a 60-second TTL and a
two-second client timeout. At most 2,232 Redis commands are added per 31-day
month. Quota exhaustion, read mismatch, missing configuration, and provider
unavailability remain distinct failure classes. Authentication routing and
native exchange state are Postgres-backed, so a Redis failure must not block
login.

## Redacted setup receipt, 2026-08-14

- Credential name: `jovie-prod-redis-automation-20260814`
- Account scope: authenticated Upstash Personal account
- Credential mode: Read/Write, no expiration
- Credential fingerprint: `c7a80f9f29a0`
- Production secrets: `UPSTASH_API_KEY`, `UPSTASH_EMAIL`
- Provider verification: HTTP 200; exactly one account database; exact identity
  match to the bound resource above
- Database state: active; free tier; request limit 500,000; auto-upgrade false
- Old credential: retained; no deletion or revocation performed
- Secret values: intentionally omitted
