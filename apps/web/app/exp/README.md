# Experimental Shell Debt Ledger

`/exp/*` is a noindex, design-only playground. Keep production behavior out of
this tree: no schema work, no server state assumptions, and no product route
rewrites. When a design settles, extract the smallest reusable primitive to
`@/components/shell/*` or a feature-owned component, then leave the experiment
as a reference fixture until an owner confirms deletion.

## Source Of Truth

| Area | Canonical Source | Notes |
| --- | --- | --- |
| Production shell primitives | `apps/web/components/shell/*` | Import from here. Do not import production UI from `/app/exp`. |
| Shell visual reference | `apps/web/app/exp/shell-v1/page.tsx` | Still the broad reference for unextracted shell behavior and layout vocabulary. |
| Shell audio state | `apps/web/components/organisms/release-sidebar/useTrackAudioPlayer.ts` | Owns playback state shape and transport behavior. |
| Marketing/page composition experiments | `apps/web/app/exp/page-builder/*`, `apps/web/app/exp/component-checker/*` | Static noindex preview routes only. |
| Library experiment | `apps/web/app/exp/library-v1/page.tsx` | Currently imported by `shell-v1`; treat as blocked from deletion. |

## Route Inventory

| Route | Status | Canonical / Extracted Surface | Delete-Later Notes |
| --- | --- | --- | --- |
| `/exp/shell-v1` | Reference fixture | Many primitives extracted to `components/shell`; still owns the integrated shell composition, mock data, and unextracted route-level behavior. | Do not delete until shell composition, mock fixtures, and migration parity checks are represented elsewhere. |
| `/exp/library-v1` | Blocked | Exports `generateAssets`, `emptyFilters`, `LeftRail`, `Grid`, `Table`, `Drawer`, `StatusBar`, and related types used by `shell-v1`. | Cannot delete while `shell-v1` imports from it. If this graduates, move exported pieces to feature/shell-owned modules first. |
| `/exp/right-rail-shotgun` | Reference fixture | Design comparison for right-rail drawer strategy; overlaps with extracted `DrawerHero`, `DrawerTabStrip`, `DspAvatarStack`, `RowWaveform`, and metadata primitives. | Delete only after selected drawer strategy is documented in the production drawer/sidebar component owner. |
| `/exp/onboarding-v1` | Reference fixture | Chat-first staged onboarding concept with local shims, including an internal `AudioBarShim`. | Candidate for deletion after onboarding V2/product onboarding owns the accepted interaction model. |
| `/exp/auth-v1` | Reference fixture | Experimental auth card and cold-start vocabulary. | Candidate for deletion after auth/product sign-in decisions are represented outside `/exp`. |
| `/exp/home-v1` | Reference fixture | Marketing hero variants with static mock creators. | Candidate for deletion after the accepted homepage/Page Builder path owns any surviving sections. |
| `/exp/profile-v1` | Reference fixture | Public profile mock with local icon components and static data. | Candidate for deletion after public profile direction is captured in production profile components or screenshots. |
| `/exp/page-builder` | Utility fixture | Registry-driven landing-page composition preview. | Keep while marketing section registry work is active. It is noindex and Suspense-wrapped for static prerender safety. |
| `/exp/component-checker` | Utility fixture | Single-section registry preview for landing components. | Keep while component QA/design review uses it. It is noindex and Suspense-wrapped for static prerender safety. |
| `/exp/dev-overlay` | Utility fixture | Carbon/accent/radius playground. | Delete when token decisions no longer require this manual preview. No production imports found. |

## Extracted Shell Surface

The `components/shell` README is the current extraction map. At this pass, the
notable extracted groups are:

- Foundation: `Tooltip`, `IconBtn`, `ShellDropdown`, `SidebarNavItem`,
  `SidebarThreadsSection`, `EntityPopover`.
- Drawer/release metadata: `DrawerHero`, `DrawerTabStrip`, `StatusBadge`,
  `DspAvatarStack`, `RowWaveform`, `CuesPanel`, `PerformanceCard`,
  `InlineEditRow`, `SmartLinkRow`.
- Player/lyrics: `AudioBar`, `LoopBtn`, `ScrubGradient`, `SidebarNowPlaying`,
  `SidebarBottomNowPlaying`, `MobilePlayerCard`, `TabletPlayerCard`,
  `LyricsView`, `LyricsHeader`, `LyricsTimeline`, `LyricRow`.
- Thread/media cards: `ThreadView`, `ThreadTurn`, `ThreadComposer`,
  `ThreadImageCard`, `ThreadAudioCard`, `ThreadVideoCard`.
- Brand/loaders: `ShellLoader`, `JovieOverlay`, `PlayingBars`,
  `ArtworkPlayOverlay`.

Future extraction should keep component contracts presentational and wire app
state at route/feature boundaries.

## Duplicate Adapter Notes

- `shell-v1` has a local `toNowPlayingTrack(t: TrackInfo): NowPlayingTrack`
  bridge because the experiment's `TrackInfo` shape uses `title`, `artist`, and
  `artwork`, while `NowPlayingTrack` intentionally mirrors
  `useTrackAudioPlayer().playbackState` (`trackTitle`, `artistName`,
  `artworkUrl`).
- That bridge is acceptable inside the experiment, but it is not canonical.
  Production callers should pass `playbackState` directly when possible.
- `AudioBar` uses its own `AudioBarTrack` (`id`, `title`, `artist`,
  `hasLyrics`) because its label/transport needs are different from compact
  now-playing cards. Do not merge these shapes unless a real production caller
  needs one shared player view model.
- `onboarding-v1` still contains a local `AudioBarShim`; it is design debt, not
  a reusable player component.

## Blockers Before Deletion

- `shell-v1` still imports from `library-v1`, so the library experiment is not
  isolated.
- Several `/exp` pages contain large local mock datasets and local icon/shim
  components. Deleting them is safe only after the accepted visual decisions are
  captured in production components, tests, screenshots, or design docs.
- `/exp/layout.tsx` provides shared `QueryProvider` and `TooltipProvider`
  context for experiments that embed shipped components. Removing it can break
  preview routes even when the individual pages look static.
