# Electron Auth Fix Log

Date: 2026-06-01
Branch: codex/jov-2710-native-browser-auth

## Scope

- Route Electron sign-in and sign-up through a native handoff screen with a single centered `Continue in Browser` button.
- Keep Clerk UI out of Electron. The system browser owns the real Clerk form, then redirects back to Electron.
- Keep iOS on the same browser-first native auth model.
- Fix local development first, then document the minimal safe staging path.
- Do not modify production Clerk settings or commit secrets.

## Commands Run

- `JOVIE_AGENT_PROFILE=coder node --version`
  - Passed: `v22.22.1`.
- `JOVIE_AGENT_PROFILE=coder pnpm --version`
  - Passed: `9.15.4`.
- `JOVIE_AGENT_PROFILE=coder clerk --version`
  - Passed: Clerk CLI `1.5.0`.
- `JOVIE_AGENT_PROFILE=coder clerk doctor --json`
  - Failed project linkage check. Host/auth/version checks passed. No production Clerk settings were changed.
- Clerk API dev cleanup through the non-production secret from Doppler.
  - Deleted 55 `+clerk_test` users and 2 local DB rows to recover from the dev instance test-user cap.
- `node --check apps/desktop/scripts/smoke-native-auth.mjs`
  - Passed.
- `JOVIE_AGENT_PROFILE=coder pnpm --filter @jovie/web exec vitest run tests/unit/middleware/proxy-behavioral.test.ts tests/unit/lib/auth/build-app-shell-signin-url.test.ts tests/unit/app/native-complete-page.test.tsx`
  - Passed: 3 files, 86 tests.
- `JOVIE_AGENT_PROFILE=coder pnpm --filter @jovie/web exec vitest run tests/unit/app/native-complete-page.test.tsx tests/unit/desktop/native-complete.test.ts tests/unit/api/auth/native-exchange.test.ts`
  - Passed: 3 files, 11 tests.
- `JOVIE_AGENT_PROFILE=coder pnpm --filter @jovie/web exec vitest run tests/unit/lib/auth/routing-state.server.test.ts`
  - Passed after updating the expected native exchange TTL to 300 seconds.
- `JOVIE_AGENT_PROFILE=coder pnpm --filter @jovie/auth-routing exec vitest run`
  - Passed: 1 file, 22 tests.
- `JOVIE_AGENT_PROFILE=coder pnpm run test:auth:native`
  - Passed web, desktop, and iOS native auth test coverage. Live iOS smoke tests remained opt-in and were skipped because their env flags were not enabled.
- `JOVIE_AGENT_PROFILE=coder pnpm run lint`
  - Passed.
- `JOVIE_AGENT_PROFILE=coder pnpm run typecheck`
  - Passed.
- `JOVIE_AGENT_PROFILE=coder pnpm run build`
  - Passed.
- `JOVIE_AGENT_PROFILE=coder pnpm run test`
  - First rerun failed on one stale TTL assertion in `tests/unit/lib/auth/routing-state.server.test.ts`.
  - Final rerun passed: 5 Turbo tasks successful, 1,564 web test files passed, 13,074 tests passed, 18 skipped, 6 todo.
- `git diff --check`
  - Passed.
- Live Electron native auth smoke:
  - `JOVIE_AGENT_PROFILE=coder BASE_URL=http://localhost:3112 ELECTRON_CDP_URL=http://127.0.0.1:9223 SMOKE_SKIP_START_SIGNOUT=1 JOVIE_PROTOCOL_OPEN_BUNDLE_ID=com.github.Electron doppler run --project jovie-web --config dev -- node apps/desktop/scripts/smoke-native-auth.mjs`
  - Passed fresh sign-up, native callback, Electron auth, Bearer API call, sign-out, existing sign-in, and another Bearer API call.
- Live Electron restart persistence verifier through raw CDP.
  - Passed after restarting Electron without rotating `Jovie-Local` userData. Clerk user and session were still active and `/api/me` returned 200.
- Computer Use UI verification.
  - Verified the actual Electron window showed `Continue in Browser` with a single centered button and no embedded Clerk auth screen.
  - Clicked the button and verified Electron moved to `Cancel Sign-In` plus the distinct status `Check your browser.`

## Failing Evidence

- Clean local Electron could open a blank or aborted renderer after signed-out app-shell redirects.
- Electron could reach `/signin` before the handoff route intercepted it, which allowed embedded Clerk UI to appear in Electron.
- Next and proxy redirects sometimes surfaced relative paths like `/signin?...`; Electron navigation handling treated them as invalid or external inconsistently.
- `/auth/start` could return 429 locally when Redis-backed rate limiting was unavailable:
  - `status=429 retry-after=60 body={"error":"Too many auth attempts"}`
- Native completion could fail with `completion_consume_failed` and `missing-auth-completion` during React remount or StrictMode retry.
- Local cold compiles could expire the one-time native exchange before the browser callback loaded:
  - `native_exchange_failed status=401 reason=missing`
- The smoke harness originally created competing handoff states and hit PKCE verifier mismatch:
  - `native_exchange_failed status=401 reason=wrong_verifier`
- Node fetches to Clerk timed out locally while `curl` worked. Adding `--no-network-family-autoselection` fixed the Node path.
- Manual invalid protocol probe:
  - `open 'jovie://auth/complete?code=manual_probe&state=manual_state'`
  - Electron routed to `/auth/native-complete?client=electron&state=manual_state` and showed a clear auth error. Diagnostics included `native_exchange_failed status=401`.
- After `setActive`, Electron could reach the app route before Clerk's browser session was hydrated, causing authenticated API calls to return 401.
- The full repo test command caught a stale expected Redis TTL of 60 seconds after the exchange TTL was intentionally raised to 300 seconds.

## Fixes Made

- Electron local builds now use isolated user data at `Jovie-Local`; staging remains isolated at `Jovie-Staging`; production user data is untouched.
- Electron normalizes relative navigation and redirect URLs against `APP_URL`.
- Electron intercepts signed-out auth routes before loading Clerk UI in the renderer, then opens `/auth/start` in the system browser.
- Electron allows only the native completion page to load in-app during callback handling.
- Electron replays a recent same-state auth completion for 60 seconds to survive duplicate consume calls.
- Electron main-process load-abort handling retries the auth handoff for local signed-out redirects instead of leaving the app blank.
- `/auth/start` now redirects signed-in native clients to the same request origin callback, avoiding local origin drift.
- `/auth/start` uses a local/test-only in-memory limiter when Redis is unavailable outside production. Production stays fail-closed.
- The native exchange TTL is now 5 minutes. It remains one-time, state-bound, and PKCE-bound.
- Native exchange responses include `userId`, and the browser completion verifies Clerk activates the expected user before routing away.
- Native completion uses Clerk's ticket sign-in create flow, waits for session hydration, stores a safe return route fallback, and surfaces server failure reasons in diagnostics.
- Proxy routing now lets `/auth/start`, `/auth/callback`, and `/app/auth/callback` pass through correctly for authenticated native flows.
- Signed-out Electron app-shell navigation redirects to sign-in instead of rendering a broken protected shell.
- Web dev scripts include `--no-network-family-autoselection` to avoid the observed Node-to-Clerk timeout path.
- Added `apps/desktop/scripts/smoke-native-auth.mjs` for live Electron native auth smoke coverage.
- Added/updated focused web, proxy, auth-routing, desktop contract, and native completion tests.

## Final Passing Evidence

Live Electron smoke output:

```json
{
  "email": "native-mpvxoffx+clerk_test@test.jovie.com",
  "freshSignup": {
    "userId": "user_3EYj2lBwhjpdect5XUEVtrf8pPf",
    "electronUrl": "http://localhost:3112/auth/native-complete?client=electron&state=dd2239a35e8c43f2b2b6c93e11c1a9aa",
    "apiStatus": 200
  },
  "signedOut": {
    "url": "http://localhost:3112/auth/native-complete?client=electron&state=dd2239a35e8c43f2b2b6c93e11c1a9aa",
    "userId": null,
    "hasSession": false
  },
  "existingSignin": {
    "userId": "user_3EYj2lBwhjpdect5XUEVtrf8pPf",
    "electronUrl": "http://localhost:3112/app/chat?runtime=electron",
    "apiStatus": 200
  }
}
```

Electron restart persistence output, with session id redacted:

```json
{
  "href": "http://localhost:3112/start",
  "title": "Start with Jovie | Jovie",
  "loaded": true,
  "userId": "user_3EYj2lBwhjpdect5XUEVtrf8pPf",
  "sessionId": "[redacted]",
  "apiStatus": 200,
  "apiOk": true
}
```

Computer Use verified the actual Electron UI:

- Signed-out Electron showed only the centered native handoff with `Continue in Browser`.
- No Clerk form rendered inside Electron.
- Clicking `Continue in Browser` moved Electron to the waiting state: `Cancel Sign-In` and `Check your browser.`
- Server logs showed `/auth/start` was reached after the click.

Success criteria status:

- Electron local app launches from a clean local userData state: passed.
- Fresh test user can sign up/sign in: passed in live Electron smoke.
- Existing test user can sign in: passed in live Electron smoke.
- Authenticated API calls from Electron succeed: passed, `apiStatus: 200`.
- Session persists across app restart: passed.
- Sign-out clears local auth/session state: passed, `userId: null`, `hasSession: false`.
- Correct local/dev Clerk keys and clear env/config failure: passed for the Doppler dev smoke path; Clerk CLI project linkage failure is documented and did not require production settings.
- Relevant lint/typecheck/build/unit/integration/e2e-style smoke checks: passed as listed above.
- Computer Use verified the actual Electron UI flow: passed.

## Clerk Dashboard And Config

- Clerk MCP was not exposed by tool discovery in this environment. Local Clerk skills/docs, Clerk CLI, and Clerk API checks were used instead.
- No production Clerk dashboard settings were changed.
- No Clerk dashboard changes were made from this worktree.
- Clerk CLI `doctor` still reports this local worktree is not linked to a Clerk project, so dashboard-derived checks must be completed against the intended non-production Clerk project before staging rollout.

Minimal safe staging path:

- Use the staging/non-production Clerk instance and staging Clerk keys only.
- Do not modify production Clerk settings.
- Verify allowed origins for the staging web origin, for example `https://staging.app.jov.ie`.
- Verify local development origin used for smoke testing where needed, for example `http://localhost:3112`.
- Verify native callback handling for:
  - `jovie://auth/complete`
  - `/auth/start`
  - `/auth/callback`
  - `/auth/native-complete`
  - the configured iOS native/universal callback route for the staging app.
- Verify staging Electron runs with `ELECTRON_ENV=staging`, staging `APP_URL`, and `Jovie-Staging` userData.
- Repeat the native auth smoke against staging before removing human-review gating.

## Design Cleanup Follow-Up - 2026-06-01

Failing evidence:

- User screenshot showed the Electron auth handoff repeating the same browser instruction in the heading, button, and footer/status text.
- Computer Use against the installed `/Applications/Jovie.app` reproduced the stale duplicate-copy state, confirming the screenshot was a real installed-app issue and not just test drift.
- Desktop icon metadata showed Electron runtime icons were opaque square PNGs:
  - `apps/desktop/assets/icon.png` had `hasAlpha=false` and opaque black corners.
  - `apps/desktop/assets/icon-staging.png` had `hasAlpha=false` and opaque black corners.

Fixes made:

- Removed the visible Electron handoff heading and made the a11y heading screen-reader-only.
- Kept the idle Electron handoff to one visible action: `Continue in Browser`.
- Replaced the post-click repeated browser sentence with the distinct status `Check your browser.`
- Enlarged the Electron auth handoff window from `420x360` to `820x520` with generous centered spacing.
- Simplified `AuthUnavailableCard` and the static auth-degraded HTML fallback by removing repeated retry/footer/badge copy.
- Added a desktop-specific rounded transparent icon profile for Electron PNG/ICNS generation while keeping the existing opaque iOS/web app icon profile.

Commands run:

```bash
node --version
pnpm --version
gh pr view 9891 --json url,labels,mergeStateStatus,statusCheckRollup --jq '{url,labels:[.labels[].name],mergeStateStatus,checks:[.statusCheckRollup[] | {name,status,conclusion}]}'
JOVIE_AGENT_PROFILE=coder pnpm exec tsx apps/web/scripts/generate-brand-assets.ts
JOVIE_AGENT_PROFILE=coder pnpm --filter @jovie/web exec vitest run tests/unit/app/desktop-auth-page.test.tsx tests/unit/auth/AuthUnavailableCard.compact.test.tsx tests/unit/middleware/proxy-auth-degraded-html.test.ts
JOVIE_AGENT_PROFILE=coder pnpm --filter desktop run test:desktop-icon
JOVIE_AGENT_PROFILE=coder pnpm biome check --write apps/web apps/desktop/src/main.ts apps/desktop/scripts/desktop-icon-contract.test.mjs
JOVIE_AGENT_PROFILE=coder pnpm --filter @jovie/web run typecheck -- --pretty false
JOVIE_AGENT_PROFILE=coder pnpm --filter @jovie/desktop run typecheck
JOVIE_AGENT_PROFILE=coder pnpm --filter @jovie/desktop run test
JOVIE_AGENT_PROFILE=coder pnpm biome check .
JOVIE_AGENT_PROFILE=coder E2E_USE_TEST_AUTH_BYPASS=1 NEXT_PUBLIC_CLERK_MOCK=1 NEXT_PUBLIC_CLERK_PROXY_DISABLED=1 NODE_OPTIONS=--no-network-family-autoselection pnpm --filter @jovie/web exec next dev -H 127.0.0.1 -p 3112
JOVIE_AGENT_PROFILE=coder ELECTRON_ENV=local ELECTRON_APP_URL=http://127.0.0.1:3112 node scripts/write-env.mjs
JOVIE_AGENT_PROFILE=coder pnpm exec tsc
JOVIE_AGENT_PROFILE=coder ELECTRON_ENV=local ELECTRON_APP_URL=http://127.0.0.1:3112 pnpm exec electron --remote-debugging-port=9223 .
JOVIE_AGENT_PROFILE=coder pnpm --filter @jovie/web run build
```

Failed command evidence:

```bash
JOVIE_AGENT_PROFILE=coder pnpm --filter @jovie/web exec tsx apps/web/scripts/generate-brand-assets.ts
```

Failed because `pnpm --filter @jovie/web exec` changed the CWD to `apps/web`, doubling the path to `apps/web/apps/web/scripts/generate-brand-assets.ts`. Re-running from the repo root with `pnpm exec tsx apps/web/scripts/generate-brand-assets.ts` passed.

Final passing evidence:

- Focused web auth tests: 3 files passed, 22 tests passed.
- Desktop icon contract: 6 tests passed.
- Desktop typecheck: passed.
- Full desktop tests: passed icon, URL disposition, shell contract, DMG background, and release guard.
- Web typecheck: passed.
- Biome write pass: fixed 2 formatting issues, then root `pnpm biome check .` passed with no fixes.
- Web production build: passed, including static generation for 412 app routes.
- Icon metadata after regeneration:
  - `apps/desktop/assets/icon.png` has `hasAlpha=true` and transparent corners.
  - `apps/desktop/assets/icon-staging.png` has `hasAlpha=true` and transparent corners.
- Computer Use verified the actual worktree Electron UI:
  - Initial handoff: wide `820x520` window, logo, and a single `Continue in Browser` button.
  - No visible duplicate heading/footer copy.
  - Single click on the accessibility button reached the waiting state with `Cancel Sign-In` and `Check your browser.`

Clerk dashboard/config changes:

- No production Clerk settings changed.
- No Clerk dashboard changes made for this design cleanup.
- Local no-secret UI verification intentionally showed the server-side missing-Clerk failure in logs when the opened browser hit `/auth/start`; the prior live Doppler/Clerk smoke remains the auth end-to-end evidence for the full local flow.

## Code Review Follow-Up - 2026-06-01

Review findings addressed:

- Removed redundant `void openAuthUrl()` wrappers from the Electron auth handoff button handlers.
- Added a 30s timeout to the Clerk testing-token `fetch()` in `apps/desktop/scripts/smoke-native-auth.mjs`; the existing bounded `curl` fallback remains.
- Restricted `/auth/native-complete` signed-in fallback redirects to recoverable one-time completion replay errors only. Hard native exchange failures now stay on the retry/error screen.
- Polled Clerk hydration in the no-created-session native ticket path before failing the Electron completion route.
- Normalized comma-delimited forwarded host/proto headers before building same-origin Electron signin redirects.
- Switched `/auth/start` local Redis-unavailable fallback from matching a diagnostic reason string to a structured `rateLimit.unavailable === true` flag.

Commands run:

```bash
clerk whoami --mode agent
clerk doctor --mode agent
node --check apps/desktop/scripts/smoke-native-auth.mjs
JOVIE_AGENT_PROFILE=coder pnpm --filter @jovie/web exec vitest run app/auth/start/route.test.ts tests/unit/desktop/native-complete.test.ts tests/unit/app/native-complete-page.test.tsx
JOVIE_AGENT_PROFILE=coder pnpm biome check --write apps/web/app/auth/start/route.ts apps/web/app/auth/start/route.test.ts apps/web/app/app/\\(shell\\)/layout.tsx apps/web/lib/rate-limit/types.ts apps/web/lib/rate-limit/rate-limiter.ts apps/web/lib/desktop/native-complete.ts apps/web/app/\\(auth\\)/auth/native-complete/page.tsx apps/web/tests/unit/app/native-complete-page.test.tsx apps/web/app/\\(auth\\)/DesktopAuthRouteHandoff.tsx apps/web/app/desktop-auth/page.tsx apps/desktop/scripts/smoke-native-auth.mjs
JOVIE_AGENT_PROFILE=coder pnpm --filter @jovie/web run typecheck -- --pretty false
JOVIE_AGENT_PROFILE=coder pnpm --filter @jovie/desktop run typecheck
JOVIE_AGENT_PROFILE=coder pnpm --filter @jovie/web exec vitest run app/auth/start/route.test.ts tests/unit/desktop/native-complete.test.ts tests/unit/app/native-complete-page.test.tsx tests/unit/app/desktop-auth-page.test.tsx tests/unit/auth/AuthUnavailableCard.compact.test.tsx tests/unit/middleware/proxy-auth-degraded-html.test.ts
JOVIE_AGENT_PROFILE=coder pnpm --filter @jovie/desktop run test
JOVIE_AGENT_PROFILE=coder pnpm biome check .
JOVIE_AGENT_PROFILE=coder pnpm --filter @jovie/web run lint
JOVIE_AGENT_PROFILE=coder pnpm --filter @jovie/web run build
JOVIE_AGENT_PROFILE=coder pnpm biome check --write AUTH_FIX_LOG.md
```

Failed command evidence:

```bash
clerk doctor --mode agent
JOVIE_AGENT_PROFILE=coder pnpm biome check --write AUTH_FIX_LOG.md
```

Failed because this clean worktree is not linked to a Clerk application and has no local `.env.local` or `.env`:

- `Not linked to a Clerk application`
- `No .env.local or .env file found`

The Biome doc-only command failed because `AUTH_FIX_LOG.md` is ignored by the repo Biome config: `No files were processed in the specified paths.`

Neither failure required changing any Clerk dashboard settings or exposing secrets.

Final passing evidence:

- `clerk whoami --mode agent`: authenticated as the local operator account; project link is `null`.
- `node --check apps/desktop/scripts/smoke-native-auth.mjs`: passed.
- Focused review tests: 3 files passed, 11 tests passed.
- Expanded auth/design tests: 6 files passed, 33 tests passed.
- Full desktop test suite: passed.
- Desktop typecheck: passed.
- Web typecheck: passed.
- Root Biome check: 6069 files checked, no fixes applied.
- Web lint: 5858 files checked, no fixes applied.
- Web production build: passed, including static generation for 412 app routes and postbuild asset sync.

Clerk dashboard/config changes:

- No production Clerk settings changed.
- No Clerk dashboard changes made for this review follow-up.
- The minimal staging path remains: link/check the intended non-production Clerk app, pull non-production env only, verify allowed origins/callback routes, then rerun the native auth smoke against staging before removing human-review gating.
