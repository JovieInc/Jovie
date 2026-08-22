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
- Historical finding, superseded by JOV-5272: this pass accepted a shared
  footer ancestor with Public Profile immediately above UserButton as a
  single block. That structural-only check missed two adjacent top-level
  controls for the same creator identity.
- The demo harness intentionally shows its no-auth loading identity state; loaded UserButton keyboard behavior is covered by `tests/components/user-button.test.tsx`.
- The authenticated `/app` browser route remains unavailable in this isolated worktree without `DATABASE_URL`; the database-free `/demo` shell was used for current-main visual/runtime evidence.

## Severity audit

- P0: none
- P1: none
- P2: none
- P3: demo-only identity loading state and Storybook full-build infrastructure failures are outside this refinement

---

# Sidebar Creator Identity Composition Design QA

final result: passed

## Invariant and defect comparison

**One semantic identity, one top-level composition.** The active creator
identity and public-profile access must share one semantic and visual owner in
every sidebar state. Distinct actions remain sibling interactives inside that
owner; they may not become nested controls or adjacent footer rows.

- Defect evidence: `/var/folders/94/18gm8rr177124d51gsv4qj4m0000gn/T/TemporaryItems/NSIRD_screencaptureui_beDAUV/Screenshot 2026-08-21 at 5.04.19 PM.png`
- Exact-head desktop runtime: `/Users/timwhite/.codex/visualizations/2026/08/22/01a026c9-f138-7373-a453-f334a4a6b8d7/jov-5272-desktop-1440x900.png`
- Exact 694 × 340 comparison crop: `/Users/timwhite/.codex/visualizations/2026/08/22/01a026c9-f138-7373-a453-f334a4a6b8d7/jov-5272-sidebar-694x340.png`
- Runtime audit receipt: `/Users/timwhite/.codex/visualizations/2026/08/22/01a026c9-f138-7373-a453-f334a4a6b8d7/jov-5272-runtime-proof.json`
- Implementation source SHA for this capture: `c2b9c694ae22d3501f6c1f92277142dd6e4efb72`

The defect screenshot has two peer focal boundaries: a standalone Public
Profile row and a separately selected Tim White row. The corrected runtime has
one compact bordered identity composition. Creator name is primary; the profile
URL is subordinate inside the same boundary. This matches the authenticated app
shell's calm, low-chrome hierarchy without inventing a new component style.

## Viewports and equivalent surfaces

| Surface or state | Evidence | Result |
| --- | --- | --- |
| Expanded, 1440 × 900 | Authenticated `/app/chat` runtime and exact crop | Passed: one group, one boundary, creator name and URL occur once inside it |
| Narrow, 12rem rail | `UnifiedSidebar` Narrow story plus library regression test | Passed: same group and action order, copy truncates inside the owner |
| Collapsed icon rail | `UnifiedSidebar` Collapsed story plus library regression test | Passed: same group, two distinct icon actions, no sibling profile row |
| Equivalent sidebar/profile source sweep | invariant test scans sidebar footer surfaces that mention UserButton or Public Profile | Passed: no second creator composition or standalone same-creator profile row |
| Current split layout | deliberate-red fixture | Correctly rejected for sibling row, duplicate identity copy, and multiple boundaries |

## Interaction, focus, and layout checks

- Runtime audit found exactly one `creator` identity group, one enclosing
  identity boundary, two interactive descendants, zero nested interactives,
  and zero identity actions outside the group.
- Keyboard order is account menu first, then public profile. Runtime accessible
  names were `Open account menu for Browse Ready User` and
  `Open public profile at jov.ie/browse-ready-user`; both actions have one tab
  stop.
- Account-focus proof:
  `/Users/timwhite/.codex/visualizations/2026/08/22/01a026c9-f138-7373-a453-f334a4a6b8d7/jov-5272-sidebar-account-focus-694x340.png`
- Profile-focus proof:
  `/Users/timwhite/.codex/visualizations/2026/08/22/01a026c9-f138-7373-a453-f334a4a6b8d7/jov-5272-sidebar-profile-focus-694x340.png`
- Selected/open proof:
  `/Users/timwhite/.codex/visualizations/2026/08/22/01a026c9-f138-7373-a453-f334a4a6b8d7/jov-5272-sidebar-account-selected-694x340.png`
- Computed runtime styles confirm the child actions add no border, outline, or
  box shadow. Focus-within and selected/open treatments belong to the enclosing
  fieldset. Its idle geometry remains 204 × 64 CSS pixels, so the state change
  does not shift layout.

## RCA

The earlier refinement put both controls under a common footer ancestor but
rendered them as adjacent `SidebarMenuItem` rows. Its test asserted only the
shared ancestor, and the prior visual review repeated that structural claim as
"one protected user panel." Neither encoded semantic group count, peer-row
rejection, duplicate identity copy, or focus-boundary ownership. JOV-5272 adds
those mechanical checks and keeps the deliberate split fixture red.

## Severity audit

- P0: none
- P1: none
- P2: none
- P3: none
