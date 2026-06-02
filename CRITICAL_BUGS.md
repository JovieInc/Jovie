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
| JOV-2712-WEB-AUDIT | Web auth, chat, performance, reliability, parity | Required hardening evidence has no current report entry beyond this baseline. | Evidence required under JOV-2712 |
| JOV-2712-ELECTRON-AUDIT | Electron auth, redirects, startup, reliability, parity | Required hardening evidence has no current report entry beyond this baseline. | Evidence required under JOV-2712 |
| JOV-2712-EXTENSION-AUDIT | Chrome Extension auth, messaging, popup/background performance, reliability, parity | Required hardening evidence has no current report entry beyond this baseline. | Evidence required under JOV-2712 |

## Current iOS Result

No critical iOS auth callback failure was reproduced by `pnpm test:auth:ios` on
`origin/main` `9e9200348e`. The deterministic callback suite, real-browser auth
suite, and app-state suite passed, and the known live Clerk auth hardening PR
merged as #9907. The iOS launch-performance baseline passed as an opt-in
XCUITest on `origin/main` `546e2af1f4`; it averaged `3.01s` to the signed-out
shell under UI-test automation, so the 2s target remains tracked by JOV-2712
and is not classified as a critical bug in this ledger. The iOS memory command
captured the deterministic profile shell at `36.6M` physical footprint and
recorded the local `leaks --outputGraph` blocker; memgraph-backed leak proof is
tracked by JOV-2712 rather than classified as a reproduced critical bug here.
