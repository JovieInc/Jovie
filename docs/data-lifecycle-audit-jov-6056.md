# JOV-6056 data lifecycle audit

Status: source audit and bounded remediation, 2026-09-27. This is an evidence
map, not a second privacy silo. The canonical, machine-checked inventory of
sensitive data classes lives in `apps/web/lib/privacy/data-classes.ts` and is
gated by `apps/web/tests/unit/privacy/data-classes.test.ts`. Composes with
JOV-6045 (authz/fail-closed) and JOV-6044 (integrity/restore); the finance
lifecycle slice remains owned by JOV-4613.

## What exists today

| Surface | Implementation | Notes |
| --- | --- | --- |
| Account erasure | `POST /api/account/delete` | `users.deletedAt` fence + anonymize, then FK-cascade/explicit deletes, Vercel Blob sweep for founder-review recordings, handle/profile cache invalidation. Idempotent and retry-safe. |
| Account export | `GET /api/account/export` | JSON export of user, settings, profiles, links, contacts. Rate-limited, RLS-scoped via `appUserIdFilter`. |
| Retention | `POST? GET /api/cron/data-retention` + `/api/cron/purge-pixel-ips` + `cleanup-*` crons | Deletes ~17 event/log/token tables at 90d (chat at 365d); batched deletes; dry-run stats via `getRetentionStats`. |
| Lifecycle registry | `lib/privacy/data-classes.ts` | Every sensitive data class declares purpose, owner, retention, deletion mechanism, export channel, vendors. |
| New-store gate | `tests/unit/privacy/data-classes.test.ts` | Scans every `pgTable` in the schema index; any table holding PII/credential/payment-shaped columns must be registered or the test fails. |

## Deletion semantics

Account deletion is *fence-then-cascade*: `users` is anonymized first
(name/email/Stripe ids nulled, `deletedAt` set, status `banned`) so racing
writes — e.g. a pre-issued founder-review upload callback — cannot attach new
retained data; the callback rechecks the fence after insert. Profile-owned
tables are removed by the route or by `onDelete: cascade` FKs. Derived copies
handled: handle-availability and profile caches invalidated; Vercel Blob media
deleted (with a post-delete sweep for callbacks that raced the first read).

Not covered by erasure today (resurrection/leftover risk is low but real):

- Backups/snapshots: deleted rows persist in Postgres PITR/snapshots until
  snapshot expiry; restore semantics after erasure are owned by JOV-6275
  (restore drill) — a restored user row must not re-activate without re-running
  the erasure fence.
- Vendor copies: Stripe customer objects, Clerk identities, Resend contact
  state, Printful order records are governed by vendor APIs/DPA; the route does
  not call vendor deletion endpoints.
- Delayed webhooks: `stripe_webhook_events`/`webhook_events` keep processed
  rows for the retention window; an in-flight webhook retried after erasure
  lands on an anonymized/banned user — entitlement writers must treat banned
  users as terminal (authz slice, JOV-6045).
- Derived stores: `memory_*` graph, analytics aggregates, and lead/waitlist
  rows are not keyed for cascade — documented as `unmanaged` in the registry.

## Export completeness

`GET /api/account/export` covers: `users`, `user_settings`, `creator_profiles`,
`social_links`, `creator_contacts`. Registry `export` fields mark the rest.

Documented gaps: chat transcripts, tips/payments detail, merch orders,
connected-account metadata, notification subscriptions, feedback/interviews,
finance (owned by JOV-4613), and inbox threads are `none` or `admin-export`
only. Cross-owner authorization is exercised by RLS (JOV-6045 slice) plus the
export route's `appUserIdFilter` scoping; a completeness test enumerating every
registered `account-export` table against the route payload is follow-up work.

## Retention and observability

`runDataRetentionCleanup` is observable: per-table deleted counts, duration,
and cutoffs are logged and breadcrumbed to Sentry; `getRetentionStats` gives a
dry-run verifier. Pixel IPs are purged separately. Retention windows are
declared per class in the registry; tables with `unmanaged` deletion are the
explicit gap list for follow-up PRs.

## Vendor map (from code)

Stripe (billing/tips/merch), Clerk (legacy identity), Resend (email in/out),
Twilio (SMS), Vercel Blob (media/recordings), Meta/Google/TikTok (pixel
tokens + forwarded events), Apple (wallet passes), Plaid (finance — JOV-4613),
Printful (merch fulfillment), Sentry (error telemetry — payload hygiene via
`lib/sentry/config.ts`).

## Gate for new sensitive stores

The coverage test treats any table whose columns match personal/credential
patterns (email, phone, ip, address, fingerprint, token/secret, clerk ids,
and named identity columns) as sensitive and requires a registry entry with
complete lifecycle metadata. New stores fail CI until classified; entries that
reference non-existent tables or duplicate another class also fail.

## Follow-ups (not in this PR)

- Export completeness test enumerating `account-export`-registered tables.
- Vendor deletion calls (Stripe/Clerk) in the erasure path.
- Restore-after-erasure proof (JOV-6275) so a snapshot restore cannot
  resurrect a fenced account into active paths.
- Retention jobs for `memory_*`, `inbox` threads, leads/waitlist rows.
- Feed class coverage into the JOV-6064 assurance matrix.

## Verification

```text
pnpm --filter=@jovie/web exec vitest run tests/unit/privacy/data-classes.test.ts --config vitest.config.fast.mts
```
