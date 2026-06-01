# Electron Auth Fix Log

Date: 2026-06-01
Branch: codex/jov-2710-native-browser-auth

## Scope

- Route Electron sign-in/sign-up through a native handoff screen with a single centered `Continue in Browser` button.
- Keep Clerk UI out of Electron and let the external browser own the actual Clerk auth form.
- Align the iOS signed-out screen with the same browser-first pattern.
- Keep production Clerk settings untouched.

## Commands Run

- `JOVIE_AGENT_PROFILE=coder node --version`
  - Passed: `v22.22.1`.
- `JOVIE_AGENT_PROFILE=coder pnpm --version`
  - Passed: `9.15.4`.
- `JOVIE_AGENT_PROFILE=coder clerk --version`
  - Passed: Clerk CLI `1.5.0`.
- `JOVIE_AGENT_PROFILE=coder clerk doctor --json`
  - Failed project linkage check. Host/auth/version checks passed. No production Clerk settings were changed.
- `JOVIE_AGENT_PROFILE=coder pnpm --filter @jovie/desktop run typecheck`
  - Passed.
- `JOVIE_AGENT_PROFILE=coder pnpm --filter @jovie/desktop run test`
  - Passed desktop shell, URL disposition, DMG background, and release guard tests.
- `JOVIE_AGENT_PROFILE=coder pnpm --filter @jovie/web exec vitest run tests/unit/app/signin-page.test.tsx tests/unit/app/signup-page.test.tsx tests/unit/app/desktop-auth-page.test.tsx`
  - Passed: 3 test files, 28 tests.
- `JOVIE_AGENT_PROFILE=coder pnpm --filter @jovie/web exec vitest run tests/unit/profile/otp-input-comprehensive.test.tsx`
  - Passed: 1 test file, 13 tests.
- `JOVIE_AGENT_PROFILE=coder pnpm run test`
  - Passed: 5 tasks, 1562 web test files passed, 13059 tests passed, 18 skipped, 6 todo.
- `JOVIE_AGENT_PROFILE=coder pnpm run lint`
  - Passed: 4 tasks.
- `JOVIE_AGENT_PROFILE=coder pnpm run typecheck`
  - Passed: 8 tasks.
- `JOVIE_AGENT_PROFILE=coder pnpm run build`
  - Passed: 4 tasks.
- `JOVIE_AGENT_PROFILE=coder pnpm --filter @jovie/desktop run package:staging`
  - Passed. Produced staging desktop artifacts for version `26.6.1`; notarization was skipped because notarize options were unavailable.
- `JOVIE_AGENT_PROFILE=coder pnpm run test:auth:ios`
  - Passed: 18 AppState tests and 2 UI deep-link callback tests. Live native exchange and HTTPS browser auth smokes were skipped because their opt-in env flags were not enabled.
- `JOVIE_AGENT_PROFILE=coder node scripts/version-check.mjs`
  - Initially failed because `VERSION` and the desktop package were bumped to `26.6.1` without matching `version.json`, workspace package versions, and `CHANGELOG.md`; passed after version alignment.
- `JOVIE_AGENT_PROFILE=coder node scripts/desktop-release-guard.mjs --base origin/main`
  - Passed: desktop release is handled by `VERSION`.
- `JOVIE_AGENT_PROFILE=coder node scripts/next-proxy-guard.mjs` from `apps/web`
  - Passed.
- `JOVIE_AGENT_PROFILE=coder BASE_URL=http://localhost:3112 ELECTRON_CDP_URL=http://127.0.0.1:9223 JOVIE_PROTOCOL_OPEN_BUNDLE_ID=com.github.Electron doppler run --project jovie-web --config dev -- node apps/desktop/scripts/smoke-native-auth.mjs`
  - Failed: Playwright `connectOverCDP` timed out while trying to attach to Electron, despite raw CDP being reachable.

## Failing Evidence

- Electron initially reached auth routes before the navigation guards and preload bridge were reliably ready, so Clerk UI could appear inside the Electron surface.
- CDP inspection showed the renderer could load without `window.electronAPI`, which meant the handoff page could not open the external browser from Electron.
- The first route-level handoff heuristic treated `desktop_return` alone as a native runtime hint, which broke normal browser sign-in/sign-up fallback tests. The heuristic was narrowed so normal browser fallback keeps Clerk UI.
- The root test suite initially exited nonzero because `useSegmentedInput()` left a delayed blur timer alive after jsdom teardown. Cleanup was added.
- CI `Guardrails (proxy)` initially failed at `scripts/version-check.mjs` because the desktop release-triggering version bump was not propagated to `version.json`, workspace package versions, and `CHANGELOG.md`.
- Computer Use verified the real Electron UI handoff, but Chrome opened into the profile picker and restored an unrelated previous tab after selecting a profile. Because of that, fresh/existing browser sign-in, session persistence, authenticated Electron API calls, and sign-out clearing were not proven end-to-end in the live UI.

## Fixes Made

- Desktop navigation now opens `/auth/start` externally instead of loading auth pages inside Electron.
- Desktop auth provider allow-list now accepts only the exact Clerk host or one tenant label under `.clerk.accounts.dev`.
- Electron registers preload failure logging and installs navigation/window-open guards before the initial app load.
- The desktop preload now always exposes the Electron runtime marker and bridge; main-process IPC still validates sender origin/path and auth URL before opening browser auth.
- `/desktop-auth` now renders a simple centered Jovie logo and one `Continue in Browser` button. It no longer auto-opens the browser.
- `/signin` and `/signup` render a matching handoff fallback when they are reached from the Electron runtime.
- iOS signed-out auth now uses the same browser-first pattern with a centered logo and `Continue in Browser` button.
- Desktop/iOS/web tests were updated to assert the new handoff copy and behavior.
- `useSegmentedInput()` now clears its deferred blur timer and guards `document` access after teardown.
- Release metadata now aligns on `26.6.1` across `VERSION`, `version.json`, workspace packages, desktop package metadata, and `CHANGELOG.md`.

## Final Passing Evidence

- Local Electron launched against `http://localhost:3112` and showed only the native handoff screen in Electron:
  - Jovie logo centered.
  - `Continue in Browser` heading.
  - One `Continue in Browser` button.
  - No Clerk auth form in Electron.
- Computer Use clicked `Continue in Browser`; Electron moved to the waiting state:
  - `Continue signing in with your browser`.
  - `Cancel Sign-In`.
- Web auth route unit coverage passed.
- Desktop URL policy and preload contract tests passed.
- iOS auth AppState and deep-link UI tests passed.
- Repo lint, typecheck, unit test, build, and staging desktop package commands passed.

## Clerk Dashboard And Config

- No production Clerk dashboard settings were changed.
- Clerk CLI doctor still reports the local project is not linked, so dashboard-derived verification could not be completed through the CLI from this worktree.
- Minimal safe staging path before promoting this beyond a draft:
  - Link or select the correct non-production Clerk project in Clerk CLI.
  - Verify dev/staging allowed origins and redirects for the non-production Clerk instance only.
  - Include local development origin used for smoke testing, for example `http://localhost:3112`.
  - Include staging web origin, for example `https://staging.app.jov.ie`.
  - Include native return/deep-link routes used by the app: `/auth/start`, `/auth/callback`, `/auth/native-complete`, and `jovie://auth/complete`.
  - Do not change production Clerk settings unless a separate production rollout issue explicitly approves it.

## Success Criteria Status

- Electron local launch: verified.
- Fresh test user sign-up/sign-in: not live-verified because Chrome profile selection blocked the external browser continuation.
- Existing test user sign-in: not live-verified for the same reason.
- Authenticated Electron API calls: not live-verified from Electron after browser sign-in.
- Session persistence across restart: not live-verified.
- Sign-out clears local auth/session state: not live-verified.
- Correct local/dev Clerk key behavior and clear failure on missing/mismatched env: partially verified through existing env generation and Clerk CLI failure evidence; project linkage still needs non-production Clerk config verification.
- Unit/integration/e2e plus lint/typecheck/build: passed for the commands above, with live browser auth smokes still blocked/skipped.
- Computer Use Electron UI verification: passed for launch, handoff UI, and button click to waiting state.
