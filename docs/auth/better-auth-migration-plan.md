# Better Auth Migration Plan (Clerk → Better Auth)

> Status: APPROVED (autoplan review 2026-07-06, ENG CLEARED, 42 amendments folded in).
> Branch: `codex/better-auth-open-source-migration`. One PR, `big-pr` + `testing` labels.
> This doc is the execution contract. It supersedes the Clerk sections of `.claude/rules/auth.md`
> on merge.

## Why (business case + prior-art record)

**Problem.** Jovie's Clerk integration is the source of a recurring incident class: three key pairs
(dev/staging/prod), a fetch-based FAPI proxy at `/__clerk`, redirect-URI console drift
(2026-06-26 `redirect_uri_mismatch`), `CLERK_ENCRYPTION_KEY` 503s, and a hosted-vendor single point
of failure. Clerk also owns a second copy of user state (publicMetadata mirror) that must be kept in sync.

**Prior-art gate (adopt > wrap > build).** Category: authentication framework.
- *Stay on Clerk, delete the self-inflicted proxy complexity* — cheapest, but keeps the vendor SPOF,
  per-MAU pricing, and the "Clerk is your users table" coupling. Rejected: doesn't reach self-hosted.
- *Auth.js / NextAuth* — larger install base, $0, but weaker first-class Drizzle/session-cache/native
  story and no built-in one-time-token handoff. Rejected: more glue for the native flows.
- **Better Auth (adopt)** — open-source, self-hosted on the existing Neon+Drizzle+Upstash stack,
  first-class Drizzle adapter, secondary storage, cookie cache, bearer + one-time-token plugins that
  map cleanly onto Jovie's PKCE native handoff. Sept 2024, YC S25, 28.6k stars, 150k weekly downloads.
  Val Town's production Clerk→Better Auth migration confirms the exact failure modes we're escaping.
- *Supabase Auth* — Supabase in this org is gbrain-only; adopting it would add a second platform. Rejected.

**Decision: adopt Better Auth.** Verified against official docs + fetched source. Residual risk (a
young library on the security path) is mitigated by exact version pinning, Dependabot security watch,
and the repo's canary + auto-rollback gates.

**Effort budget.** ~2–3 human-weeks / CC-compressed; one PR through the credentials-first merge gate.
What it displaces: no revenue-path feature work runs in parallel on this branch.

## Cutover model

Production has effectively one real user (Tim, confirmed). Clean hard cutover: all sessions invalidate
once; returning users re-auth via Google/Apple/email-OTP; their existing `users` row is adopted by
verified email on first Better Auth sign-in. `clerk_id` is retained (now nullable) for one release as a
rollback breadcrumb. No bulk user migration, no parallel dual-auth run.

## Architecture

Better Auth owns four tables (`ba_users`, `ba_sessions`, `ba_accounts`, `ba_verifications` via
`modelName`), NOT mapped onto the app `users` table. Link column: `users.better_auth_user_id`
(nullable, unique). `users.clerk_id` becomes nullable.

- **Server:** `apps/web/lib/auth/better-auth.ts` — `betterAuth({ database: drizzleAdapter(db, {provider:'pg', transaction:false}), socialProviders: { google, apple(+appBundleIdentifier) }, plugins: [emailOTP, oneTap, bearer, oneTimeToken({expiresIn:5, disableClientRequest:true, storeToken:'hashed'}), nextCookies /*last*/], session: { expiresIn, updateAge, cookieCache:{enabled,maxAge:300}, storeSessionInDatabase:true }, secondaryStorage, databaseHooks, rateLimit:{enabled, storage:'secondary-storage', customRules} })`. Handler at `apps/web/app/api/auth/[...all]/route.ts` via `toNextJsHandler`.
- **Client:** `apps/web/lib/auth/client.ts` (`createAuthClient` + `emailOTPClient`, conditional `oneTapClient`); `apps/web/hooks/useJovieAuth.tsx` ports the existing `ClerkSafe*` context fan-out onto `authClient.useSession()`, keeping `useUserSafe`/`useAuthSafe`/`useSessionSafe` signatures + new `useJovieAuth`/`useJovieUser`/`useJovieSession` aliases. `useClerkSafe.tsx` becomes a re-export shim.
- **Provisioning:** Clerk webhook deleted; `databaseHooks.user.create.after → lib/auth/provision.ts#provisionAppUser` (idempotent: lookup by ba-id → adopt existing row by verified email `WHERE better_auth_user_id IS NULL` → insert new with waitlist status `ON CONFLICT DO NOTHING`), plus `gate.ts`'s existing lazy-create as the healing fallback. Hook is never-throw (Sentry + heal).
- **Session read tiers:** proxy hot path = `getSessionCookie(req)` (zero DB/Redis); `/` → `/app` convenience redirect = `getCookieCache(req)`; auth pages + layouts + actions + API = full `auth.api.getSession({headers})`. **Auth-page signed-in redirects use full getSession in the page (proxy does NOT redirect auth pages)** — avoids a cookie-cache staleness redirect loop.
- **Native handoff:** transport unchanged (deep links, PKCE Redis record, handoff window, Keychain, cookie jar). `/auth/callback` mints an OTT from the live browser session; `/api/auth/native/exchange` — iOS: server verifies OTT and returns a **fresh** session token (`internalAdapter.createSession`, independent of the browser session) for Keychain+bearer; Electron: returns the OTT, the `native-complete` page POSTs it to the built-in `/api/auth/one-time-token/verify` which sets the session cookie. iOS refreshes token/expiry from the bearer plugin's `set-auth-token` response header.
- **Redis:** `apps/web/lib/auth/secondary-storage.ts` over `getRedis()` — 500ms timeout race, returns strings (guards Upstash `automaticDeserialization`), Sentry-warn; `get`/`set` best-effort, **`delete` fails closed** (retry/escalate). In-memory fallback for local/test only; production rate-limit storage is Redis-or-DB, never in-memory. Postgres remains the durable session store.

## The 42 review amendments (folded in)

Full audit trail lives in the autoplan working notes. Load-bearing subset (all P1):
1. Durable rate limits on `/sign-in/social`, `/email-otp/send-verification-otp`, `/one-time-token/verify` (in-memory default is inert on Vercel; security.md bans it).
2. `oneTimeToken({disableClientRequest:true})` — the client-callable `generate` endpoint is a cookie→bearer exfil vector.
3. Own the Apple client-secret JWT: verify library behavior at the pinned version; if it needs a pre-signed ES256 JWT, add `generateAppleClientSecret()` (jose, from the .p8); add a `<30-day exp` watchdog either way. Handle multi-line PEM in Doppler.
4. iOS reads `set-auth-token` to refresh token/expiry (don't force-logout at the original `expiresAt`); set `session.expiresIn`/`updateAge`.
5. Pin `better-auth` exactly + `transaction:false` explicit + config test (the db.transaction ban passes only by the adapter's unpinned default).
6. `secondaryStorage` returns strings + contract test; `delete` fails closed (fail-open revocation otherwise).
7. Provision hook never-throw + upsert-idempotent + hook-vs-lazy-create concurrency test.
8. Scope Vercel-preview `trustedOrigins` to the project pattern (not `*.vercel.app`); derive `baseURL` from `VERCEL_URL`.
9. Audit every `clerk_id`-keyed read path beyond `users.clerk_id`: `billing.user_clerk_id` and ~13 files (chat, claim, profile services, feedback, mobile artist-context) — the billing/revenue path must resolve post-cutover.
10. Credentials-first merge gate (below).
11. `gate.ts` is MODIFIED not swap-only: excise `syncEmailFromClerk`, `getServerClerkClient`, `resolveVerifiedEmailFromClerkBackend`.
12. Desktop is NOT zero-changes: update the clerk-path allowlist (`apps/desktop/src/main.ts:285-286`, `navigation.ts:86,108,235`) or `audit-clerk-removal` fails.
13. Auth-page redirect-loop fix; OTP state completeness (auto-create, retire cross-mode nudges, code→copy table, MAX_ATTEMPTS lockout, timer-gated resend); OAuth error param contract + banner rewrite + verified google↔apple account linking; delete skeleton/`clerk.loaded` ready gate (form live at first paint, pin `data-auth-shell-ready`); delete `SignInTimeoutEscape`, rewrite `/api/auth/reset` for BA cookies; per-failure-class native-complete copy; session-loss → `/signin?redirect_url` + toast; cutover bounce reuses `?reset=1` toast.

Deferred to Linear (file at implementation start): passkeys, session-management UI, `JovieUser` adapter slim-down, Clerk console + DNS decommission (gated on soak), `clerk_id` column drop (next release), **captcha plugin** (durable rate limits ship in-PR regardless), chat-draft preservation on session loss.

## Env

Add (Doppler + the three env files `lib/env-server-schema.ts`, `lib/env-public.ts`, `lib/env-validation-rules.ts`):
`BETTER_AUTH_SECRET` (≥32, fail-fast preview/prod), `BETTER_AUTH_URL`, `AUTH_GOOGLE_CLIENT_ID`,
`AUTH_GOOGLE_CLIENT_SECRET` (**not** the Calendar connector's `GOOGLE_OAUTH_*`), `AUTH_APPLE_CLIENT_ID`,
`AUTH_APPLE_TEAM_ID`, `AUTH_APPLE_KEY_ID`, `AUTH_APPLE_PRIVATE_KEY`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`,
`E2E_TEST_MODE=1` (dev only). Remove all `CLERK_*`/`NEXT_PUBLIC_CLERK_*`; rename `NEXT_PUBLIC_CLERK_MOCK`
→ `NEXT_PUBLIC_AUTH_MOCK`. Every auth env-validation failure emits problem + cause + fix, not a bare zod error.

## Build order (one branch, 13 build-safe commits)

① deps + env (optional at first) → ② schema `lib/db/schema/better-auth.ts` + migration `0071_better_auth.sql`
(4 `ba_*` tables + indexes; `ALTER users ADD COLUMN better_auth_user_id text UNIQUE; ALTER users ALTER COLUMN clerk_id DROP NOT NULL`) → ③ server core inert → ④ client core inert → ⑤ server identity flip
(cached/gate/require-auth/session/entitlements/ban-check) → ⑥ proxy flip → ⑦ client flip (providers,
AuthShell, EmailCodeAuthForm, OneTap, ~45 mechanical import swaps) → ⑧ native → ⑨ dev test-auth bypass
(real BA sessions for personas) → ⑩ tests codemod + new helper + unit tests → ⑪ CI/canary/scripts/snapshot
→ ⑫ deletions + `@clerk/*` removed from manifests + env cleanup → ⑬ docs. Rebase daily (`proxy.ts` and
`RootView.swift` are the repo's hottest auth-adjacent files); claim migration `0071` late per one-number-per-train.

## Local dev auth in 60 seconds

```bash
pnpm run dev:web:browse
# then open:  /api/dev/test-auth/enter?persona=creator&redirect=/app/dashboard/earnings
```
Post-migration this route mints a **real Better Auth session** with zero external provider calls
(persona `creator` | `creator-ready` | `admin`). This is a named acceptance criterion + smoke test —
local dev must never require real OAuth or manual OTP. E2E uses the deterministic `424242` OTP
(gated: `E2E_TEST_MODE=1`, never `VERCEL_ENV=production`, test-email pattern only).

## Human / credential checklist (BLOCKS staging + prod verification and merge)

These require Tim's account access and cannot be automated (drive the consoles via `/auth-console-sync`
where possible; the .p8 and Doppler steps are manual):
1. **Google Cloud Console** (client `418036700153-…`, project `jovie-338618`): add redirect URIs
   `https://jov.ie|staging.jov.ie|http://localhost:3100` + `/api/auth/callback/google` and matching
   **JavaScript origins** (One Tap). Keep the Clerk URIs until cutover completes.
2. **Apple Developer** (team `G24T327LXT`, Service ID `ie.jov.signin`): add domains + return URLs
   `…/api/auth/callback/apple`; **create a new Sign in with Apple `.p8` key** — Clerk held the old one;
   record the Key ID, download once.
3. **Doppler** (dev/stg/prd): `BETTER_AUTH_SECRET` (unique per config), `AUTH_GOOGLE_CLIENT_SECRET`,
   `AUTH_APPLE_*`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `JOVIE_SYNTHETIC_AUTH_TOKEN` (stg), `E2E_TEST_MODE=1` (dev).

## Credentials-first merge gate

The PR may open as a **draft** with dev evidence (bypass personas, `424242` OTP, unit/E2E, builds, iOS/desktop
local) before credentials exist. It **must not merge** until the console + Doppler steps above are done AND the
staging OAuth probe (`oauth-providers.spec.ts` against the new `/api/auth/callback/*` redirect URIs) is green.
Merging first would leave `main` red at the staging canary.

## Verification matrix

Static: `validate-env`, `typecheck`, `biome:check`, `lint:no-native-dialogs`, `lint:contrast-ratchet`,
`next:proxy-guard`, `ci:harness:check`, `doc:freshness:check`.
DB: `drizzle:check`, `migration:validate`, `drizzle:verify:ci`.
Unit/native: `test:fast`, `test:auth:web`, `test:auth:native`, `test:auth:ios`, `@jovie/desktop test`.
E2E (Doppler dev): `e2e:auth-smoke`, `test:e2e:golden-path:ci`, `a11y:axe`, `e2e:visual`,
`screenshots:capture`, `test:lighthouse:onboarding:pr`, `test:lighthouse:dashboard:pr`.
iOS: `ios:lint`, `ios:test`, `ios:build`, `ios:screenshots`. Desktop: `@jovie/desktop typecheck/test`, `desktop:audit`.
Build/security: `build:web`, `turbo:verify-cache`, `security:scan-secrets`, `security:verify-secret-scan`.
New unit tests: better-auth-config, provider-gating, secondary-storage (string + fail-closed), native-exchange
matrix (+ client-generate rejection, double-redeem), bearer forged-token, provision race, redirect-uri-snapshot
(replaces fapi-host-snapshot), env-validation, test-otp-hook, proxy hot paths, Apple-secret expiry.
Fresh-context verifier subagent at: post-plan (this doc), post-server/client, post-proxy/native, pre-PR, post-CI-evidence.

## Rollback

Pre-merge: close/revert the PR (migration `0071` is additive — `ba_*` tables + nullable columns are harmless
to Clerk code). Clerk consoles/keys/Doppler secrets stay intact until a separate soak-gated decommission
follow-up, so a revert restores Clerk auth fully. `clerk_id` stays populated one release.

## Production cutover (post-merge, Phase 13 — Tim gated)

Confirm DB backup → Tim bootstrap dry-run → bootstrap → verify Tim browser Google/Apple/One Tap →
iOS Google/Apple → Mac Google/Apple → production auth smoke → synthetic monitoring → canary + post-promote
smoke. Keep the rollback deploy path ready until all gates pass.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Young library on the security path | Exact version pin + Dependabot + canary/auto-rollback |
| Apple client-secret 6-month expiry | `<30-day` watchdog + canary alert |
| Redis object-vs-string mass sign-out | `secondaryStorage` string contract + unit test; Postgres durable session store |
| Fail-open revocation | `delete` fails closed |
| Billing keyed on clerk_id | Dedicated clerk-id coupling audit + tests before flip |
| Long-lived branch conflicts | Daily rebase; land fast once green |
| Merge before OAuth verified | Credentials-first merge gate |
