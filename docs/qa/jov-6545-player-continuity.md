# JOV-6545 player continuity evidence

Baseline: `a6e2a90932856acd243943e383677a48cae1ae59`, inspected 2026-10-15.
Candidate identity is the implementing draft PR's exact head; these are local
source and Storybook receipts, not a deployed build receipt.

`gbrain-unavailable`: query failed because localhost:7801 refused connection.
Current source and Linear completion receipts were used instead.

## Existing surfaces and owners

CODEOWNERS assigns these web surfaces to `@itstimwhite`. JOV-6345 owns tray
entry/persistence and authenticated end-to-end dogfood; JOV-3689 owns engine
correctness; JOV-6544 owns browsing data latency. This slice owns presentation
and focus only.

| Presentation | Current source owner | Actual states / boundary |
| --- | --- | --- |
| Sidebar mini | `SidebarBottomNowPlayingBridge` → `SidebarBottomNowPlaying`, mounted by `UnifiedSidebar` | Active, paused, loading; hidden and inert while the full dock owns the track. No separate full-screen player. |
| Dock / waveform expansion | `PersistentAudioBar` → `ShellAudioDock` + `AudioBar` | Active transport, waveform collapsed/expanded, loading; idle/stopped/error recovery removes active chrome. Mobile uses the existing inline bar. |
| Release / track inspector | `release-sidebar/ReleaseSidebar.tsx`, `TrackSidebar.tsx`, `useTrackAudioPlayer.ts` | Selected-entity details and playback actions. Selection is independent of the playing track; this is not another player expansion. |
| Lyrics route | `app/app/(shell)/lyrics/[trackId]/page.tsx`, `LyricsPageClient`, `LyricsView`, `LyricsRouteSkeleton` | Server loading, populated or empty lyrics. Live position/metadata are used only when the route track matches the active track. |
| Audio authority | Module singleton in `release-sidebar/useTrackAudioPlayer.ts` | One lazily created HTMLAudioElement, shared across these web adapters. Visual toggles do not load or stop it. |

The shell layout mounts `PersistentAudioBar` outside route content. The shipped
Mac app (`apps/desktop/src/main.ts`) opens the hosted web shell in Electron,
so it consumes these owners. MenuMonitor is an operator accessory. Native Mac
development and iOS Swift views do not consume these React effects. No native
source or device behavior is certified by this change.

## Prior completion receipts preserved

Read from Linear on 2026-10-15:

- JOV-5546: Done 2026-09-13, PR #17337; canonical transport controls retained.
- JOV-5456: Done 2026-08-30, PR #16719; ArtworkFrame and contain fit retained.
- JOV-3487: Done 2026-07-20; canonical reveal motion retained.
- JOV-4387: Done 2026-07-29, PRs #14910, #14917, #15138; its checked-in
  one-second synthetic WAV and existing performance contracts are reused.

Next Beats remains a documentation quality reference. Its runtime was not
measured. No claim that Jovie lacked these delivered capabilities is made.

## Observations and smallest repairs

| Observed baseline defect | Deliberate-red detector | Repair |
| --- | --- | --- |
| Hidden waveform range could receive native focus | Browser focus call succeeded while its drawer was aria-hidden; component inert assertion failed | Mark the hidden drawer inert immediately, including during closing motion. |
| Minimize left focus in hidden dock chrome | Browser expected the mini's Show Player button to own focus and failed | After publishing visibility, transfer focus on the next paint only if it belonged to the retiring player. Cancel superseded work and preserve focus moved elsewhere. |
| Global Space consumed focused button activation | Browser and component tests failed to open waveform with Space | Yield Space to native buttons/links before applying the global playback shortcut. |
| Empty lyrics entry had no focus target | LyricsView focus assertion failed | Give the empty region a programmatic focus target and honor route autofocus. |
| Lyrics navigation back did not restore the invoker | PersistentAudioBar route-rerender focus assertion failed | Remember the invoker and restore it on leaving lyrics, with a visible player-control fallback. |
| Seek target overlapped play at 320px | Browser target bounding-box separation assertion failed | Wrap seeking onto its own row below 640px; keep the same controls, tokens and artwork geometry. |

No stale painted artwork was observed while a subsequent image was pending.
No image implementation, motion tokens, elevation, audio authority, public-profile
player experiment, or inspector selection behavior was replaced.

**Ship now:** the observed focus, keyboard, hidden-input and narrow-layout fixes.
**Re-evaluate when:** JOV-6345 exercises the exact deployed build on authenticated
web and installed Mac/device surfaces. **Then:** use those runtime receipts to
identify any additional continuity defect; retain passing implementations.

## Same-configuration visual evidence

Chromium, local Storybook/Vite, production components and audio singleton,
checked-in WAV, controlled artwork responses. Baseline captures preceded the
production fixes. The fixture's diagnostic output is test-only.

| State | Before | After |
| --- | --- | --- |
| Hidden waveform, 1280px dark | [before](../screenshots/jov-6545/before-waveform.png) | [after](../screenshots/jov-6545/after-waveform.png) |
| Minimized player, 1280px dark | [before](../screenshots/jov-6545/before-minimized.png) | [after](../screenshots/jov-6545/after-minimized.png) |
| Narrow mobile targets, 320px dark | [before](../screenshots/jov-6545/before-narrow.png) | [after](../screenshots/jov-6545/after-narrow.png) |

Focus and duplicate controls require the executable assertions, not visual
inference from still images. Browser runs also write screenshots and failure
videos to `apps/web/test-results/`. The real Audio constructor is instrumented
without replacing playback: one instance must survive presentation and track
changes. Tests assert retained source and 0.5-second position over repeated
minimize/expand, sole actionable dismiss chrome, latest track identity,
contain fit and reserved 36px artwork geometry.

## Verification and proof boundaries

The handoff/PR records exact commands and outcomes. The focused browser matrix
covers 320/390/834/1280px, both themes, missing/broken/low-resolution/bright/dark/
non-square art, long metadata, delayed images, repeated transitions, keyboard,
touch, 200% CSS zoom, reduced motion, unavailable View Transitions/WebGPU, and
empty/populated lyrics entry focus. No arbitrary FPS or global threshold was
introduced. `packages/audio-contracts/performance.ts` remains the performance
budget owner; these functional receipts do not measure audible latency or p95.

Authenticated route/inspector recordings, hosted CI, installed Electron Mac,
physical notch/safe-area, native Swift/iOS, screen-reader speech and deployed
runtime are separate proof tiers. This environment has no Doppler token, so it
cannot establish authenticated route or device certification. JOV-6345 remains
the runtime/dogfood owner; JOV-6545 is not a production commissioning receipt.
Mobile safe-area composition remains shell-owned: AppShellFrame places the
player above the mobile bottom surface. The changed bar reserves artwork and
seeking geometry; fixture viewport and touch checks are not physical safe-area
proof. No merge, promotion, deployment or approval-gate change was performed.

An early touch pause during a pending track start cleared active media in one
browser run. The ready-state transport path passes. This engine event-ordering
investigation is tracked as candidate [JOV-8380](https://linear.app/jovie/issue/JOV-8380),
related to the existing JOV-3689 playback-correctness owner; no engine rewrite
was folded into this presentation slice.
