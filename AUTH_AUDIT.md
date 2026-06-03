# Auth Audit

Tracking issue: [JOV-2712](https://linear.app/jovie/issue/JOV-2712/track-platform-hardening-deliverables-and-ios-evidence-baseline)

## Scope

This audit tracks sign-up, sign-in, sign-out, session refresh, session
expiration, deep linking, browser redirects, mobile redirects, Clerk
integration, Supabase integration, protected routes, and permission enforcement
across Web, iOS, Electron, and Chrome Extension.

## iOS Evidence

| Flow | Evidence | Result |
| --- | --- | --- |
| Live Clerk email-code bootstrap | PR [#9907](https://github.com/JovieInc/Jovie/pull/9907) merged as `9e9200348e`. The branch isolated live and auto-auth UI test keychains, cleared stored live-auth sessions for the signed-out launch mode, and forwarded live-auth env into XCTest via `TEST_RUNNER_*`. | Passed and merged |
| Default iOS auth/test suite | `pnpm run ios:test` passed before PR #9907 merge; iOS CI `Build And Test` passed in 24m58s on PR #9907. | Passed |
| Native custom-scheme auth callback | `pnpm test:auth:ios` passed on `origin/main` `9e9200348e`. It ran 18 `AppStateTests` and 2 deterministic XCUITests: `testAuthCallbackDeepLinkCompletesHarness` and `testAuthCallbackProviderErrorShowsAuthError`. | Passed |
| Native exchange live-auth smoke | Local live run before PR #9907 merge passed with `CODE_SIGNING_ALLOWED=YES`, `JOVIE_IOS_LIVE_AUTH=1`, and `JOVIE_IOS_LIVE_AUTH_UI=1`; the unit integration and live UI tests passed. | Passed for dev credentials |
| Real browser auth mode | `JOVIE_IOS_REAL_BROWSER_AUTH=1 pnpm test:auth:ios` passed through Doppler dev config against a temporary Cloudflare tunnel to local dev. It ran the HTTPS ASWebAuthenticationSession test `testRealBrowserAuthProviderCompleteReachesAuthenticatedShell`. | Passed |
| TestFlight launch crash guard | Installed TestFlight build `1.0 (40)` crash reports showed `EXC_BREAKPOINT` with Swift `_assertionFailure` after the Release config rejected a `pk_test` Clerk key. PR #9918 replaced the launch-time fatal error with a fail-closed path, and PR #9920 restored mock UI-test auth behavior. Main TestFlight run `26841365624` distributed build `1.0 (42)`; local build 42 launched and remained running with no fresh `Jovie*.ips` crash report. | Passed for no-crash launch |
| TestFlight live sign-in config | Local build `1.0 (42)` still embeds a `pk_test` Clerk publishable key and therefore shows `Sign-in Unavailable`. Production Clerk secret/config remediation is tracked by [JOV-2713](https://linear.app/jovie/issue/JOV-2713/provision-production-clerk-key-for-ios-testflight-sign-in). | Open |

## Current Platform Status

| Platform | Status |
| --- | --- |
| iOS | Local auth callback, real-browser auth callback, live-auth PR verification, TestFlight launch no-crash proof, and CI evidence are current through `8e333b2e97`; live TestFlight sign-in remains blocked by JOV-2713. |
| Web | Evidence required under JOV-2712. |
| Electron | Evidence required under JOV-2712. |
| Chrome Extension | Evidence required under JOV-2712. |

## Acceptance Checks

- No iOS auth dead end reproduced in the deterministic callback flows.
- No iOS redirect loop reproduced in the deterministic callback flows.
- No iOS real-browser auth dead end reproduced in the HTTPS ASWebAuthenticationSession flow.
- No iOS stuck loading state observed in the generated signed-out/profile/chat screenshots.
- No iOS TestFlight launch crash reproduced after installing build `1.0 (42)` locally.
- Remaining platform evidence is tracked by JOV-2712 rather than untracked notes.
