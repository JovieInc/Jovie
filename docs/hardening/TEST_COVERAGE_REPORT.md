# Test Coverage Report

Tracking issue: [JOV-2712](https://linear.app/jovie/issue/JOV-2712/track-platform-hardening-deliverables-and-ios-evidence-baseline)

## Current Evidence

| Command | Evidence | Result |
| --- | --- | --- |
| `pnpm test:auth:ios` | Passed on `origin/main` `9e9200348e`. Ran 18 `AppStateTests` and 2 deterministic XCUITests: `testAuthCallbackDeepLinkCompletesHarness` and `testAuthCallbackProviderErrorShowsAuthError`. | Passed |
| `JOVIE_IOS_REAL_BROWSER_AUTH=1 pnpm test:auth:ios` | Passed through Doppler dev config against a temporary Cloudflare tunnel to local dev. Ran 18 `AppStateTests`, 2 deterministic XCUITests, and `testRealBrowserAuthProviderCompleteReachesAuthenticatedShell`. | Passed |
| `pnpm run ios:screenshots` | Passed on `origin/main` `9e9200348e`. Produced 7 screenshots in `artifacts/ios-screenshots`. | Passed |
| `bash apps/ios/scripts/run-xcodebuild.sh test -only-testing:JovieUITests/JovieUITests/testChatComposerPreservesDraftAcrossShellNavigation` | Passed on `codex/ios-chat-draft-hardening` after `86ba0c65f9`. Verified one iOS chat composer input, typed a draft, navigated Chat to Profile to Chat, and asserted the draft value was preserved. | Passed |
| XcodeBuildMCP `test_sim -only-testing:JovieTests/AppStateTests` | Passed on `codex/ios-profile-retry-hardening`. Ran 19 `AppStateTests`, including `profileLoadFailureShowsRecoveryStateAndRetryRestoresDashboard`, which verifies a profile API server failure shows a recoverable dashboard error and retry restores `.previewReady`. | Passed |
| XcodeBuildMCP `test_sim -only-testing:JovieTests/AppStateTests` | Passed on `codex/ios-offline-stale-cache`. Ran 20 `AppStateTests`, including `staleProfileSnapshotShowsOfflineStateAndRetryClearsIt`, which verifies stale cached profile data keeps the dashboard loaded in offline state and retry clears offline when fresh data returns. | Passed |
| XcodeBuildMCP `test_sim -only-testing:JovieTests/AppStateTests` | Passed on `codex/ios-cold-offline-recovery`. Ran 21 `AppStateTests`, including `coldOfflineProfileLoadShowsOfflineStateAndRetryClearsIt`, which verifies a cold transport failure shows a recoverable dashboard error, marks the shell offline, and retry clears offline when fresh data returns. | Passed |
| `pnpm run ios:performance` | Passed on `origin/main` `546e2af1f4`. Ran the opt-in `testSignedOutLaunchPerformance()` XCUITest with `XCTApplicationLaunchMetric(waitUntilResponsive: true)`. | Passed |
| `pnpm run ios:runtime-performance` | Passed locally on `codex/ios-frame-hitch-evidence` after `c9be9b797a`. Ran opt-in `testShellNavigationRuntimePerformance()` for the deterministic Chat to Profile to Chat bottom-navigation transition with clock, CPU, memory, and iOS 26+ hitch metric requests; the xcodebuild log emitted no measured hitch or frame metric lines. | Passed |
| `pnpm run ios:memory` | Passed locally after `318557208f`. Captured a `sample` footprint for the `-ui-testing-ready` shell and recorded the local `leaks --outputGraph` blocker in the run summary. Strict mode `JOVIE_IOS_MEMORY_REQUIRE_MEMGRAPH=1` exits nonzero when memgraph capture is blocked. | Evidence captured; memgraph blocked locally |
| PR #9907 iOS CI `Build And Test` | Passed before merge of `9e9200348e`. | Passed |
| PR #9918/#9920 focused crash hardening | XcodeBuildMCP `test_sim -only-testing:JovieTests/MobileAuthFinalizationTests` passed with 7 tests; focused XCUITests for signed-out launch, settings logout, auth callback success, and provider-error paths passed 4/4. | Passed |
| PR #9920 iOS CI `Build And Test` | Pull-request iOS CI run `26840623483` passed in 22m47s. | Passed |
| Main iOS CI `Build And Test` | Push iOS CI run `26841366664` passed for merge commit `8e333b2e970e4d9d8d42c658e8c0c4e73d9e70c8`. | Passed |
| Main iOS TestFlight upload | Push TestFlight run `26841365624` uploaded, processed, and distributed internal build `1.0 (42)` to testers. | Passed |
| Local TestFlight launch smoke | Local TestFlight updated Jovie for iOS to build `42`; launching the updated app left the `Jovie` process running and no `Jovie*.ips` diagnostic report was created after launch. | Passed |

## Platform Coverage Matrix

| Platform | Required coverage | Current status |
| --- | --- | --- |
| Web | Playwright, unit tests, integration tests. | Evidence required under JOV-2712 |
| iOS | XCTest and XCUITest. | Current auth callback, real-browser auth, screenshot smoke, chat draft stability, profile API retry, stale-cache offline, cold-offline retry, TestFlight no-crash launch, and TestFlight upload evidence recorded |
| Electron | End-to-end tests, auth flow tests, deep link tests. | Evidence required under JOV-2712 |
| Chrome Extension | Popup tests, background script tests, authentication tests, messaging tests. | Evidence required under JOV-2712 |

## Artifacts

| Artifact | Path |
| --- | --- |
| iOS auth callback test result | `artifacts/ios-test-results/auth-callback/Test-Jovie-2026.06.02_05-12-56--0700.xcresult` |
| iOS app state test result | `artifacts/ios-test-results/app-state/Test-Jovie-2026.06.02_05-12-21--0700.xcresult` |
| iOS real-browser auth test result | `artifacts/ios-test-results/real-browser-auth/Test-Jovie-2026.06.02_05-30-14--0700.xcresult` |
| iOS chat draft focused XCUITest result | `artifacts/ios-test-results/chat-draft/Test-Jovie-chat-draft-2026.06.02_09-00-00-0700.xcresult` |
| iOS profile API retry AppState result | `artifacts/ios-test-results/profile-retry/Test-Jovie-profile-retry-2026.06.02_09-16-34-0700.xcresult` |
| iOS stale cache offline AppState result | `artifacts/ios-test-results/offline-cache/Test-Jovie-offline-cache-2026.06.02_09-35-29-0700.xcresult` |
| iOS cold offline AppState result | `artifacts/ios-test-results/cold-offline/Test-Jovie-cold-offline-2026.06.02_10-06-26-0700.xcresult` |
| iOS launch performance test result | `artifacts/ios-test-results/launch-performance/Test-Jovie-launch-performance-2026.06.02_05-52-46-0700.xcresult` |
| iOS launch performance log | `artifacts/ios-test-results/launch-performance/Test-Jovie-launch-performance-2026.06.02_05-52-46-0700.log` |
| iOS runtime performance summary | `artifacts/ios-test-results/runtime-performance/Test-Jovie-runtime-performance-2026.06.02_08-27-31-0700-summary.md` |
| iOS runtime performance result bundle | `artifacts/ios-test-results/runtime-performance/Test-Jovie-runtime-performance-2026.06.02_08-27-31-0700.xcresult` |
| iOS runtime performance log | `artifacts/ios-test-results/runtime-performance/Test-Jovie-runtime-performance-2026.06.02_08-27-31-0700.log` |
| iOS memory baseline summary | `artifacts/ios-test-results/memory-baseline/Jovie-memory-baseline-2026.06.02_06-27-15--0700/summary.md` |
| iOS memory baseline sample | `artifacts/ios-test-results/memory-baseline/Jovie-memory-baseline-2026.06.02_06-27-15--0700/ie.jov.Jovie-88803-2026.06.02_06-27-15--0700.sample.txt` |
| iOS memory strict-mode summary | `artifacts/ios-test-results/memory-baseline/Jovie-memory-baseline-2026.06.02_06-25-54--0700/summary.md` |
| iOS screenshots | `artifacts/ios-screenshots` |
