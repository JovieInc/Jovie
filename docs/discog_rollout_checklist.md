# Discog rollout, backfill, and monitoring checklist

The Discog ingestion path should launch safely behind a gate, support repeatable backfills, and surface failures quickly for admins.

## Feature gate plan

- **Gate**: `feature_discog_ingestion` (default: off) defined in `lib/statsig/flags.ts`.
- **Internal enablement**: create the gate in Statsig and enable only for staff emails/domains. Keep the global default `false` until the pilot is validated.
- **Wiring** (all must check `statsig.checkGate`/`checkGateForUser` before continuing):
  - `app/api/admin/creator-ingest/route.ts` – block Discog entry until enabled.
  - `app/api/admin/creator-ingest/rerun/route.ts` – guard admin rerun/backfill trigger.
  - `app/api/ingestion/jobs/route.ts` – worker polling should refuse Discog jobs when the gate is off.
- **Runtime behavior when off**: return `403` for admin attempts with a clear message (“Discog ingestion is gated”) and skip queueing worker jobs; do not mutate `ingestion_jobs` or profile state.

## Backfill + rerun path (admin-only)

- **Primary trigger**: extend `app/api/admin/creator-ingest/route.ts` to accept a Discog source (artist URL or ID) and enqueue an `ingestion_jobs` row with `jobType = 'import_discog'` plus a deterministic `dedupKey`.
- **Rerun/backfill**: reuse `app/api/admin/creator-ingest/rerun/route.ts` and `bulkRerunCreatorIngestionAction` to reset `ingestionStatus` to `pending` and enqueue a fresh Discog job. The unique `dedupKey` + `ingestion_jobs` unique index keeps reruns idempotent.
- **Safety**: keep retries bounded (`maxAttempts`/backoff already enforced in `ingestion_jobs`); always set `ingestionStatus` back to `pending` on rerun so the admin table reflects the active backfill.
- **Auditability**: store the new job ID and last enqueue timestamp on the profile (alongside `lastIngestionError`) so admins can see when the latest Discog sync kicked off.

## Monitoring and alerting

- **Logging**: emit structured logs via `logger`/Sentry with `jobType: 'import_discog'`, `creatorProfileId`, `sourceUrl`, `dedupKey`, and `attempt`. Capture exceptions with `Sentry.captureException` inside the Discog extractor and merge paths.
- **Surfacing to admins**: continue writing failures to `creator_profiles.lastIngestionError` and `ingestionStatus = 'failed'`; `AdminCreatorProfilesWithSidebar` already renders these badges in `/app/admin/creators`.
- **Signals**: add a Sentry alert that fires on `ingestion.job_failed` breadcrumb/tag for `jobType = import_discog`. Include a daily check of `ingestionStatus = 'failed'` counts and pending queue depth in the admin dashboard snapshot.

## Rollback

- Disable `feature_discog_ingestion` in Statsig to immediately stop new Discog work while keeping other ingestion paths live. Existing jobs should be marked `failed` with a “gate disabled” note so they do not retry until the gate is re-enabled.
