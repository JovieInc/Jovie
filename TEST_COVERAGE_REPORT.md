# Test Coverage Report

Tracking issue: [JOV-2712](https://linear.app/jovie/issue/JOV-2712/track-platform-hardening-deliverables-and-ios-evidence-baseline)

## Current Evidence

| Command | Evidence | Result |
| --- | --- | --- |
| `pnpm test:auth:ios` | Passed on `origin/main` `9e9200348e`. Ran 18 `AppStateTests` and 2 deterministic XCUITests: `testAuthCallbackDeepLinkCompletesHarness` and `testAuthCallbackProviderErrorShowsAuthError`. | Passed |
| `pnpm run ios:screenshots` | Passed on `origin/main` `9e9200348e`. Produced 7 screenshots in `artifacts/ios-screenshots`. | Passed |
| PR #9907 iOS CI `Build And Test` | Passed before merge of `9e9200348e`. | Passed |

## Platform Coverage Matrix

| Platform | Required coverage | Current status |
| --- | --- | --- |
| Web | Playwright, unit tests, integration tests. | Evidence required under JOV-2712 |
| iOS | XCTest and XCUITest. | Current auth callback and screenshot smoke evidence recorded |
| Electron | End-to-end tests, auth flow tests, deep link tests. | Evidence required under JOV-2712 |
| Chrome Extension | Popup tests, background script tests, authentication tests, messaging tests. | Evidence required under JOV-2712 |

## Artifacts

| Artifact | Path |
| --- | --- |
| iOS auth callback test result | `/Users/timwhite/Library/Developer/Xcode/DerivedData/Jovie-hiiryvawzddnbedsbmbafcsminho/Logs/Test/Test-Jovie-2026.06.02_05-12-56--0700.xcresult` |
| iOS app state test result | `/Users/timwhite/Library/Developer/Xcode/DerivedData/Jovie-hiiryvawzddnbedsbmbafcsminho/Logs/Test/Test-Jovie-2026.06.02_05-12-21--0700.xcresult` |
| iOS screenshots | `artifacts/ios-screenshots` |
