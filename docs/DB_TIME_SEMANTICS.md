# Database time semantics audit

Status: JOV-3063 evidence, 2026-09-27. This document classifies the bounded
expiry, consent, job, event, calendar-date, and recipient-local fields reviewed
for `DB-AUDIT-20260913/10-time-semantics`. It does not authorize a blanket
conversion of bare PostgreSQL timestamps.

## Runtime and driver evidence

- The production health response at commit
  `b9b5fb9c53f0fbc8144eacb11d11e94b3d7eadc1` reported Node `v22.23.2` on
  Linux and a healthy database connection on 2026-09-27. The repository and
  production workflow define no `TZ` override. The checked agent host resolved
  Node's timezone as `UTC`.
- The production database `TimeZone` GUC was not readable in this lane: the
  local Doppler client had no token. A UTC response timestamp does not prove a
  process timezone, and a healthy DB probe does not prove its GUC. Historical
  DDL therefore remains blocked until a credentialed read records
  `SHOW TimeZone`, `SHOW log_timezone`, the deployed Node resolved timezone,
  and affected-column counts/types.
- Drizzle 0.45.3 writes every `Date` with `toISOString()`. Its PostgreSQL
  timestamp mapper decodes a bare timestamp string with an explicit UTC suffix.
  The reviewed application comparisons pass JavaScript `Date` values rather
  than comparing these columns to SQL `now()`.
- The raw Neon driver does interpret an unzoned timestamp in the Node process
  timezone. Reproduction with `2026-03-08 02:30:00` yielded `02:30Z` under
  `TZ=UTC`, `07:30Z` under `America/New_York`, and `10:30Z` under
  `America/Los_Angeles`. That is a real boundary hazard for raw-driver access,
  but it is not the behavior of the current Drizzle paths.

## Bounded inventory

| Field | Semantic class | Stored-value provenance | Decision |
| --- | --- | --- | --- |
| `creator_profiles.claim_token_expires_at` | Instant | `generateClaimTokenPair()` creates a `Date`; claim-invite writes use Drizzle | Keep bare pending production provenance; expiry arithmetic fixed below |
| `leads.claim_token_expires_at` | Instant | The same token generator supplies lead routing | Keep bare pending production provenance |
| `notification_subscriptions.sms_consent_at` | Instant/audit evidence | Subscribe and JOIN webhook paths pass `new Date()`; first write wins with consent hash/version | Keep bare pending stored-row audit |
| `notification_contacts.sms_consent_at` | Instant/audit evidence | JOIN webhook and verified reactivation pass `new Date()` | Keep bare pending stored-row audit |
| `lead_funnel_events.occurred_at` | Instant/event | Funnel writers pass `Date` values, including parsed provider observations | Keep bare pending stored-row audit |
| `ingestion_jobs.run_at`, `ingestion_jobs.next_run_at` | Instant/job | Enqueue uses `new Date()`; retry uses millisecond backoff | JOV-3071 owns one coordinated migration; do not duplicate it here |
| `waitlist_invites.run_at`, `creator_claim_invites.send_at` | Instant/job | Application enqueue/send times | Inventory only; provenance is not complete |
| `fan_release_notifications.scheduled_for`, `tasks.scheduled_for` | Instant/job | Application scheduling accepts `Date` | Inventory only; provenance is not complete |
| `merch_fulfillment_jobs.next_run_at` | Instant/job | Queue and retry code use `Date` plus millisecond backoff | Inventory only; provenance is not complete |
| `discog_releases.release_date`, `discog_releases.reveal_date` | Calendar date | DSP/catalog inputs commonly have day or partial-date precision | Never blanket-convert to `timestamptz`; preserve the displayed date |
| `leads.latest_release_date` | Calendar date | Spotify release-date text is parsed for scoring | Never blanket-convert to `timestamptz` |
| `release_tasks.due_date` | Calendar date | Derived from a release date plus whole-day offsets | Never blanket-convert to `timestamptz` |
| `recipient_preferences.quiet_hours_start/end` + `timezone` | Intentional local wall time | `HH:mm` plus a validated IANA zone | Preserve the pair; DST gap/fold policy belongs to recipient-local scheduling |
| `tour_dates.start_date` + `timezone` | Instant plus event-local zone | Already `timestamptz` with a separate optional IANA zone | Preserve both exact instant and venue-local display context |

Existing neighboring models demonstrate the intended instant representation:
workflow run/lease times, profile-search schedules, recipient marketing consent,
and product-update token expiry already use `timestamptz`.

## Reproduced failure and bounded fix

Claim tokens promise a duration of 30 days. The former implementation used
local-calendar `getDate()`/`setDate()`. Under `America/New_York`, a token issued
before the 2026 spring gap lasted 719 hours and one issued before the fall fold
lasted 721 hours. The implementation now adds exactly 30 24-hour periods in
milliseconds. The regression test covers both neighboring DST states and
restores the process timezone after each case.

No expiry, consent, event, or job column changes type in this change. Current
Drizzle behavior did not reproduce the ticket's claimed Node-zone comparison
failure, and production GUC/stored-value evidence was unavailable. Converting
those values with `AT TIME ZONE 'UTC'` now would therefore be an assumption.

## Migration and recovery gate

**Ship now:** the exact-duration claim expiry fix and its spring-gap/fall-fold
regression proof.

**Re-evaluate when:** JOV-3063 has a credentialed production read of database
and deployed Node timezone settings plus per-column type/count/range evidence;
JOV-3071 also names the single owner for ingestion scheduler DDL.

**Then:** generate one append-only Drizzle migration for only the rows whose
writer interpretation is proven. Bound lock/statement time, reconcile every
converted value by round-tripping it to its original wall value, exercise the
inverse conversion on an isolated Neon branch, and retain that inverse as the
forward recovery migration. Old and new application versions must both pass
read/write and expiry/scheduler boundary tests before production enrollment.
Deployment and recurrence proof, not source merge, closes the audit item.
