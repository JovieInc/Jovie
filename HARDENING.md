# Jovie Platform Hardening

Tracking issue: [JOV-2712](https://linear.app/jovie/issue/JOV-2712/track-platform-hardening-deliverables-and-ios-evidence-baseline)

This file is the index for the production-readiness deliverables requested in
the June 2 hardening brief. Each linked artifact distinguishes verified,
failing, and evidence-required areas, with evidence from local checks, CI,
staging, or production as appropriate.

## Current Evidence

| Area | Current evidence | Status |
| --- | --- | --- |
| iOS live Clerk auth | PR [#9907](https://github.com/JovieInc/Jovie/pull/9907) merged as `9e9200348e`; iOS CI `Build And Test` passed; live-auth local run passed before merge. | Verified for the PR scope |
| iOS custom-scheme auth callback | `pnpm test:auth:ios` passed on `origin/main` `9e9200348e`: 18 `AppStateTests` and 2 deterministic XCUITests passed. | Verified locally |
| iOS real-browser auth callback | `JOVIE_IOS_REAL_BROWSER_AUTH=1 pnpm test:auth:ios` passed through Doppler dev config against a temporary Cloudflare tunnel to local dev. | Verified locally |
| iOS core screenshots | `pnpm run ios:screenshots` passed on `origin/main` `9e9200348e`, producing loading, signed-out, profile, fullscreen QR, settings, needs-onboarding, chat, and iPad shell screenshots. | Verified locally |
| iOS chat draft stability | `bash apps/ios/scripts/run-xcodebuild.sh test -only-testing:JovieUITests/JovieUITests/testChatComposerPreservesDraftAcrossShellNavigation` passed on `codex/ios-chat-draft-hardening` after `86ba0c65f9`. | Verified locally |
| iOS profile API retry | XcodeBuildMCP `test_sim -only-testing:JovieTests/AppStateTests` passed on `codex/ios-profile-retry-hardening` with 19 `AppStateTests`, including the profile failure and retry recovery case. | Verified locally |
| iOS stale profile cache recovery | XcodeBuildMCP `test_sim -only-testing:JovieTests/AppStateTests` passed on `codex/ios-offline-stale-cache` with 20 `AppStateTests`, including stale profile offline state and retry-clear coverage. | Verified locally |

## Deliverables

| Deliverable | Status |
| --- | --- |
| `AUTH_AUDIT.md` | Created with iOS auth evidence and JOV-2712 evidence gaps |
| `CHAT_AUDIT.md` | Created with iOS chat screenshot baseline and JOV-2712 evidence gaps |
| `PERFORMANCE.md` | Created with measurement plan and JOV-2712 evidence gaps |
| `DESIGN_SYSTEM_AUDIT.md` | Created with iOS screenshot baseline and JOV-2712 evidence gaps |
| `RELIABILITY_AUDIT.md` | Created with iOS callback reliability baseline and JOV-2712 evidence gaps |
| `PLATFORM_PARITY_AUDIT.md` | Created with cross-platform parity matrix and JOV-2712 evidence gaps |
| `TEST_COVERAGE_REPORT.md` | Created with current iOS test evidence and JOV-2712 evidence gaps |
| `RELEASE_CHECKLIST.md` | Created with release gates and JOV-2712 evidence gaps |
| `CRITICAL_BUGS.md` | Created with critical-risk ledger and JOV-2712 evidence gaps |
