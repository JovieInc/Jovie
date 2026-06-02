# Release Checklist

Tracking issue: [JOV-2712](https://linear.app/jovie/issue/JOV-2712/track-platform-hardening-deliverables-and-ios-evidence-baseline)

## Required Gates

| Gate | Status |
| --- | --- |
| Web typecheck, lint, unit, integration, and Playwright evidence | Evidence required under JOV-2712 |
| iOS XCTest and XCUITest evidence | Auth callback, screenshot smoke, chat draft, profile API retry, and stale-cache offline evidence recorded |
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
| Profile API retry recovery | XcodeBuildMCP `test_sim -only-testing:JovieTests/AppStateTests` passed on `codex/ios-profile-retry-hardening`; `profileLoadFailureShowsRecoveryStateAndRetryRestoresDashboard` verifies a profile API transport failure shows a recoverable dashboard error and retry restores `.previewReady`. | Passed |
| Stale cache offline recovery | XcodeBuildMCP `test_sim -only-testing:JovieTests/AppStateTests` passed on `codex/ios-offline-stale-cache`; `staleProfileSnapshotShowsOfflineStateAndRetryClearsIt` verifies stale cached profile data keeps the dashboard loaded in offline state and retry clears offline when fresh data returns. | Passed |
| Launch performance baseline | `pnpm run ios:performance` passed on `origin/main` `546e2af1f4`; average signed-out shell readiness was `3.01s` under UI-test automation. | Baseline captured under JOV-2712 |
| Runtime performance baseline | `pnpm run ios:runtime-performance` passed locally on `codex/ios-frame-hitch-evidence` after `c9be9b797a`; average Chat to Profile to Chat shell transition was `0.687s` monotonic time with `0.093s` CPU time and `60036.557 kB` peak physical memory. The run requested `XCTHitchMetric(application:)` on the iOS 26+ simulator, but emitted no measured hitch or frame metric lines. | Baseline captured under JOV-2712 |
| Memory/leak baseline command | `pnpm run ios:memory` writes a run summary, raw `leaks` output, and `sample` footprint. Local evidence at `artifacts/ios-test-results/memory-baseline/Jovie-memory-baseline-2026.06.02_06-27-15--0700/summary.md` recorded `36.6M` physical footprint and a blocked `.memgraph` because Developer Tools security is disabled. | Command captured under JOV-2712 |
| Live Clerk auth PR | PR #9907 merged as `9e9200348e` after local and CI verification. | Passed |
