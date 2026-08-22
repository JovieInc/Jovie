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


# Jovie Sidebar Refinement Design QA

final result: passed

## Source and implementation

- Approved source mock: `/Users/timwhite/.codex/generated_images/01a0223a-6b19-7f43-8b08-333c823a63f2/exec-c09b88f1-0d24-4694-8b1d-6dbdc06754be.png`
- Current-main desktop rail: `/Users/timwhite/.codex/visualizations/2026/08/21/01a0224f-7041-7f20-849b-653a0bf8231c/jovie-sidebar-current-main-rail-1440x900.png`
- Same-state visual comparison: `/Users/timwhite/.codex/visualizations/2026/08/21/01a0224f-7041-7f20-849b-653a0bf8231c/jovie-sidebar-current-main-comparison.png`
- Current-main responsive captures: `/Users/timwhite/.codex/visualizations/2026/08/21/01a0224f-7041-7f20-849b-653a0bf8231c/jovie-sidebar-current-main-768x1024.png`, `/Users/timwhite/.codex/visualizations/2026/08/21/01a0224f-7041-7f20-849b-653a0bf8231c/jovie-sidebar-current-main-375x812.png`

## Viewports and states

| Viewport | State | Result |
| --- | --- | --- |
| 1440 × 900 | Current-main `/demo` shell, expanded rail | Passed: one protected user panel, Public Profile inside it, notification slot owned by sidebar content, no upgrade card or header/titlebar duplicate |
| 768 × 1024 | Responsive More surface open | Passed: desktop rail hidden, account utilities include Public Profile, Settings, and Sign out, dialog remains in viewport |
| 375 × 812 | Responsive More surface open | Passed: no horizontal overflow, same account utilities, Escape restores More focus |
| 1023 / 1024 × 768 | Breakpoint boundary | Passed: mobile surface at 1023; desktop rail at 1024; no horizontal overflow |

## Interaction and layout checks

- Public Profile keeps the canonical sidebar focus ring when reached by keyboard.
- Mobile More opens with contained focus and Escape restores the trigger; unit and runtime checks agree.
- `data-sidebar="notifications"` is rendered once inside SidebarContent; update controls are absent from the shell header, Electron titlebar, and account footer.
- Electron update detection uses the synchronous runtime bridge check so the
  first sidebar commit installs the one-shot IPC listener; the boot-emission
  regression is covered by `tests/unit/desktop/electron-runtime.test.tsx` and
  `tests/unit/components/organisms/UnifiedSidebar.library.test.tsx`.
- The account panel is a single footer block and contains the Public Profile link immediately above the existing UserButton contract.
- The demo harness intentionally shows its no-auth loading identity state; loaded UserButton keyboard behavior is covered by `tests/components/user-button.test.tsx`.
- The authenticated `/app` browser route remains unavailable in this isolated worktree without `DATABASE_URL`; the database-free `/demo` shell was used for current-main visual/runtime evidence.

## Severity audit

- P0: none
- P1: none
- P2: none
- P3: demo-only identity loading state and Storybook full-build infrastructure failures are outside this refinement

---

# Sidebar identity footer composition Design QA (JOV-5272)

final result: passed (component/contract); CI visual-review owns exact-runtime captures at 1440×900 and 390×844

## Product contract

One semantic identity, one top-level footer composition. Active creator
identity and Public Profile access share a single enclosing group in expanded
(224px), narrow (160px), and collapsed (icon) sidebar states. Actions remain
siblings. There is no standalone Public Profile row and no duplicate creator
name or profile URL outside the group.

## Viewports and states

| Viewport | State | Result |
| --- | --- | --- |
| 1440 × 900 | Expanded authenticated rail | Identity group owns name + Public Profile URL; one enclosing hover/focus boundary |
| 768 × 1024 | Narrow rail / tablet | Same group, truncated URL, two tab stops |
| 375 × 812 | Collapsed / compact | Same group; avatar + Public Profile icon remain siblings |
| Split-layout fixture | Deliberate-red adjacent rows | Forbidden shape only; production group count stays 1 |

## Interaction and layout checks

- Keyboard order is creator identity, then Public Profile. No nested interactive elements.
- Accessible names: group `Creator Identity`; link `Public Profile {hostname}{href}`.
- Equivalent sidebar/profile surface sweep uses the same profile href.

## Severity audit

- P0: none
- P1: none
- P2: none
- P3: none

