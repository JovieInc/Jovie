# Auth & Onboarding (App Router)

This directory contains the App Router auth pages for Jovie. The primary auth UI
is SSO-only: Jovie renders first-party Google and Apple buttons, then starts
Better Auth OAuth through `authClient.signIn.social`.

**Clerk is retired.** Do not mount ClerkProvider, do not proxy `/__clerk`, and
do not import `@clerk/*`.

## Runtime Model

- `/signin` and `/signup` render `AuthShell` inside `AuthLayout`.
- OAuth callbacks land on `/api/auth/callback/google` and
  `/api/auth/callback/apple`.
- Provider enablement is the hardcoded allowlist in
  `apps/web/lib/auth/oauth-providers.ts` (`apple` + `google`).
- Email OTP uses Better Auth's emailOTP plugin. Local/E2E may use the
  deterministic `424242` code when `E2E_TEST_MODE=1`.
- Local QA uses `/api/dev/test-auth/enter?persona=creator&redirect=/app`.

## Testing Notes

- `tests/e2e/auth.setup.ts` uses Better Auth helpers in
  `tests/helpers/auth.ts` (`E2E_USE_TEST_AUTH_BYPASS=1`).
- `tests/e2e/auth.spec.ts` uses a fresh signed-out context so `/signin` and
  `/signup` are tested as public auth pages.

Canonical agent rules: `.claude/rules/auth.md`.
