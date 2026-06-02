# Test Coverage Report

Tracking issue: [JOV-2712](https://linear.app/jovie/issue/JOV-2712/track-platform-hardening-deliverables-and-ios-evidence-baseline)

## Current Evidence

| Command | Evidence | Result |
| --- | --- | --- |
| `pnpm test:auth:ios` | Passed on `origin/main` `9e9200348e`. Ran 18 `AppStateTests` and 2 deterministic XCUITests: `testAuthCallbackDeepLinkCompletesHarness` and `testAuthCallbackProviderErrorShowsAuthError`. | Passed |
| `JOVIE_IOS_REAL_BROWSER_AUTH=1 pnpm test:auth:ios` | Passed through Doppler dev config against a temporary Cloudflare tunnel to local dev. Ran 18 `AppStateTests`, 2 deterministic XCUITests, and `testRealBrowserAuthProviderCompleteReachesAuthenticatedShell`. | Passed |
| `pnpm run ios:screenshots` | Passed on `origin/main` `9e9200348e`. Produced 7 screenshots in `artifacts/ios-screenshots`. | Passed |
| `pnpm run ios:performance` | Passed on `origin/main` `546e2af1f4`. Ran the opt-in `testSignedOutLaunchPerformance()` XCUITest with `XCTApplicationLaunchMetric(waitUntilResponsive: true)`. | Passed |
| `pnpm run ios:runtime-performance` | Passed locally after `e1df2767fc`. Ran opt-in `testShellNavigationRuntimePerformance()` for the deterministic Chat to Profile to Chat bottom-navigation transition with clock, CPU, and memory metrics. | Passed |
| `pnpm run ios:memory` | Passed locally after `318557208f`. Captured a `sample` footprint for the `-ui-testing-ready` shell and recorded the local `leaks --outputGraph` blocker in the run summary. Strict mode `JOVIE_IOS_MEMORY_REQUIRE_MEMGRAPH=1` exits nonzero when memgraph capture is blocked. | Evidence captured; memgraph blocked locally |
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
| iOS runtime performance summary | `artifacts/ios-test-results/runtime-performance/Test-Jovie-runtime-performance-2026.06.02_07-46-34-0700-summary.md` |
| iOS runtime performance result bundle | `artifacts/ios-test-results/runtime-performance/Test-Jovie-runtime-performance-2026.06.02_07-46-34-0700.xcresult` |
| iOS runtime performance log | `artifacts/ios-test-results/runtime-performance/Test-Jovie-runtime-performance-2026.06.02_07-46-34-0700.log` |
| iOS memory baseline summary | `artifacts/ios-test-results/memory-baseline/Jovie-memory-baseline-2026.06.02_06-27-15--0700/summary.md` |
| iOS memory baseline sample | `artifacts/ios-test-results/memory-baseline/Jovie-memory-baseline-2026.06.02_06-27-15--0700/ie.jov.Jovie-88803-2026.06.02_06-27-15--0700.sample.txt` |
| iOS memory strict-mode summary | `artifacts/ios-test-results/memory-baseline/Jovie-memory-baseline-2026.06.02_06-25-54--0700/summary.md` |
| iOS screenshots | `artifacts/ios-screenshots` |
