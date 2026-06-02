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
| Real browser auth mode | `pnpm test:auth:ios` kept this mode gated because `JOVIE_IOS_REAL_BROWSER_AUTH=1` was not set for this evidence pass. | Evidence required under JOV-2712 |

## Current Platform Status

| Platform | Status |
| --- | --- |
| iOS | Local auth callback, live-auth PR verification, and CI evidence are current for `9e9200348e`. |
| Web | Evidence required under JOV-2712. |
| Electron | Evidence required under JOV-2712. |
| Chrome Extension | Evidence required under JOV-2712. |

## Acceptance Checks

- No iOS auth dead end reproduced in the deterministic callback flows.
- No iOS redirect loop reproduced in the deterministic callback flows.
- No iOS stuck loading state observed in the generated signed-out/profile/chat screenshots.
- Remaining platform evidence is tracked by JOV-2712 rather than untracked notes.
