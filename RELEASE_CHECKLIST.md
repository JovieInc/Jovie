# Release Checklist

Tracking issue: [JOV-2712](https://linear.app/jovie/issue/JOV-2712/track-platform-hardening-deliverables-and-ios-evidence-baseline)

## Required Gates

| Gate | Status |
| --- | --- |
| Web typecheck, lint, unit, integration, and Playwright evidence | Evidence required under JOV-2712 |
| iOS XCTest and XCUITest evidence | Auth callback, screenshot smoke, chat draft, profile API retry, stale-cache offline, and cold-offline retry evidence recorded |
| Electron build, auth, deep link, and end-to-end evidence | Evidence required under JOV-2712 |
| Chrome Extension popup, background, auth, and messaging evidence | Evidence required under JOV-2712 |
| Staging verification | Evidence required under JOV-2712 |
| Production verification | Evidence required under JOV-2712 |
| Critical bug ledger clear or explicitly accepted | Evidence required under JOV-2712 |
| Bot review comments addressed before merge | Required by `.claude/rules/release.md` |

## Current iOS Evidence

| Check | Evidence | Result |
| --- | --- | --- |
| Auth callback suite | `pnpm test:auth:ios` passed on `origin/main` `9e9200348e`. | Passed |
| Real-browser auth suite | `JOVIE_IOS_REAL_BROWSER_AUTH=1 pnpm test:auth:ios` passed against a temporary HTTPS tunnel to local dev. | Passed |
| Screenshot smoke | `pnpm run ios:screenshots` passed on `origin/main` `9e9200348e`. | Passed |
| Chat draft stability | `bash apps/ios/scripts/run-xcodebuild.sh test -only-testing:JovieUITests/JovieUITests/testChatComposerPreservesDraftAcrossShellNavigation` passed on `codex/ios-chat-draft-hardening` after `86ba0c65f9`; it verifies one composer input and draft preservation through Chat to Profile to Chat shell navigation. | Passed |
| Profile API retry recovery | XcodeBuildMCP `test_sim -only-testing:JovieTests/AppStateTests` passed on `codex/ios-profile-retry-hardening`; `profileLoadFailureShowsRecoveryStateAndRetryRestoresDashboard` verifies a profile API server failure shows a recoverable dashboard error and retry restores `.previewReady`. | Passed |
| Stale cache offline recovery | XcodeBuildMCP `test_sim -only-testing:JovieTests/AppStateTests` passed on `codex/ios-offline-stale-cache`; `staleProfileSnapshotShowsOfflineStateAndRetryClearsIt` verifies stale cached profile data keeps the dashboard loaded in offline state and retry clears offline when fresh data returns. | Passed |
| Cold offline profile recovery | XcodeBuildMCP `test_sim -only-testing:JovieTests/AppStateTests` passed on `codex/ios-cold-offline-recovery`; `coldOfflineProfileLoadShowsOfflineStateAndRetryClearsIt` verifies a cold transport failure shows a recoverable dashboard error, marks the shell offline, and retry clears offline when fresh data returns. | Passed |
| TestFlight crash fix CI | PR #9918 merged as `9e2030c0ee`; PR #9920 merged as `8e333b2e97`; main iOS CI run `26841366664` passed `Build And Test`. | Passed |
| Internal TestFlight upload | Main `iOS TestFlight` run `26841365624` uploaded `/artifacts/ios-build/Jovie.ipa`, processed App Store Connect build `1.0 (42)`, set the changelog, and distributed it to internal testers. | Passed |
| Local TestFlight launch smoke | TestFlight on this Mac updated Jovie for iOS from build `40` to build `42`; `/Applications/Jovie 2.app/Wrapper/Jovie.app/Info.plist` reports `CFBundleVersion` `42`; launching build 42 left process `Jovie` running and produced no fresh `Jovie*.ips` diagnostic report after launch. | Passed |
| TestFlight live-key upload guard | JOV-2714 adds a workflow guard that rejects placeholder and `pk_test...` Clerk keys before Fastlane can upload another internal build. Local fake-env validation rejects `pk_test_example` and accepts `pk_live_example` without printing secret values. | Added |
| TestFlight live sign-in secret | Build `1.0 (42)` still embeds a `pk_test` Clerk publishable key, so live sign-in is disabled by the fail-closed guard. JOV-2713 tracks replacing the TestFlight Clerk key with the production/live key and shipping a follow-up build. | Open |
| TestFlight artifact-level guard | JOV-2714 follow-up: the `beta` lane now re-validates `ClerkPublishableKey` from the WRITTEN `Configuration.local.plist` (via `apps/ios/scripts/validate-testflight-artifact.sh`), not just the pre-flight env var, so a stale cached plist or `write-configuration.sh`'s own fallback chain can't ship a non-live key undetected. `node --test apps/ios/scripts/validate-testflight-artifact.test.mjs` passes: 6/6 cases (live key accepted; placeholder, `pk_test`, malformed, missing-key, and missing-file cases all rejected). | Added |
| Launch performance baseline | `pnpm run ios:performance` passed on `origin/main` `546e2af1f4`; average signed-out shell readiness was `3.01s` under UI-test automation. | Baseline captured under JOV-2712 |
| Runtime performance baseline | `pnpm run ios:runtime-performance` passed locally on `codex/ios-frame-hitch-evidence` after `c9be9b797a`; average Chat to Profile to Chat shell transition was `0.687s` monotonic time with `0.093s` CPU time and `60036.557 kB` peak physical memory. The run requested `XCTHitchMetric(application:)` on the iOS 26+ simulator, but emitted no measured hitch or frame metric lines. | Baseline captured under JOV-2712 |
| Memory/leak baseline command | `pnpm run ios:memory` writes a run summary, raw `leaks` output, and `sample` footprint. Local evidence at `artifacts/ios-test-results/memory-baseline/Jovie-memory-baseline-2026.06.02_06-27-15--0700/summary.md` recorded `36.6M` physical footprint and a blocked `.memgraph` because Developer Tools security is disabled. | Command captured under JOV-2712 |
| Live Clerk auth PR | PR #9907 merged as `9e9200348e` after local and CI verification. | Passed |
