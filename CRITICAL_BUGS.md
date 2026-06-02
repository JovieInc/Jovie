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
and is not classified as a critical bug in this ledger. The runtime-performance
command now captures the deterministic Chat to Profile to Chat shell transition
with clock, CPU, memory, and iOS 26+ hitch metric requests; the local baseline
averaged `0.687s` monotonic time, `0.093s` CPU time, and `60036.557 kB` peak
physical memory across 5 measured iterations. The xcodebuild log emitted no
measured hitch or frame metric lines despite the conditional
`XCTHitchMetric(application:)` request, and earlier local simulator graphics
probes could not capture frame/hitch data, so frame-drop proof remains tracked
by JOV-2712 rather than classified as a reproduced critical bug here. The iOS
memory command captured the deterministic
profile shell at `36.6M` physical footprint and recorded the local
`leaks --outputGraph` blocker; memgraph-backed leak proof is tracked by JOV-2712
rather than classified as a reproduced critical bug here.
The iOS chat shell now preserves a typed composer draft across Chat to Profile
to Chat navigation in the focused XCUITest
`testChatComposerPreservesDraftAcrossShellNavigation`, so no iOS draft-loss
critical bug is currently reproduced for that shell-navigation case.
The iOS profile shell now shows a recoverable dashboard error for a profile API
transport failure and restores `.previewReady` after retry in the focused
`AppStateTests` case `profileLoadFailureShowsRecoveryStateAndRetryRestoresDashboard`,
so no iOS profile-load dead-end critical bug is currently reproduced for that
covered API failure and retry path.
The iOS profile shell now keeps stale cached profile data loaded while setting
the offline state, then clears offline after retry returns fresh data in
`staleProfileSnapshotShowsOfflineStateAndRetryClearsIt`, so no iOS blank-profile
critical bug is currently reproduced for that covered stale-cache path.
