# Testing Optimization Plan

## Current Progress

- Introduced a dashboard API contract suite (`apps/web/tests/contracts/dashboard-apis.spec.ts`) to cover analytics, activity, profile, audience, and social link endpoints with consistent request/response validation.
- Replaced mock-heavy unit coverage with centralized contract helpers so tests assert API contracts and cache headers instead of internal implementation details.
- Documented rate limiting, idempotency, and normalization expectations inside the new suite to keep future assertions focused on client-facing behavior.

- `pnpm lint`: ~6.9s
- `pnpm typecheck`: ~20.0s
- `pnpm test:e2e`: ~3m28s — build aborted before tests because Turbopack could not download the Inter font from Google Fonts (network fetch failure in `apps/web/app/layout.tsx`). Re-run should succeed once font downloads are accessible or cached.

- Extend the contract harness to additional API surfaces (billing, tipping, onboarding) to reduce reliance on per-endpoint mocks.
- Evaluate lightweight fixtures or shared factories to broaden scenario coverage (error states, pagination edges) while keeping runtime low.
- Track gaps between contract coverage and live telemetry to ensure the highest-traffic endpoints receive regression-safe assertions first.
