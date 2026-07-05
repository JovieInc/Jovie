# Bulk Press-Photo Import Gate (JOV-2878)

## Decision (2026-06-08)

Bulk DSP press-photo import remains **deferred** in production. The ingestion
implementation (`ingestDspPressPhotos`) is wired only behind a two-layer gate:

1. Statsig gate `bulk_press_photo_import` (default off)
2. Platform activation evidence evaluation (`lib/press-photos/activation-evidence.ts`)

Manual single-photo upload in the profile drawer remains the default and only
user-facing import path today.

## Activation evidence definition

Evidence is evaluated on a rolling 30-day window using `profile_photos` and
`creator_avatar_candidates` signals:

| Signal | Purpose |
|---|---|
| Manual press-photo upload count | Users are actively adding press photos |
| Profiles with manual press photos | Breadth of adoption |
| Profiles with 2+ manual press photos | Migration / bulk-import demand proxy |
| Ingested draft count | Existing auto-ingest residue monitoring |
| Avatar-candidate profile count | DSP enrichment prerequisite health |

### Pass thresholds

Bulk import is allowed only when **either**:

- `manualUploadCount >= 20` **and** `manualUploadProfiles >= 8`, or
- `profilesWithMultipleManualPressPhotos >= 5`

### Current status

No production rollout is planned until analytics/support review confirms the
thresholds above. Operators can force evidence evaluation to pass in non-prod via
`BULK_PRESS_PHOTO_IMPORT_EVIDENCE_OVERRIDE=passed`.

## Runtime entry point

`scheduleBulkPressPhotoImportIfEligible()` is called after successful profile
enrichment when avatar candidates were added. It logs allow/block decisions and
never replaces the manual upload flow.

## Out of scope

- AI body estimation
- Broad media-library management
- Social/sharing workflows
- Onboarding auto-ingest wiring (blocked until evidence + gate pass review)

## Revisit checklist

1. Pull manual press-photo upload metrics from analytics + DB
2. Confirm support/customer migration requests
3. Enable `bulk_press_photo_import` for an internal allowlist in Statsig
4. Re-run unit tests and add screenshots for draft approval UX