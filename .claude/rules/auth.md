---
paths: ["apps/web/**/auth/**", "apps/web/proxy.ts", "apps/web/tests/**"]
---

# Auth (Better Auth + E2E Bypass)

Read this before touching auth, `proxy.ts`, or local/E2E auth flows.

**Clerk is retired.** Do not import `@clerk/*`, do not add `CLERK_*` /
`NEXT_PUBLIC_CLERK_*` env, do not create Clerk test users, and do not
teach Clerk as the live auth path. Identity is Better Auth only.

## Better Auth Architecture

Jovie owns sessions on Neon + Drizzle + Upstash. Better Auth is configured in
`apps/web/lib/auth/better-auth.ts` and served at `/api/auth/[...all]` via
`toNextJsHandler`.

- **Server:** `auth.api.getSession({ headers })` — use this in pages, layouts,
  actions, and API routes. Request-scoped wrappers: `getCachedAuth()`,
  `getOptionalAuth()`, `getCachedCurrentUser()` in `apps/web/lib/auth/cached.ts`.
- **Client:** `apps/web/lib/auth/client.ts` (`createAuthClient`). UI hooks live
  in `apps/web/hooks/useJovieAuth.tsx` (`useJovieAuth` / `useUserSafe` /
  `useAuthSafe` / `useSessionSafe`). New code imports from `useJovieAuth`.
- **Proxy hot path:** cookie presence only (`getSessionCookie`). Public `/`
  always passes through. Auth pages do **not** redirect in proxy — the page
  runs a full `getSession` so stale cookies cannot loop.
- **OAuth:** hardcoded allowlist in `apps/web/lib/auth/oauth-providers.ts`
  (`apple` + `google`). Do **not** reintroduce env gates for which provider
  buttons render. Console redirect URIs are Better Auth callbacks
  (`/api/auth/callback/google`, `/api/auth/callback/apple`).
- **Native handoff:** `/auth/callback` mints a one-time token; iOS exchanges
  it for a bearer session. Do not reintroduce a Clerk publishable key on iOS.

### DO NOT

- Import `@clerk/nextjs`, `@clerk/backend`, `@clerk/testing`, or any `@clerk/*`
- Add `CLERK_*`, `NEXT_PUBLIC_CLERK_*`, or `E2E_CLERK_*` env vars
- Proxy `/__clerk` or decode a Clerk FAPI host
- Create `+clerk_test` emails or call `setupClerkTestingToken`
- Document Clerk dashboard / Clerk CLI as the operator path

### If auth breaks

1. Check `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` for the active host
2. Check Google/Apple console redirect URIs match `/api/auth/callback/*`
3. Check `/api/health/auth` — it reports Better Auth readiness, not Clerk keys
4. For local/E2E, debug the bypass route first (`/api/dev/test-auth/enter`)

## OAuth Provider Button Enablement (Allowlist, Not Env)

**Canonical:** `apps/web/lib/auth/oauth-providers.ts` — hardcoded allowlist
(`apple` + `google`). Do **not** reintroduce `NEXT_PUBLIC_CLERK_OAUTH_*_ENABLED`
or any env gates for which provider buttons render.

## OAuth Console Redirect URIs (Google + Apple)

Better Auth hands Google/Apple `https://<host>/api/auth/callback/<provider>`.
That URI **must** be registered in the Google OAuth client + Apple Service ID
consoles.

- **Single source of truth:** `apps/web/lib/auth/oauth-redirect-uris.expected.json`.
  Print/verify with `pnpm tsx scripts/auth-redirect-uris.ts [--verify prod|staging]`.
- **These consoles have NO CLI/API.** To register/update redirect URIs, run the
  **`/auth-console-sync`** skill. Do not ask the user to do it manually.
- **Guardrails:** `apps/web/tests/e2e/oauth-providers.spec.ts` (`@production-smoke`)
  probes the Google/Apple authorize endpoints with the real redirect_uri.

## Local Auth Bypass For Perf and E2E

Local Playwright QA auth is bypass-first.

When local perf or E2E work needs an authenticated session on loopback/private
hosts, use the repo's Better Auth test-auth bypass. Do not assume an external
auth vendor bootstrap is required.

- Enable `E2E_USE_TEST_AUTH_BYPASS=1` for local authenticated test runs.
- Use `/api/dev/test-auth/session` to mint bypass cookies for programmatic flows.
- Use `/api/dev/test-auth/enter?persona=...&redirect=/app` for browser bootstrap.
- Use `persona=creator` for the free, incomplete onboarding baseline.
- Use `persona=creator-ready` for the Pro-entitled dashboard QA baseline.
- Use `persona=admin` for the admin-shell baseline; it is **not** the paid
  creator baseline.
- Validate the loopback host you are actually using (`localhost` vs
  `127.0.0.1`) — host-only cookies do not cross between them.

This path mints a **real Better Auth session** and does **not** require
`NEXT_PUBLIC_E2E_MODE=1`.

## QA Authentication (Jovie-Specific)

When running Playwright `/qa` against local Jovie, agents **MUST** use the
built-in Better Auth bootstrap. **Do NOT prompt the user for credentials.**

### Local default flow (`localhost`, `127.0.0.1`, private dev IPs)

1. Start the auth-bypass dev server if a live app is required:

   ```bash
   pnpm run dev:web:browse
   ```

2. Authenticate via the bypass route:

   ```text
   /api/dev/test-auth/enter?persona=creator&redirect=/app/dashboard/earnings
   ```

3. Use `persona=admin` only when you intentionally need admin QA:

   ```text
   /api/dev/test-auth/enter?persona=admin&redirect=/app/admin
   ```

### What this does

- sets Better Auth session cookies automatically
- provisions a stable creator persona by default
- avoids OTP entry and cookie handoff
- works without `NEXT_PUBLIC_E2E_MODE=1`

### Agent rules

- local Playwright QA uses the Better Auth bootstrap route above
- default persona is `creator`; `admin` is opt-in
- solve auth yourself with this flow or `E2E_USE_TEST_AUTH_BYPASS=1`
- `scripts/browse-auth.ts` is a Playwright cookie helper for non-loopback hosts only

### Do NOT

- prompt the user for credentials
- fill a vendor sign-in form manually for local QA
- invoke `/browse` or `$B`
- enable `NEXT_PUBLIC_E2E_MODE=1` just to make local QA auth work
- create Clerk test users or use `@clerk/testing`

## E2E Authentication

Use the Better Auth helpers in `apps/web/tests/helpers/auth.ts`.

- Enable `E2E_USE_TEST_AUTH_BYPASS=1` (Playwright configs already do this locally).
- Call `signInUser(page)` / `ensureSignedInUser(page)` / `setTestAuthBypassSession(page, persona)`.
- Email OTP tests type the deterministic code `424242` (gated: `E2E_TEST_MODE=1`,
  never `VERCEL_ENV=production`, test-email pattern only).

### Test user creation pattern (canonical)

1. Prefer a bypass persona. Do not invent vendor test-email suffixes.
2. If an email OTP spec needs a unique address, use a Jovie test pattern
   (`e2e+<id>@example.com`), never `+clerk_test`.
3. Assert authenticated state before continuing the flow.

### Do NOT in E2E auth tests

- Do **not** reuse auth sessions across tests that validate auth behavior.
- Do **not** hardcode OTP codes other than the gated `424242` test OTP.
- Do **not** import `@clerk/testing` or call `setupClerkTestingToken`.
- Do **not** mock Better Auth in Playwright E2E tests.

### Golden path references

- `apps/web/tests/e2e/onboarding.spec.ts` — fresh-user onboarding via Better Auth helpers.
- `apps/web/tests/e2e/auth.setup.ts` — shared auth bootstrap that writes `tests/.auth/user.json`.

### Test user cleanup

E2E users are tagged in the app DB. Prefer the Better Auth / DB cleanup scripts
over any vendor dashboard.

```bash
doppler run --project jovie-web --config dev -- pnpm tsx apps/web/scripts/cleanup-e2e-users.ts --force
```

For manual browse auth outside Playwright:

```bash
doppler run --project jovie-web --config dev -- pnpm tsx scripts/browse-auth.ts \
  --base-url http://localhost:3002 \
  --output /tmp/browse-auth-cookies.json \
  --persona creator
```

Full docs: `apps/web/tests/TESTING.md`.

## Schema / identity

`users.better_auth_user_id` is the live link to `ba_users.id`. Prefer that
(and `users.id`) in new code.

`users.clerk_id` remains nullable for one-release compatibility with historical
rows only. Do not add a Clerk SDK to read it. Do not invent a bulk migration
to drop the column in this change.

## Operator tools

There is no Clerk CLI. Inspect Better Auth users in Neon (`ba_users`,
`ba_sessions`, `users.better_auth_user_id`). Sync Google/Apple console
redirect URIs with `/auth-console-sync`.
