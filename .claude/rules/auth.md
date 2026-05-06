# Auth (Clerk Proxy + E2E Bypass)

Read this before touching anything Clerk-related, the `proxy.ts` middleware, or local/E2E auth flows.

## Clerk Auth Proxy Architecture

**CRITICAL — read this before touching anything Clerk-related.**

Jovie uses three distinct Clerk key pairs:
- **Dev** (`dev`, account A development instance): local/dev worktrees use the `pk_test_...` + dev secret pair from Doppler `jovie-web/dev`
- **Staging** (`stg`, account B production instance): `staging.jov.ie` uses `CLERK_PUBLISHABLE_KEY_STAGING` + `CLERK_SECRET_KEY_STAGING`
- **Production** (`prd`, account A production instance): `jov.ie` uses `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY`

The proxy path is `/__clerk`. ClerkProvider sets `proxyUrl="/__clerk"`. All Clerk JS requests go to `/__clerk/*` on the current origin. Dev mode doesn't use the proxy — ClerkProvider talks directly to Clerk.

### How the proxy works

- Middleware in `proxy.ts` intercepts `/__clerk/*` and `/clerk/*` paths
- Decodes the FAPI host from the active publishable key at runtime
- Uses `fetch()` to proxy with the correct `Host` header set to the decoded FAPI host
- Uses strict host routing: `staging.jov.ie` must use the staging key pair and must never fall back to production keys

### DO NOT

- Use `NextResponse.rewrite()` for clerk paths — Vercel doesn't set the Host header correctly, causing Clerk 400 "Invalid host"
- Use `vercel.json` rewrites as the primary mechanism — same Host header problem
- Hardcode FAPI hosts — always decode from the resolved publishable key
- Use `clerk.jov.ie` or `clerk.staging.jov.ie` as public-facing URLs — traffic goes through `/__clerk` path proxy only
- Add satellite/custom proxy domains — they cost money and are unnecessary with the fetch proxy

## Clerk CLI and Agent Setup Guardrails

Jovie already has a custom Clerk architecture. Agents must not apply generic
Clerk quickstarts or let Clerk-generated files rewrite app wiring.

Allowed Clerk CLI use is limited to non-mutating diagnostics:

- `clerk --version`
- `clerk --help`
- `clerk skill install --help`
- other read-only diagnostics that do not create files, link instances, pull
  env vars, or rewrite config

Agent-only setup may run:

```bash
./scripts/clerk-agent-setup.sh
```

That helper may call `clerk skill install -y --pm pnpm`. It is intentionally
wired from `scripts/codex-setup.sh`, not from shared `scripts/setup.sh`, so
normal developer setup does not mutate agent/vendor instruction state. The
helper must not fail repo setup if the Clerk CLI is missing or the agent is not
logged in.

### Do NOT run these as an agent

- `clerk init`
- `clerk link`
- `clerk env pull`
- `clerk doctor --fix`
- generated `middleware.ts` creation
- generated Clerk env rewrites
- any setup flow that replaces the existing `/__clerk` proxy architecture

### If Clerk auth breaks

1. Check the `fetch()` proxy in `proxy.ts` decodes the FAPI host from the resolved publishable key
2. Check the active runtime exposes the correct key pair for that host:
   - production uses `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY`
   - staging uses `CLERK_PUBLISHABLE_KEY_STAGING` + `CLERK_SECRET_KEY_STAGING`
3. Check CSP allows the decoded FAPI host in `connect-src`, `script-src`, `frame-src`
4. If staging auth is broken, do not let `staging.jov.ie` fall back to production Clerk keys; fail closed to the auth-unavailable state instead

## Local Auth Bypass For Perf and E2E

Local `/browse` auth is bypass-first, not Clerk-form-first.

When local perf or E2E work needs an authenticated session on loopback/private hosts, prefer the repo's dev auth bypass before assuming Clerk bootstrap is required or broken.

- Enable `E2E_USE_TEST_AUTH_BYPASS=1` for local authenticated test runs.
- Use `/api/dev/test-auth/session` to mint bypass cookies for programmatic flows.
- Use `/api/dev/test-auth/enter?persona=...&redirect=/app` for browser bootstrap flows.
- Use `persona=creator` for the free, incomplete onboarding baseline.
- Use `persona=creator-ready` for the Pro-entitled dashboard QA baseline.
- Use `persona=admin` for the admin-shell baseline; it is **not** the paid creator baseline.
- Validate the loopback host you are actually using (`localhost` vs `127.0.0.1`) — host-only cookies do not cross between them.
- If auth bootstrap fails locally, debug the bypass route/cookie flow first instead of treating it as an expected limitation.

This path sets bypass cookies directly and does **not** require `NEXT_PUBLIC_E2E_MODE=1`.

## QA & Browse Authentication (Jovie-Specific)

When running `/qa` or `/browse` against local Jovie, agents **MUST** use the built-in dev auth bootstrap. **Do NOT prompt the user for credentials. Do NOT ask for cookie import help.**

### Local default flow (`localhost`, `127.0.0.1`, private dev IPs)

1. Start the browse-compatible dev server:

   ```bash
   pnpm run dev:web:browse
   ```

2. Authenticate the browse session by opening:

   ```text
   /api/dev/test-auth/enter?persona=creator&redirect=/app/dashboard/earnings
   ```

3. Use `persona=admin` only when you intentionally need admin QA:

   ```text
   /api/dev/test-auth/enter?persona=admin&redirect=/app/admin
   ```

### What this does

- sets the local auth-bypass cookies automatically
- provisions a stable creator browse persona by default
- avoids Clerk sign-in, OTP entry, and cookie handoff
- works without `NEXT_PUBLIC_E2E_MODE=1`

### Agent rules

- `/browse` on local Jovie means: use the dev auth bootstrap route above
- default persona is `creator`; `admin` is opt-in
- if auth is needed on local browse QA, solve it yourself with this flow
- only use `scripts/browse-auth.ts` as a fallback helper for non-loopback hosts
- only use `/setup-browser-cookies` for importing a real human session when a human explicitly wants that path

### Do NOT

- prompt the user for credentials
- fill the Clerk sign-in form manually for local QA
- claim auth is blocked on local `/browse` without trying `/api/dev/test-auth/enter?...`
- enable `NEXT_PUBLIC_E2E_MODE=1` just to make browse auth work

## E2E Authentication with Clerk

Use Clerk's official Playwright testing helpers whenever an E2E test needs auth.

- Official docs: `https://clerk.com/docs/testing/playwright/test-helpers`
- In this repo, `setupClerkTestingToken({ page })` must run **before** navigating to Clerk pages so the token is attached to Clerk FAPI calls.
- Auth pages must include ClerkProvider, so start auth on `/signin` (not `/`).

### Test user creation pattern (canonical)

1. Create a unique test email with the Clerk testing suffix:
   ```ts
   const email = `e2e+clerk_test+${Date.now().toString(36)}@example.com`;
   ```
2. Call `setupClerkTestingToken({ page })`.
3. Navigate to `/signin` and wait for `window.Clerk?.loaded`.
4. Use `createOrReuseTestUserSession(page, email)` from `apps/web/tests/helpers/clerk-auth.ts`.
5. Assert authenticated state before continuing the flow.

### Do NOT in E2E auth tests

- Do **not** reuse auth sessions across tests. Each test that validates auth behavior must start from a fresh context/session.
- Do **not** hardcode OTP codes in test code.
- Do **not** use pre-authenticated Clerk tokens to skip sign-up/sign-in flows unless the test scope explicitly starts post-auth.
- Do **not** mock Clerk auth in Playwright E2E tests.

### Golden path references

- `apps/web/tests/e2e/onboarding.spec.ts` — canonical fresh-user Clerk-authenticated onboarding flow using `setupClerkTestingToken({ page })` plus `createOrReuseTestUserSession(page, email)`.
- `apps/web/tests/e2e/auth.setup.ts` — canonical shared auth bootstrap that writes `tests/.auth/user.json`.

### Test user cleanup

E2E users are tagged with metadata (`role: 'e2e'`).

- Interactive cleanup: `doppler run --project jovie-web --config dev -- pnpm tsx apps/web/scripts/cleanup-e2e-users.ts`
- Non-interactive (agents/CI): `doppler run --project jovie-web --config dev -- pnpm tsx apps/web/scripts/cleanup-e2e-users.ts --force`
- Dry run: `doppler run --project jovie-web --config dev -- pnpm tsx apps/web/scripts/cleanup-e2e-users.ts --dry-run`
- Re-seed users: `doppler run --project jovie-web --config dev -- pnpm tsx apps/web/scripts/setup-e2e-users.ts`

**Agent cleanup requirement:** Agents **MUST** run cleanup after any session that creates test accounts via sign-up flows (E2E tests, `/qa` runs that trigger signup):

```bash
doppler run --project jovie-web --config dev -- pnpm tsx apps/web/scripts/cleanup-e2e-users.ts --force
```

This deletes all Clerk users matching either `role: 'e2e'` metadata OR `+clerk_test` email pattern, AND their corresponding database records (cascading to related tables). Only works against test Clerk instances (`sk_test_` keys). Safe to run repeatedly.

For manual browse auth outside Playwright, use:

```bash
doppler run --project jovie-web --config dev -- pnpm tsx scripts/browse-auth.ts \
  --base-url http://localhost:3002 \
  --output /tmp/browse-clerk-cookies.json \
  --persona creator
```

Then import the exported cookies into browse.

Full docs: `apps/web/tests/TESTING.md`.
