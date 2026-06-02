# Critical Bugs

Tracking issue: [JOV-2712](https://linear.app/jovie/issue/JOV-2712/track-platform-hardening-deliverables-and-ios-evidence-baseline)

## Severity Definitions

| Severity | Definition |
| --- | --- |
| Critical | Blocks sign-up, sign-in, onboarding, chat, billing, data integrity, deployment, or production observability on a required platform. |
| High | Causes repeated user-visible failure, lost work, or platform inconsistency on a core workflow. |
| Medium | Degrades a core workflow with a recovery path. |
| Low | Cosmetic or non-core issue with no workflow loss. |

## Current Ledger

| ID | Area | Evidence | Status |
| --- | --- | --- | --- |
| JOV-2712-AUTH-REAL-BROWSER | iOS real browser auth mode | `pnpm test:auth:ios` keeps real browser auth gated unless `JOVIE_IOS_REAL_BROWSER_AUTH=1` is set. | Evidence required under JOV-2712 |
| JOV-2712-WEB-AUDIT | Web auth, chat, performance, reliability, parity | Required hardening evidence has no current report entry beyond this baseline. | Evidence required under JOV-2712 |
| JOV-2712-ELECTRON-AUDIT | Electron auth, redirects, startup, reliability, parity | Required hardening evidence has no current report entry beyond this baseline. | Evidence required under JOV-2712 |
| JOV-2712-EXTENSION-AUDIT | Chrome Extension auth, messaging, popup/background performance, reliability, parity | Required hardening evidence has no current report entry beyond this baseline. | Evidence required under JOV-2712 |

## Current iOS Result

No critical iOS auth callback failure was reproduced by `pnpm test:auth:ios` on
`origin/main` `9e9200348e`. The deterministic callback suite and app-state suite
passed, and the known live Clerk auth hardening PR merged as #9907.
