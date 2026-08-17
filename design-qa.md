# Unified Profiles Design QA

final result: passed

## Source and implementation

- Source design: `/Users/timwhite/.codex/generated_images/019f6d49-d510-7b41-91d2-8de19dabc140/exec-aa7ed8bf-99d1-4bb8-ae6d-4de537b76af1.png`
- Desktop implementation: `/Users/timwhite/.gstack/projects/JovieInc-Jovie/jov-2659-design-qa/profiles-desktop-1440-v2.png`
- Side-by-side comparison: `/Users/timwhite/.gstack/projects/JovieInc-Jovie/jov-2659-design-qa/profiles-design-comparison.png`
- Tablet selected-entity state: `/Users/timwhite/.gstack/projects/JovieInc-Jovie/jov-2659-design-qa/profiles-tablet-768.png`

## Viewports and states

| Viewport | State | Result |
| --- | --- | --- |
| 1440 × 960 | All profiles, Jovie row selected, right entity rail open | Passed |
| 768 × 1024 | Selected profile shown in the shell's responsive entity drawer | Passed |
| 375 × 812 | No initial selection; table remains horizontally scrollable and the entity drawer is click-triggered | Passed by the responsive shell contract and component coverage |

## Focused comparison history

1. The first desktop capture exposed a width collision between the table minimum width and the standard entity rail. The rail actions and Monitoring column clipped beyond the viewport.
2. Reduced the table minimum width from 860px to 700px and tightened the flexible profile/issue columns. The second desktop capture keeps the entire table and both rail actions visible.
3. Removed the eager row selection. Small screens now load the table first and register the entity drawer only after a row click, while desktop users still get the standard rail interaction.

## Interaction and layout checks

- Filters switch between All, DSP, Social, Sources, and Connectors.
- Row click and keyboard selection use the shared `UnifiedTable` behavior.
- Locked monitoring rows never render their stored rank value.
- Connector rows render explicit placeholders for search-only cells.
- The right side uses the shared `EntitySidebarShell`, not an embedded public profile.
- The selected-row treatment does not change row height or table geometry.
- Empty profile and empty filter states reserve the page surface without layout shift.

---

# Public Profile Latest Rows Design QA

final result: passed

## Product contract

The home rail is `Latest`, not a music-only release section. Every item uses
one compact, full-content-width 9:4 footprint with one mandatory snap at a
time. The selected item is fully present; an incoming item dims while partially
selected. There are no dots, expanding cards, hover lifts, or height-changing
disclosure. Desktop previous/next controls reveal only on rail hover or keyboard
focus; touch keeps native swipe.

| Content | Always visible in the row | Further inspection |
| --- | --- | --- |
| Music | Square art, Music symbol, release state, title, release type and year, Listen or Notify Me | Release page with preview and DSP destinations |
| Video | Uncropped thumbnail, Video symbol, title, publish context, Watch | Video destination or detail page |
| Podcast | Square show art, Podcast symbol, episode title, show name and recency, Play | Episode detail with description and destinations |
| Merch | Uncropped product photography, Merch symbol, title, product type and price, Buy | Product detail with variants and checkout handoff |
| Show | Date-led media, Show symbol, ticket state, venue and city, Tickets or RSVP | Show detail with time, venue, and ticket handoff |
| Update | Typographic or editorial media, Update symbol, headline, date or read time, Read | Full text detail |
| Alerts | Alerts symbol, concise value line, Get Updates | Inline capture or subscription flow |

Podcast and Update describe the normalized row contract; this change does not
invent data sources that the public profile does not yet provide. Source wiring
is tracked as candidate follow-up JOV-4627.

## Source and implementation

- [Current mobile source](docs/screenshots/profile-latest/profile-rows-before-mobile.png)
- [Mobile implementation](docs/screenshots/profile-latest/profile-rows-after-mobile-final.png)
- [Mobile side-by-side](docs/screenshots/profile-latest/profile-rows-comparison-mobile-final.png)
- [Desktop implementation](docs/screenshots/profile-latest/profile-rows-after-desktop-final.png)
- [Desktop implementation used for control-geometry verification](docs/screenshots/profile-latest/profile-rows-after-desktop-controls-final.png)
- [Desktop side-by-side](docs/screenshots/profile-latest/profile-rows-comparison-desktop-final.png)
- [Selected catalog item](docs/screenshots/profile-latest/profile-rows-mobile-second-item-v1.png)

## Verification loop

1. The first landscape pass exposed an oversized featured Listen action. It
   was tightened to the same compact action geometry as catalog rows.
2. Semantic Lucide symbols were added to the fixed context slot; no emoji or
   colored icon tile was introduced.
3. Video and merchandise media changed from generic cover cropping to
   `object-contain`, preserving native content inside the stable footprint.
4. The selected second item retained its Music, Out Now, title, release type,
   year, and Listen hierarchy. Clicking it opened the full release screen with
   preview and DSP destinations.
5. Mobile 390 × 844 and desktop 1440 × 900 comparisons found no clipped
   content, awkward wraps, dock movement, or profile-shell layout shift.
6. The release reviews found three disclosure/layout gaps before merge.
   Capture and success states now keep the media slot invisibly reserved while
   an absolute overlay uses the full row, preserving geometry. Previous/next
   controls are centered to the compact row wrapper and only display for
   fine-pointer hover-capable devices, while keyboard focus and touch swipe
   retain their native paths.

## Severity audit

- P0: none
- P1: none
- P2: none
- P3: none

---

# Usage dropdown design QA

## Source and implementation

- Reference: `/var/folders/94/18gm8rr177124d51gsv4qj4m0000gn/T/TemporaryItems/NSIRD_screencaptureui_YUfzEQ/Screenshot 2026-08-17 at 8.19.03 AM.png`
- Implementation capture: `/Users/timwhite/.codex/visualizations/2026/08/16/01a00cb2-2b7c-7ec1-bf6e-d2ab79b8c17c/jovie-usage-dropdown.jpg`
- Rendered state: `Organisms/UserButton/UsageMenuItem / Expanded`
- Viewport: 1280 × 720; component width: 320 px; dark theme

## Adopt-first receipt

- Decision: **extend** Jovie's existing `UsageMenuItem`, settings usage panel,
  chat-usage query, and plan-usage summary query.
- Considered: the shared `ProgressBar` atom. It remains correct for uploads and
  imports, but does not model quota thresholds, reset windows, stale data, or
  conflicting upstream counters.
- Differentiating requirement: one fail-closed remaining-capacity model shared
  by every quota surface, with exact threshold markers and independently
  degradable data sources.
- Revisit trigger: move normalization server-side when one authoritative usage
  endpoint owns daily messages, weekly suggestions, live actions, and a trusted
  burn-rate signal.

## Comparison evidence

- Matched the reference hierarchy: quota name, percent left, horizontal fill,
  visible thresholds, status copy, and reset timing.
- Kept Jovie's compact System B surface and token palette instead of copying
  macOS translucency or CodexBar's standalone panel chrome.
- Used real Jovie windows: daily messages, weekly suggestions, and rolling
  five-hour live actions. Removed the prior monthly visualization because its
  endpoint did not contain true monthly consumption.
- Omitted projected run-out copy because Jovie has no verified burn-rate input;
  the UI does not manufacture a forecast.
- Watch and critical markers remain visible at 25% and 10%. Status is repeated
  in text and `aria-valuetext`, so color is not the only signal.

## Interaction and state checks

- Disclosure opens and closes by pointer, Enter, and Space in component tests.
- `aria-expanded`, `aria-controls`, progress values, and readable status text
  are present.
- Loading, empty, total failure, partial-source failure, stale data, healthy,
  near-limit, and exhausted states retain the reserved panel geometry.
- Stale product-summary fallback zeros are hidden rather than rendered as full
  remaining capacity.
- The rendered Storybook fixture opened successfully and exposed all three
  progress bars in the accessibility tree.

## Patches after comparison

- Kept the compact 320 px menu width already established by Jovie's user menu.
- Preserved sparse spacing and quiet borders; no extra card nesting was added.
- Added deterministic Storybook data so visual and accessibility checks do not
  depend on live billing state.

final result: passed

## Weekly simplification follow-up

The first reference-matching pass above was intentionally superseded after
product review. Jovie now exposes one user-facing quota only: weekly AI
messages. Suggestions and live-action bars, the monthly projection, the 25%
watch marker, and the 10% critical marker were removed.

- One warning marker remains at 20% capacity.
- Healthy capacity uses the normal accent; at or below the marker it changes to
  warning; only a zero balance uses the error treatment.
- Exhaustion colors the empty track and repeats `Limit reached` in visible text,
  so a zero-width fill does not hide the error state and color is never the only
  signal.
- The dropdown retains keyboard disclosure semantics, one progressbar, exact
  remaining count, reset timing, stale/error copy, and a contextual upgrade
  action.
- Settings uses the same shared meter model and keeps a reserved minimum height
  across loading, error, unavailable, warning, and exhausted states.

Fresh evidence: 26 focused files / 392 tests passed, production TypeScript
passed, Biome passed on all changed web files, and the complete Storybook
production build completed successfully with the updated expanded-menu story.

final result: passed
