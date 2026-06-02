# Test Coverage Report

Tracking issue: [JOV-2712](https://linear.app/jovie/issue/JOV-2712/track-platform-hardening-deliverables-and-ios-evidence-baseline)

## Current Evidence

| Command | Evidence | Result |
| --- | --- | --- |
| `pnpm test:auth:ios` | Passed on `origin/main` `9e9200348e`. Ran 18 `AppStateTests` and 2 deterministic XCUITests: `testAuthCallbackDeepLinkCompletesHarness` and `testAuthCallbackProviderErrorShowsAuthError`. | Passed |
| `JOVIE_IOS_REAL_BROWSER_AUTH=1 pnpm test:auth:ios` | Passed through Doppler dev config against a temporary Cloudflare tunnel to local dev. Ran 18 `AppStateTests`, 2 deterministic XCUITests, and `testRealBrowserAuthProviderCompleteReachesAuthenticatedShell`. | Passed |
| `pnpm run ios:screenshots` | Passed on `origin/main` `9e9200348e`. Produced 7 screenshots in `artifacts/ios-screenshots`. | Passed |
| `pnpm run ios:performance` | Passed on `origin/main` `546e2af1f4`. Ran the opt-in `testSignedOutLaunchPerformance()` XCUITest with `XCTApplicationLaunchMetric(waitUntilResponsive: true)`. | Passed |
| PR #9907 iOS CI `Build And Test` | Passed before merge of `9e9200348e`. | Passed |

## Platform Coverage Matrix

| Platform | Required coverage | Current status |
| --- | --- | --- |
| Web | Playwright, unit tests, integration tests. | Evidence required under JOV-2712 |
| iOS | XCTest and XCUITest. | Current auth callback, real-browser auth, and screenshot smoke evidence recorded |
| Electron | End-to-end tests, auth flow tests, deep link tests. | Evidence required under JOV-2712 |
| Chrome Extension | Popup tests, background script tests, authentication tests, messaging tests. | Evidence required under JOV-2712 |

## Artifacts

| Artifact | Path |
| --- | --- |
| iOS auth callback test result | `artifacts/ios-test-results/auth-callback/Test-Jovie-2026.06.02_05-12-56--0700.xcresult` |
| iOS app state test result | `artifacts/ios-test-results/app-state/Test-Jovie-2026.06.02_05-12-21--0700.xcresult` |
| iOS real-browser auth test result | `artifacts/ios-test-results/real-browser-auth/Test-Jovie-2026.06.02_05-30-14--0700.xcresult` |
| iOS launch performance test result | `artifacts/ios-test-results/launch-performance/Test-Jovie-launch-performance-2026.06.02_05-52-46-0700.xcresult` |
| iOS launch performance log | `artifacts/ios-test-results/launch-performance/Test-Jovie-launch-performance-2026.06.02_05-52-46-0700.log` |
| iOS screenshots | `artifacts/ios-screenshots` |
