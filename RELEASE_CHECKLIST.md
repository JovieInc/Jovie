# Release Checklist

Tracking issue: [JOV-2712](https://linear.app/jovie/issue/JOV-2712/track-platform-hardening-deliverables-and-ios-evidence-baseline)

## Required Gates

| Gate | Status |
| --- | --- |
| Web typecheck, lint, unit, integration, and Playwright evidence | Evidence required under JOV-2712 |
| iOS XCTest and XCUITest evidence | Auth callback and screenshot smoke evidence recorded for `9e9200348e` |
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
| Live Clerk auth PR | PR #9907 merged as `9e9200348e` after local and CI verification. | Passed |
