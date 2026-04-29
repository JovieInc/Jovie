# `components/shell/`

Production-ready primitives extracted from `apps/web/app/exp/shell-v1/page.tsx`.
The extracted components in this directory are the implementation source of
truth. The `shell-v1` experiment remains the visual/reference fixture for
unextracted shell ideas, but production code should import from
`@/components/shell/*` rather than reaching back into `/app/exp`.

See `apps/web/app/exp/README.md` for the current experimental-shell debt
ledger and delete-later inventory.

## Foundational primitives

| Component | Purpose | Wired in production |
|-----------|---------|---------------------|
| `Tooltip` | Dark glassy tooltip with optional kbd shortcut chip on the right. CSS-only, no portal. Pass `shortcut` from `@/lib/shortcuts`. | Yes — `UnifiedSidebar` and shell consumers |
| `IconBtn` | Square icon button with hover/active tones (ghost/primary/danger). Wraps `Tooltip`. | Yes |
| `StatusBadge` | Release / track status pill (`live`, `scheduled`, `draft`, `announced`, `hidden`). | Yes |
| `SidebarNavItem` | Single sidebar nav row — icon, label, badge, active state. Server-safe. | Yes |
| `SidebarThreadsSection` | Threads section in the sidebar — top 5 inline, "View all" expands. | Yes |
| `EntityPopover` | Hover-anchored entity preview (release/artist/track/event/contact/teammate). Includes `EntityHoverLink`, `lookupArtistEntity`, `lookupReleaseEntityByAlbum`. | Yes — DrawerHero, lyrics breadcrumb, etc. |
| `ShellDropdown` | Radix-backed dropdown with compound parts: `Header`, `Label`, `Item`, `EntityItem`, `CheckboxItem`, `RadioGroup`/`RadioItem`, `Sub`/`SubTrigger`/`SubContent`, `Separator`. Optional `searchable`. | Yes — overflow menus, sort/filter, palette switcher |

## Lyrics

| Component | Purpose |
|-----------|---------|
| `LyricsView` | Track-scoped cinematic lyrics with timed playhead, J/K nav, Enter-to-stamp, edit mode. Empty state with Transcribe / Paste affordances. Pure presentational; consumers control `lines` + `currentTimeSec` + `onSeek`. |
| `LyricsHeader` | Sticky-top breadcrumb showing artist › track title. Artist becomes a button when `onArtistClick` is provided. |
| `LyricRow` | Single lyric line — display mode (centered, fades dim siblings) or edit mode (grip + time-stamp + inline-editable text). |
| `LyricsTimeline` | Sticky-bottom scrub bar with one cue dot per lyric line. Click anywhere to seek. NaN-safe duration handling. |

## Now-Playing

| Component | Purpose |
|-----------|---------|
| `SidebarNowPlaying` | Floating now-playing card pinned to the canvas left-edge above the audio bar. Collapsed mode renders just the artwork (10×10) for icon-mode sidebars. Hides entirely when nothing's playing. |
| `SidebarBottomNowPlaying` | Compact now-playing row mounted at the sidebar bottom. Artwork + title/artist + small play button. Hides entirely when nothing's playing. |
| `ArtworkPlayOverlay` | Small play/pause button overlaid on album art. Shared between the two now-playing cards. |

All three accept a `track: NowPlayingTrack` whose fields (`trackTitle`,
`artistName`, `artworkUrl`) match `useTrackAudioPlayer().playbackState`
directly. If another caller needs a differently shaped source, add a small
adapter at that caller boundary instead of widening the component contract.

## Drawer

| Component | Purpose |
|-----------|---------|
| `DrawerHero` | Header card for the right-rail drawer. Mounts inside `EntitySidebarShell.entityHeader`. Entity-agnostic — pass `title`, `subtitle`, `artwork`, `statusBadge`, `meta`, `trailing` slots. Optional `onPlay` overlay on artwork; optional overflow-menu button. |

## Brand chrome / loaders

| Component | Purpose |
|-----------|---------|
| `ShellLoader` | Full-screen cold-start bloom + reveal overlay. |
| `JovieOverlay` | Push-to-talk listening overlay with 32-bar waveform. |
| `CopyToggleIcon` | Copy ↔ Check icon swap for clipboard buttons. |

## Player

| Component | Purpose |
|-----------|---------|
| `AudioBar` | Bottom-of-screen player chrome — transport, scrub, lyrics/waveform/minimize cluster. Filled-waveform variant only (alternates were dev-picker-only and intentionally not extracted). Pure presentational; wire `useTrackAudioPlayer()` props at the mount site. |
| `LoopBtn` | Three-state loop toggle: off / track (1) / section (⤴). Used inside AudioBar's transport row. |
| `ScrubGradient` | Waveform scrub bar with playhead, optional cue dots, and optional loop-section overlay. Static deterministic geometry — no animation. |

## Shared support modules

| Module | Purpose |
|--------|---------|
| `@/lib/shortcuts` | `SHORTCUTS` registry + `ShortcutHint` interface. Every keyboard shortcut lives here, surfaced via `Tooltip` `kbd` chip. |

## Conventions

- Every component accepts `className?: string` and merges with `cn()` from `@/lib/utils` (never replace base classes — that breaks core behavior, see Unit G post-mortem).
- Server-safe by default (no `'use client'` directive); add only when hooks/state are present.
- Each component has a JSDoc block with one minimal usage example.
- Don't hardcode `aria-hidden` on elements that have inline `<title>`; let consumers opt in.
- Use `backgroundColor:` not `background:` shorthand when you transition `background-color`.
- Gate `pointer-events-auto` on conditional state — invisible-but-mounted elements must not intercept clicks.
- Tests live at `__tests__/<Name>.test.tsx`. Smoke render is the minimum bar; stateful components also test meaningful state transitions.

## Notes

- For shell brand glyphs, use `BrandLogo` from `@/components/atoms/BrandLogo` (`components/atoms/BrandLogo.tsx`) — size + tone presets, optional `rounded={false}` for borderless glyphs.
- Foundational primitives (Tooltip, IconBtn, EntityPopover, ShellDropdown, etc.) imported across the shell migration units (A–H). Wave 1 agents extract leaf content components that compose these.
