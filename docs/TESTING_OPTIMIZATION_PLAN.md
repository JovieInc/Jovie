# Testing Optimization Plan

## Progress – 2026-01-05

- Added a new `onboarding-complete-flow.spec.ts` Playwright suite that exercises the full sign-up → onboarding (name and handle) → first dashboard link creation path with a Clerk test-mode session. The suite also verifies the failure guard for taken handles without relying on network mocks, keeping coverage realistic for the core journey.
- Documented the runtime guard (`E2E_ONBOARDING_FULL=1` plus real Clerk/DB credentials) so the flow only runs when a production-like environment is available.

## Execution Metrics (local)

- `pnpm lint`: ~6.9s
- `pnpm typecheck`: ~20.0s
- `pnpm test:e2e`: ~3m28s — build aborted before tests because Turbopack could not download the Inter font from Google Fonts (network fetch failure in `apps/web/app/layout.tsx`). Re-run should succeed once font downloads are accessible or cached.

## Notes

- The new end-to-end coverage assumes live browser execution with Clerk test-mode tokens; keep `E2E_ONBOARDING_FULL=1` and real secrets available in CI to exercise the happy path. If the font download issue persists in CI, consider vendoring fonts or configuring Next.js to use a cached font directory to avoid external fetches during Turbopack builds.
