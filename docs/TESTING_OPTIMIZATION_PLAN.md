# Testing Optimization Plan

## Progress Update — Payment Flow (Stripe)
- Added end-to-end coverage for the Standard upgrade path via Stripe Checkout, including success, card-decline, and pricing fetch failure scenarios.
- Hardened billing E2E determinism by programmatically cancelling or applying subscriptions through signed webhook calls after each run.
- Documented required Stripe test configuration so the suite can exercise real payment flows instead of brittle mocks.

## Stripe Test Setup
1. Configure the following environment variables (test mode keys only):
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
   - `STRIPE_PRICE_STANDARD_MONTHLY` **or** `STRIPE_PRICE_STANDARD_YEARLY`
2. Ensure the configured price IDs are active in the Stripe test dashboard.
3. Use the built-in Stripe test cards when prompted:
   - Success: `4242 4242 4242 4242`, expiry `12/34`, CVC `123`, ZIP `94107`.
   - Decline: `4000 0000 0000 0002` (hard decline), same expiry/CVC/ZIP.
4. Webhooks: the payment E2E tests generate signed webhook payloads (`checkout.session.completed` + subscription lifecycle events) against `/api/stripe/webhooks`, so no external Stripe CLI forwarding is required for local runs.
5. Authentication: the tests rely on the configured Clerk E2E user (`E2E_CLERK_USER_USERNAME`/`E2E_CLERK_USER_PASSWORD`) to reach `/billing`.

## How to Run
- Full suite: `pnpm test:e2e`
- Stripe-only focus (faster feedback):
  - `pnpm test:e2e -- --grep "Billing payment flow - Stripe Checkout"`
- Lint & types (must stay green):
  - `pnpm lint`
  - `pnpm typecheck`

## Next Steps
- Add coverage for retrying failed webhook processing in staging (simulate delayed delivery) to further de-risk billing regressions.
- Capture Playwright traces for the Stripe flows in CI to speed up debugging if card collection UIs drift.
