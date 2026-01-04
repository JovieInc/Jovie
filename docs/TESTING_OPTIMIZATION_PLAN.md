# Testing Optimization Plan

## Progress Update (2026-01-04)

- Added admin ingestion pipeline integration coverage that exercises CSV-style input through data processing, profile creation, and notification responses in `apps/web/tests/integration/admin-ingestion.test.ts`.
- Verified the new flow against a real database connection to keep Neon parity with production and to validate ingestion job creation alongside profile enrichment.

- `pnpm lint`: ~6.9s
- `pnpm typecheck`: ~20.0s
- `pnpm test:e2e`: ~3m28s — build aborted before tests because Turbopack could not download the Inter font from Google Fonts (network fetch failure in `apps/web/app/layout.tsx`). Re-run should succeed once font downloads are accessible or cached.

- Extend ingestion coverage to job retry/backoff behavior and stuck job recovery paths.
- Add smoke coverage for claim-token email notifications once the invite system is wired to ingestion events.

## Test Data Notes

- Integration cases generate unique handles per run and clean up `creator_profiles`, `social_links`, and related `ingestion_jobs` records after execution.
- Tests require `DATABASE_URL` to point to a writable test branch; no seed data is necessary beyond what the test inserts.
