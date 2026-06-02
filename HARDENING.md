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
| iOS core screenshots | `pnpm run ios:screenshots` passed on `origin/main` `9e9200348e`, producing loading, signed-out, profile, fullscreen QR, settings, needs-onboarding, chat, and iPad shell screenshots. | Verified locally |

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
