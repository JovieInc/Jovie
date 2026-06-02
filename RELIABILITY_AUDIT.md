# Reliability Audit

Tracking issue: [JOV-2712](https://linear.app/jovie/issue/JOV-2712/track-platform-hardening-deliverables-and-ios-evidence-baseline)

## Scope

This audit tracks behavior under slow internet, offline mode, API failures,
database failures, authentication failures, rate limiting, network
interruptions, browser refreshes, app restarts, and extension reloads.

## Current Evidence

| Scenario | Evidence | Result |
| --- | --- | --- |
| iOS auth callback success | `pnpm test:auth:ios` passed `testAuthCallbackDeepLinkCompletesHarness` on `origin/main` `9e9200348e`. | Passed |
| iOS auth callback provider error | `pnpm test:auth:ios` passed `testAuthCallbackProviderErrorShowsAuthError` on `origin/main` `9e9200348e`. | Passed |
| iOS real-browser auth callback | `JOVIE_IOS_REAL_BROWSER_AUTH=1 pnpm test:auth:ios` passed `testRealBrowserAuthProviderCompleteReachesAuthenticatedShell` against a temporary HTTPS tunnel to local dev. | Passed |
| iOS app state transitions | `pnpm test:auth:ios` passed 18 `AppStateTests` on `origin/main` `9e9200348e`. | Passed |
| iOS profile API failure retry | XcodeBuildMCP `test_sim` passed 19 `AppStateTests`, including `profileLoadFailureShowsRecoveryStateAndRetryRestoresDashboard`, on `codex/ios-profile-retry-hardening`. | Passed |
| iOS stale profile cache recovery | XcodeBuildMCP `test_sim` passed 20 `AppStateTests`, including `staleProfileSnapshotShowsOfflineStateAndRetryClearsIt`, on `codex/ios-offline-stale-cache`. | Passed |
| iOS cold offline profile recovery | XcodeBuildMCP `test_sim` passed 21 `AppStateTests`, including `coldOfflineProfileLoadShowsOfflineStateAndRetryClearsIt`, on `codex/ios-cold-offline-recovery`. | Passed |
| Slow internet and offline behavior | iOS stale-cache and no-cache offline profile paths now have offline-state and retry-clear evidence; slow-network and cross-platform evidence required under JOV-2712. | Partial |
| API, database, and rate-limit failures | iOS profile API server failure now has retry evidence; database, rate-limit, and cross-platform evidence required under JOV-2712. | Partial |
| Electron and Chrome Extension restart/reload recovery | Evidence required under JOV-2712. | Open |

## Acceptance Checks

| Check | Status |
| --- | --- |
| Graceful degradation | iOS profile API failure falls back to a dashboard error state, stale profile cache keeps the ready shell usable offline, and cold transport failure marks the dashboard offline with retry; broader evidence required under JOV-2712 |
| Meaningful error messages | iOS provider-error callback covered; cross-platform evidence required under JOV-2712 |
| Automatic recovery where possible | iOS stale profile retry clears the offline state after fresh profile data; broader evidence required under JOV-2712 |
| User recovery paths where automatic recovery is unavailable | iOS profile API failure and cold offline retry restore the dashboard; broader evidence required under JOV-2712 |
