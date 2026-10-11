# Jovie security context

Jovie is a Next.js App Router monorepo (`apps/web`) for music artists: public
artist profiles, smart links, tipping, releases, and a signed-in dashboard. It
also ships a Mac app (`apps/desktop`, Electron) and an iOS app (`apps/ios`).

## Trust boundaries

- Auth is Better Auth (`apps/web/lib/auth/`). `require-auth.ts` and
  `cached.ts` resolve the session; API routes and server actions must call
  them before reading or writing user data. Test-auth bypass helpers exist for
  E2E only and must fail closed when `VERCEL_ENV=production`.
- Entitlements are centralized in `apps/web/lib/entitlements/registry.ts` and
  `server.ts`. Paid access must come from `getCurrentUserEntitlements()`, never
  from a raw plan string or a direct billing-row read in a handler.
- Admin access is a role check (`isAdmin`), independent of billing.
- Stripe webhooks (`apps/web/app/api/stripe/webhooks/`) must verify the
  signature before parsing business logic, and dedupe durably (Redis or DB).
- Other webhooks (Sentry, Linear, internal Ovie/Summer routes) are
  authenticated by shared secrets or signatures; compare them in constant time.
- Profile claim (`apps/web/lib/claim/`, `app/api/onboarding/claim/`) binds an
  artist profile to an account; cross-tenant takeover is the main risk.
- Uploads (`app/api/images/upload/`) accept user files; check type, size,
  ownership, and storage path construction.
- CSP domains come from `apps/web/constants/platforms/cdn-domains.ts`.
- `apps/web/proxy.ts` is the edge proxy (there is no `middleware.ts`).
- Cron routes under `app/api/cron/` require the cron secret.
- Env access goes through `apps/web/lib/env.ts` (Zod-validated).

## Data

Postgres (Neon) through Drizzle. Tenant data is keyed by user and creator
profile ids; any query that takes an id from the request must scope it to the
session owner. Redis (Upstash) holds rate limits and dedupe keys.

## Not in scope

Test files, fixtures, generated files, `.claude/` and `.agents/` agent
configuration, and marketing copy. Report real, exploitable issues with the
file, lines, evidence, and a concrete fix.
