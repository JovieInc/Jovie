# Native UI Convergence Registry

Source-grounded inventory for Jovie native iOS and macOS surfaces, with web
parity notes and deterministic Pen handoff specifications. This is an
inventory and handoff artifact, not a redesign and not a Pen source file.

## Fail-closed boundary

- Source snapshot: `7b937033b15622d85f7df721883d5e00fc95e0b9` (`origin/main` at
  the shipping audit).
- The source-only change in this PR is limited to the exact press feedback
  consolidation listed below: one shared style owner, four call-site
  migrations, and one contract test. The baseline SHA remains separate from
  the changed files so source evidence and shipping state stay explicit.
- Scope: `apps/ios`, `apps/macos/MenuMonitor`, and the web app surfaces that
  provide the native contracts or public/app parity targets.
- Chat and Calendar are founder-locked. Their source behavior is recorded for
  mapping only; this task does not propose visual changes to either surface.
- No `.pen` file was opened, read, searched, saved, or mutated. No Pen desktop
  or CLI session was opened. Pen presence/absence is therefore **unknown**, not
  inferred from this document.
- `pen_write: forbidden`; `pen_promotion: not_proven`.
- `source_parity: verified` means the cited source establishes the behavior or
  token contract. It does not mean a device screenshot, runtime, or Pen visual
  comparison was performed.
- `ledger_parity: historical` means `apps/ios/feature-status.csv` reports a
  prior test result. The CSV's dated evidence is not current runtime proof.
- `proposal` means a deterministic handoff target, not an implemented or
  founder-approved UX decision.

## Bottleneck, evidence, and success metric

The current convergence bottleneck is split ownership: iOS has a local token
and shell system, macOS has an independent operator menu, and web has a
separate CSS/TypeScript token system. The native source also contains several
near-duplicate SwiftUI press styles. Evidence is the independent token source
in `apps/ios/Jovie/DesignSystem/JovieTheme.swift:L4-L222`, the web token source
in `packages/ui/theme/tokens.ts:L17-L177,L229-L317`, the macOS-only target in
`apps/macos/MenuMonitor/Package.swift:L4-L17`, and the duplicate style owners
listed in [Duplicate and drift findings](#duplicate-and-drift-findings).

Success for the coordinator is a single source owner for each mapped family,
complete state coverage for each native surface, explicit responsive rules,
and a Pen handoff that cannot be mistaken for source or persistence proof.
This slice records the evidence and performs one narrow exact-duplicate
consolidation; it does not introduce a new primitive family or alter the
founder-locked Chat/Calendar surfaces.

## Authority and classification

The registry uses the following authority order:

1. Founder lock and explicit task boundary.
2. Current source at the snapshot above.
3. Current tests and route contracts.
4. The dated iOS feature ledger.
5. Deterministic handoff proposals.

“Atom”, “molecule”, and “organism” are handoff classifications. They do not
create SwiftUI types or authorize a duplicate implementation.

| Proof label | Meaning | Allowed coordinator use |
| --- | --- | --- |
| `verified-source` | Exact source lines establish anatomy, behavior, or token ownership. | Map to an existing source owner. |
| `verified-contract` | A route, API, test, or cross-platform contract is explicit in source. | Compare semantics; do not infer pixel identity. |
| `ledger-reported` | The dated feature ledger reports a passed check. | Historical context only. |
| `not-runtime-proven` | No device, macOS menu, browser, or screenshot run in this slice. | Do not claim shipped/runtime parity. |
| `proposal` | Handoff frame, state, or mapping suggestion. | Review only; never promote automatically. |
| `unknown-by-policy` | Pen state was intentionally not inspected. | Keep fail-closed. |

## Cross-platform token and elevation map

| Family | iOS owner | Web owner | macOS owner | Parity finding |
| --- | --- | --- | --- | --- |
| Surfaces | `JovieColor.backgroundBase/surface0...3`, `JovieTheme.swift:L4-L24` | `surfaces` and `JovieColor` aliases, `packages/ui/theme/tokens.ts:L17-L30,L319-L328` | No Jovie token layer; native menu styling, `MenuMonitorApp.swift:L45-L96` | `verified-source` within each platform; no shared native/macOS module is present in this checkout. |
| Text | `JovieColor` plus `JovieFont`, `JovieTheme.swift:L10-L12,L56-L75` | Inter body/interface and Satoshi display roles, `tokens.ts:L229-L272` | System menu font plus monospaced status output, `MenuMonitorApp.swift:L77-L83` | iOS is Inter-first; macOS is an operator surface and is not a product typography parity target. No serif is introduced. |
| Spacing/radius | `JovieSpacing` 4/8/12/16/24/32 and `JovieRadius` 6/8/12/16/pill, `JovieTheme.swift:L78-L93` | spacing/radius tokens, `tokens.ts:L162-L177,L203-L224` | System menu layout | Semantic overlap exists, but values are independently owned. |
| Motion | `JovieMotion`, including reduce-motion consumers, `JovieTheme.swift:L95-L122` | duration/easing/transition tokens, `tokens.ts:L288-L317` | No custom motion contract | iOS ports web motion names but still owns Swift values. |
| Controls | `JoviePillButtonStyle` and `JovieIconButtonStyle`, `JovieTheme.swift:L182-L222` | shared UI `Button`/link primitives and state matrix | Native `Button` rows, `MenuMonitorApp.swift:L67-L95` | iOS has 44-point icon frames; the canonical 32-visible-inside-44-target rule is an acceptance constraint for handoff, not proof that every existing icon has been measured. |
| Entity accents | `EntityAccent`, `JovieTheme.swift:L26-L53` | web CSS entity accent mapping referenced by the iOS source and mobile token contract | Not applicable | `verified-contract` for chat entity semantics; no macOS equivalent. |
| Elevation | Drawer is recessed base; `shellContent` is raised during drawer presentation, `AppShellLeftDrawer.swift:L38-L43` and `AppShellView.swift:L325-L394` | Shell/page/sidebar share the canvas; main content is one raised plane, `AppShellFrame.tsx:L60-L106`; audio tray is a semantic sibling, `L145-L152` | Menu-bar surface only | Handoff invariant: page and sidebar share elevation, main content is one level above, and additional levels are semantic only (QR plate, sheet, overlay). |

### Elevation invariant for all handoffs

The coordinator must preserve this stack:

1. **Base canvas:** page and sidebar/drawer.
2. **Raised content plane:** the main route content and its header/tab shell.
3. **Semantic-only surfaces:** QR plate, contextual sheet, workflow sheet,
   voice overlay, or a clearly labeled status popover.

Do not add decorative wells, floating cards, extra translucent planes, or a
second sidebar elevation. This is an explicit task invariant and is also
consistent with the web shell source comments at
`apps/web/components/organisms/AppShellFrame.tsx:L101-L105`.

## iOS screen and state registry

### Route and shell surfaces

| ID | Surface and owner | Source evidence | States verified in source | Adaptive behavior | Parity/proof |
| --- | --- | --- | --- | --- | --- |
| `ios.launch` | Splash and route resolver; `SplashView`, `AppRouter`, `AppState` | `apps/ios/Jovie/Features/Splash/SplashView.swift:L3-L69`; `apps/ios/Jovie/App/AppRouter.swift:L3-L8`; `apps/ios/Jovie/App/RootView.swift:L60-L118` | `launching`, `signedOut`, `needsOnboarding`, `ready`; splash opacity/scale; auth/onboarding/ready routing | Full-screen composition; reduce motion removes the scale transition in `SplashView` | `verified-source`; historical coverage in `feature-status.csv:L2`. |
| `ios.auth` | Browser-only auth entry; `AuthScreen` | `apps/ios/Jovie/Features/Auth/AuthScreen.swift:L27-L207` | Default, browser-opening/loading, disabled while loading, error; reserved error slot | Max width 430; 56-point primary control; vertical spacing reserves the error footprint | `verified-source`; historical coverage in `feature-status.csv:L3`. |
| `ios.onboarding` | Web setup handoff; `NeedsOnboardingView` inside `AppShellView` | `apps/ios/Jovie/Features/NeedsOnboarding/NeedsOnboardingView.swift:L3-L27`; `apps/ios/Jovie/App/RootView.swift:L76-L117` | Needs profile, continue-on-web; chat/audience/library/calendar/inbox disabled in this route | Padded full-width content; no native setup form; the web route owns completion | `verified-source`; historical coverage in `feature-status.csv:L6`. |
| `ios.shell` | Chat-first shell organism; `AppShellView` | `apps/ios/Jovie/Features/AppShell/AppShellView.swift:L99-L201,L203-L394,L537-L654` | Selected tab, drawer closed/open/dragging, keyboard visible, offline label, settings navigation, entity sheet, Talk overlay, reduce motion | Drawer width is `min(320, UIScreen.main.bounds.width * 0.86)`; content moves as one plane; safe-area toolbar/tab insets; no horizontal tab paging | `verified-source`. Current chat-first tests are the active launch authority: `apps/ios/JovieTests/AppShellChatFirstTests.swift:L4-L49`. |
| `ios.drawer` | Surface switcher and recent threads; `AppShellLeftDrawer` | `apps/ios/Jovie/Features/AppShell/AppShellLeftDrawer.swift:L38-L147,L206-L280,L308-L465` | Surface selected, loading skeleton, no threads, filtered-empty, populated/active thread, settings row, reduce motion | Drawer width is supplied by shell; rows remain interactive during decorative reveal; search clears on close | `verified-source`; the comments claim opacity-only while the modifier also offsets, recorded as drift below. |
| `ios.tabbar` | Primary navigation and Talk FAB; `AppShellTabBar` | `apps/ios/Jovie/Features/AppShell/AppShellTabBar.swift:L3-L69,L71-L128` | Four primary tabs, selected, pressed, Talk action; drawer-only Profile/Audience | 56-point bar; 58-point Talk FAB lifted 18 points; bottom safe-area inset belongs to shell | `verified-source`; historical coverage in `feature-status.csv:L7`. |
| `ios.settings` | Account/settings organism; `SettingsView` | `apps/ios/Jovie/Features/Settings/SettingsView.swift:L15-L165,L168-L250` | Loaded account, external link rows, build/version, logout idle/busy/disabled | Scroll view with full-width rows; icon button has a 44-point frame; no separate iPad/macOS layout | `verified-source`; historical coverage in `feature-status.csv:L14`. |

The current source/test decision is **chat-first for live/unspecified launch
modes** and **profile-first for profile-specific deterministic UI-test modes**.
The older sentence in `feature-status.csv:L7` saying ready profiles start on
Profile is historical ledger drift, not a reason to change the current code.

### Product surfaces

| ID | Surface and owner | Source evidence | States verified in source | Adaptive behavior | Parity/proof |
| --- | --- | --- | --- | --- | --- |
| `ios.profile` | Profile dashboard with QR and sharing; `DashboardView`, `QRCodeCardView`, `VenueModeView` | `apps/ios/Jovie/Features/Dashboard/DashboardView.swift:L52-L256`; `apps/ios/Jovie/Features/Dashboard/QRCodeCardView.swift:L4-L65`; `apps/ios/Jovie/Features/Dashboard/VenueModeView.swift:L4-L35` | Idle/loading skeleton, loaded, error/retry, QR unavailable with reserved square, copy success, share, Wallet busy/error, venue full-screen | QR preserves a square footprint; venue mode owns brightness/idle timer; content is vertically stacked | `verified-source`; historical coverage in `feature-status.csv:L8-L10,L21`. |
| `ios.audience` | Read-only highlights organism; `AudienceHighlightsView` | `apps/ios/Jovie/Features/Audience/AudienceHighlightsView.swift:L3-L94,L96-L243`; `apps/ios/Jovie/Core/MobileAudienceHighlightsResponse.swift:L3-L38` | Idle, loading skeleton, loaded, error/retry, offline copy, empty data represented by response contract | Two-column stat grid; padded scroll surface; Ask Jovie handoff | `verified-source`; historical coverage in `feature-status.csv:L22`. |
| `ios.library` | Filtered asset feed; `LibrarySurfaceView`, `LibraryModels` | `apps/ios/Jovie/Features/Library/LibraryModels.swift:L3-L136`; `apps/ios/Jovie/Features/Library/LibrarySurfaceView.swift:L3-L175` | Loaded list, filter selected, filtered empty; no source-owned loading/error/offline state because data is preview-local | Horizontal filter strip; vertical lazy feed; 64-point cover; cards use full-width row hit area | `verified-source`; preview-only contract is explicit in `LibraryModels.swift:L89-L136`. Web/app parity is partial. |
| `ios.calendar` | Founder-locked action-loop calendar; `CalendarSurfaceView` | `apps/ios/Jovie/Features/Calendar/CalendarSurfaceView.swift:L3-L201` | Loaded sections, response empty, loading skeleton, error/retry, offline/pending labels, Ask Jovie | Vertical scroll; fixed row footprints; semantic sections for upcoming events, confirmation, releases | `verified-source`; visual parity is not proven. |
| `ios.inbox` | Founder-locked action-loop inbox; `InboxSurfaceView` | `apps/ios/Jovie/Features/Inbox/InboxSurfaceView.swift:L3-L239` | Loaded visible cards, all-dismissed empty, loading skeleton, error/retry, offline/pending labels, local triage swipe/context menu | Vertical scroll; swipe threshold 80; reduce motion removes triage offset; cards keep their own action footprint | `verified-source`; visual parity is not proven. |
| `ios.chat` | Chat transcript/composer; `MobileChatView`, `MobileChatPlaceholderView`, message/tool views | `apps/ios/Jovie/Features/Chat/MobileChatView.swift:L3-L216`; `MobileChatPlaceholderView.swift:L3-L70`; `MobileChatMessageViews.swift:L4-L385`; `MobileChatToolCardView.swift:L3-L47` | Empty online/offline, cached transcript, streaming/thinking, assistant/user bubbles, tool running/succeeded/failed, failed-turn retry, web handoff, scroll-to-bottom, composer error | Composer is a bottom safe-area inset; transcript is lazy and scroll-anchored; keyboard dismissal and reduce motion are explicit | `verified-source`; historical coverage in `feature-status.csv:L11-L13,L18,L23-L24`. Chat is locked; do not redesign from this map. |

### iOS overlay and action organisms

| ID | Owner | Anatomy and states | Source evidence |
| --- | --- | --- | --- |
| `ios.chat-composer` | `ChatComposerBar` | Plus/workflow trigger, 52-point text-entry lane, 52-point send target, slash palette, workflow sheet; slash rows use background-only pressed feedback | `apps/ios/Jovie/Features/Chat/ChatComposerBar.swift:L3-L113,L130-L363`; `ComposerWorkflowSheet.swift:L3-L141` |
| `ios.entity-sheet` | `EntityContextSheet` | Cover/title/kind, visibility row, deterministic stat grid, Edit In Chat, Copy Link, medium/large detents; stats are explicitly placeholder and visibility has no backend save | `apps/ios/Jovie/Features/AppShell/EntityContextSheet.swift:L4-L55,L57-L221` |
| `ios.talk-overlay` | `TalkOverlayView` | Starting, recording, reviewing; fixed transcript/draft region; reserved error region; Cancel and Use Draft; draft is editable and never auto-sent | `apps/ios/Jovie/Features/AppShell/TalkOverlayView.swift:L3-L24,L26-L133,L135-L291`; shell handoff at `AppShellView.swift:L255-L269` |
| `ios.workflow-sheet` | `ComposerWorkflowSheet` | Six workflow actions, two-column grid, sheet presentation, 92-point tile target, 36-point icon frame | `apps/ios/Jovie/Features/Chat/ComposerWorkflowSheet.swift:L3-L141` |

## iOS atom, molecule, and organism ownership

| Classification | Canonical owner | Consumers | Ownership rule |
| --- | --- | --- | --- |
| Atom | `JovieColor`, `JovieFont`, `JovieSpacing`, `JovieRadius`, `JovieMotion` | All native iOS product surfaces | Extend this token owner only after prior-art review; do not create feature-local colors, fonts, or spacing registries. `JovieTheme.swift:L4-L122`. |
| Atom | `JoviePillButtonStyle` | Dashboard, auth, onboarding, audience, calendar, inbox, entity, Talk | Canonical full-width pill action; `JovieTheme.swift:L182-L206`. |
| Atom | `JovieIconButtonStyle` | Shell gear, settings close, chat scroll-to-bottom | Canonical 44-point circular icon target; `JovieTheme.swift:L208-L222`. |
| Atom | `JovieLogoMark` and QR plate modifier | Splash, auth, QR surfaces | Logo and QR plate are shared source owners; `JovieTheme.swift:L124-L180,L244-L256`. |
| Atom | `EntityAccent` | Inline chat entity chips | Only for entity-kind parity; do not reuse as generic iOS accents; `JovieTheme.swift:L26-L53`. |
| Atom | `JoviePressFeedbackButtonStyle` | AppShell tab bar and drawer rows | Canonical owner for the exact `.72`/scale/subtle recipe; `JovieTheme.swift:L224-L242`; verified by `AppShellTabBarTests.swift:L69-L72`. |
| Molecule | `DashboardAvatarView` | Shell toolbar, drawer account, dashboard | Cached avatar with surface fallback; `apps/ios/Jovie/Features/Dashboard/DashboardView.swift:L5-L20`. |
| Molecule | `QRCodeCardView` | Dashboard and venue mode | One square QR/loading/unavailable footprint; `QRCodeCardView.swift:L4-L65`. |
| Molecule | `DrawerThreadRow`/`DrawerSurfaceButton` | Left drawer | Drawer-local rows; do not copy into another navigation surface; `AppShellLeftDrawer.swift:L243-L280,L378-L425`. |
| Molecule | `CalendarEventRow`/`CalendarReleaseRow` | Calendar | Calendar-specific rows; founder-locked surface; `CalendarSurfaceView.swift:L143-L201`. |
| Molecule | `InboxActionCard` | Inbox | Triage-aware action card; `InboxSurfaceView.swift:L150-L239`. |
| Molecule | `LibraryAssetCard` | Library | Preview feed card; not an API-backed universal card; `LibrarySurfaceView.swift:L88-L165`. |
| Organism | `AppShellView` + `AppShellLeftDrawer` + `AppShellTabBar` | All authenticated native product surfaces | Sole native navigation composition and elevation owner; `AppShellView.swift:L203-L394`. |
| Organism | `AudienceHighlightsView` | Drawer-only audience surface | Read-only highlights and chat handoff; `AudienceHighlightsView.swift:L36-L71,L96-L164`. |
| Organism | `MobileChatView` + composer/message/tool cards | Chat | One transcript/composer owner; `MobileChatView.swift:L35-L171`. |
| Organism | `EntityContextSheet`, `ComposerWorkflowSheet`, `TalkOverlayView` | Contextual actions | Semantic surfaces above the raised content plane; source lines listed above. |
| Organism | `SettingsView` | Settings route | Full-screen settings stack within shell navigation; `SettingsView.swift:L15-L165`. |

## macOS screen and state registry

The checkout contains one macOS product target: `MenuMonitor`, a menu-bar-only
operator tool. It is not a public artist profile, a creator app shell, or a
macOS rendering of the iOS product surface.

| ID | Surface and owner | Source evidence | States verified in source | Adaptive behavior | Parity/proof |
| --- | --- | --- | --- | --- | --- |
| `macos.menu-monitor` | Menu bar label and menu; `MenuMonitorApp`, `MenuMonitorMenu` | `apps/macos/MenuMonitor/Sources/MenuMonitor/MenuMonitorApp.swift:L4-L20,L23-L43,L45-L100`; target platform `Package.swift:L4-L17` | Count badge 0/positive/99+, refreshed timestamp, error text, status output, restart/status/dashboard/refresh/quit actions | Menu-bar-only accessory app; no responsive width/size-class contract; macOS 14 target | `verified-source`; not product UI parity. |
| `macos.shipping-store` | Poll/fallback/action state model; `ShippingStatusStore` | `apps/macos/MenuMonitor/Sources/MenuMonitor/ShippingStatusStore.swift:L4-L71,L73-L111` | Counts loaded, Kanban error with GitHub fallback, terminal fetch error, action message, status output, 30-second polling | Main-actor state with detached utility work; shell/process output is operator-only | `verified-source`; `actionMessage` is published but not rendered by `MenuMonitorMenu` (state gap). |

### macOS state gap

`ShippingStatusStore.actionMessage` is set during restart and status actions at
`ShippingStatusStore.swift:L62-L106`, but `MenuMonitorMenu` renders only counts,
`lastError`, `statusOutput`, and timestamps at `MenuMonitorApp.swift:L48-L83`.
The source therefore has an unpresented action-progress/completion state. This
is a source finding, not an implementation request in this slice.

## Cross-platform and public/app parity

Semantic parity is not pixel parity. The web app has a canonical shell and
several routes that are not native equivalents.

| Capability | iOS source | Web/public source | Parity result |
| --- | --- | --- | --- |
| Auth/onboarding | Browser auth and web setup handoff, `AuthScreen.swift:L27-L207`, `NeedsOnboardingView.swift:L3-L27` | Auth routes and public profile are separate Next route trees; public profile layout is ISR, `[username]/layout.tsx:L4-L20` | `verified-contract`; semantic handoff only. |
| Authenticated shell/elevation | Drawer base + raised shell content, `AppShellView.swift:L325-L394` | `AppShellFrame` has page/sidebar canvas and one raised main plane, `AppShellFrame.tsx:L60-L106` | `verified-contract`; same elevation intent, different navigation geometry. |
| Chat | Native transcript, streaming, retry, composer, `MobileChatView.swift:L35-L216` | Chat route and surface, `ChatPageClient.tsx:L1-L65`; mobile contract routes under `apps/web/app/api/mobile/v1/chat` | `verified-contract`; founder-locked visual behavior, no screenshot parity proof. |
| Calendar | Action-loop sections and pending/retry state, `CalendarSurfaceView.swift:L45-L128` | Month grid, filter rail, day detail, pending confirm/reject, `CalendarPageClient.tsx:L199-L222,L431-L507,L625-L639` | `verified-contract`; behavior overlaps, anatomy differs; founder lock applies. |
| Inbox | Swipeable action cards, `InboxSurfaceView.swift:L48-L239` | Root shell is an Opportunity Inbox route, `apps/web/app/app/(shell)/page.tsx:L7-L45` | `partial`; same action-loop intent, not the same surface. |
| Audience | Drawer-only read-only highlights, `AudienceHighlightsView.swift:L36-L71` | Historic audience route redirects to Contacts with `tab=audience`, `apps/web/app/app/(shell)/audience/page.tsx:L7-L31` | `partial` and route-drift finding; native highlights are not a web Contacts table. |
| Library | Preview-only local feed, `LibraryModels.swift:L89-L136` | Legacy dashboard library route redirects to `APP_ROUTES.LIBRARY`, `apps/web/app/app/(shell)/dashboard/library/page.tsx:L1-L7`; shell route matcher includes both, `shell-route-matches.ts:L113-L120` | `partial`; native source does not prove API-backed parity. |
| Presence | No native Presence organism; iOS has profile/audience drawer surfaces | Web canonical Profiles workspace, `apps/web/app/app/(shell)/profiles/page.tsx:L18-L40`; legacy `/presence` redirects, `presence/page.tsx:L7-L16` | `not present in native source`; do not invent a native screen from the web route. |
| Tasks | No native Tasks surface in the current iOS shell registry | Web primary IA includes Tasks, `dashboard-nav/config.ts:L107-L130`; route matcher includes Tasks, `shell-route-matches.ts:L122-L127` | `not present in native source`. |
| Public profile | iOS opens/copies public URL and hands off to web, `DashboardView.swift:L180-L231` | Public profile is composed by `StaticArtistPage` → `ProfileCompactTemplate`, `StaticArtistPage.tsx:L60-L162`; route loader/error/not-found in `[username]/page.tsx:L217-L249` | `verified-contract`; native is an operator/share entry, not the public profile renderer. |
| Settings | Compact native account/settings rows, `SettingsView.swift:L60-L165` | Web has user and artist settings navigation, `dashboard-nav/config.ts:L132-L220` | `partial`; semantics overlap, feature breadth differs. |
| macOS operator monitor | `MenuMonitorApp` only | Web dashboard is a destination opened by operator action, `MenuMonitorApp.swift:L87-L92` | Deliberately not product parity. |

## Responsive and adaptive acceptance matrix

No native device or browser run was performed in this slice. The following is
the source contract to verify, not a claim that each viewport has passed.

| Target | Source-backed behavior | Handoff acceptance |
| --- | --- | --- |
| Compact iPhone, narrow portrait | Drawer is bounded to 86%/320 max; bottom tab bar and Talk FAB are shell-owned; QR and async cards reserve footprints; chat composer is a bottom inset | No horizontal scroll, no content under the home indicator, 32-visible controls inside 44-point targets, no state-induced vertical jump. |
| Medium iPhone / large portrait | Same shell composition with wider drawer; grids remain readable; long labels use minimum scale/truncation where source provides it | Preserve semantic hierarchy; do not add a second navigation rail or duplicate tab bar. |
| iPad / wide iOS | No dedicated size-class branch is present in the inspected native surfaces; SwiftUI flexible stacks/grids are the source behavior | Treat any tablet-specific layout as `proposal` until source owner and test evidence exist. Do not infer a Pen tablet frame from iPhone code. |
| Web compact | Shell body reserves safe-area top and mobile bottom surface; mobile nav is capacity-derived, `AppShellFrame.tsx:L60-L80,L156-L163`; nav partition in `dashboard-nav/config.ts:L226-L260` | Verify compact nav, safe area, keyboard/composer, and route loading geometry. |
| Web desktop | Sidebar mount and raised main plane share coordinated shell motion; `AppShellFrame.tsx:L71-L143` | Main content remains one raised plane; right rail is in-flow and may narrow the route. |
| macOS menu bar | Accessory menu only; no window or adaptive product shell | Verify menu readability and action feedback, not iOS/web visual parity. |
| Text scaling / reduce motion | iOS uses SwiftUI environment in drawer, audience, chat, Talk; web uses `motion-reduce`; examples `AppShellLeftDrawer.swift:L59-L64,L132-L146`, `JovieTheme.swift:L95-L122` | Preserve reserved layout; remove movement under reduce motion while keeping accessible opacity/state changes. |

## Duplicate and drift findings

### Duplicate SwiftUI press feedback owners

These are source-backed near-duplicates. The exact `.72` recipe was consolidated
into `JoviePressFeedbackButtonStyle`; the remaining variants are intentionally
not treated as interchangeable:

| Owner | Evidence | Difference |
| --- | --- | --- |
| `JoviePressFeedbackButtonStyle` | `JovieTheme.swift:L224-L242` | Canonical `.72`/scale/animation recipe used by the tab bar and drawer |
| `JovieIconButtonStyle` | `JovieTheme.swift:L208-L222` | Same `.72`/scale/animation plus 44-point circular icon geometry |
| `SettingsRowButtonStyle` | `SettingsView.swift:L211-L221` | Same scale/animation but opacity `.7` |
| `LibraryCardButtonStyle` | `LibrarySurfaceView.swift:L168-L175` | Same scale/animation but opacity `.8` |
| `ComposerSlashRowButtonStyle` | `ChatComposerBar.swift:L352-L362` | Intentionally different: background highlight only, no scale |

The exact duplicate consolidation is implemented in this slice and its
canonical default is covered by `SharedPressFeedbackStyleTests`. The `.7`/`.8`
variants and the filled/icon geometry styles remain separate because their
opacity or geometry differs; no broad style rewrite was performed.

### Verification result

- Pinned evidence used Node `22.23.1`, pnpm `9.15.4`, Xcode `26.6`, and the iOS
  `26.5` simulator.
- `JOVIE_AGENT_PROFILE=coder pnpm run ios:lint`: passed (`iOS best-practices
  lint: clean`).
- The reverted full suite passed 238 unit tests in 39 suites, then executed 33
  UI tests with 5 environment-gated skips and one failure at
  `apps/ios/JovieUITests/JovieUITests.swift:319`. The isolated reverted test
  passed, so the failure is order/state-sensitive baseline evidence.
- The patched full suite passed 239 unit tests in 40 suites (the one added
  shared-style contract test passed) and produced the identical UI result: 33
  executed, 5 skipped, one failure at the same assertion, with no additional
  failures.

### Other source drift

1. **Motion comment/code mismatch.** `DrawerRowRevealModifier` is described as
   “opacity-only (no offset)” at `AppShellLeftDrawer.swift:L150-L153` but applies
   `.offset(x: ... -8)` at `L159-L163`. `StatTileRevealModifier` repeats the
   same comment/code mismatch at `AudienceHighlightsView.swift:L250-L263`.
2. **Press token mismatch and stale inventory.** iOS names
   `JovieMotion.pressScale` the canonical `--scale-press` at
   `JovieTheme.swift:L120-L122` and sets it to `0.96`. The current web CSS token
   is `0.98` at `apps/web/styles/design-system.css:L2021-L2024`, while the
   historical state matrix still documents `active:scale-[0.96]` at
   `docs/design-system/state-matrix.md:L42`. Keep the token under one owner
   when a migration is authorized; do not silently alter locked Chat/Calendar.
3. **Local token ownership.** iOS hard-codes its `Color(hex:)` values in
   `JovieTheme.swift:L4-L24`; web resolves CSS variables in `tokens.ts:L17-L30`.
   The semantic names overlap, but no cross-platform generated token contract
   is proven by source.
4. **Settings capitalization.** `SettingsSectionTitle` applies
   `.textCase(.uppercase)` at `SettingsView.swift:L168-L180`; this is a source
   style decision to review against the no-default-all-caps rule, not a reason
   to rewrite settings during this inventory.
5. **Entity context is partly placeholder.** The sheet itself says its stats
   are stable placeholders until asset-graph pages are wired and its
   visibility toggle has no backend save, `EntityContextSheet.swift:L33-L55,
   L140-L166`. Treat those values as source behavior, not product truth.
6. **Library is preview-backed.** The library model explicitly says the feed is
   preview data until a dedicated mobile API exists, `LibraryModels.swift:L89-L136`.
   Its source state contract is therefore list/filter/empty, not loading/error.
7. **Audience route split.** Native has a highlights drawer surface, while the
   web audience route redirects to Contacts, `audience/page.tsx:L7-L31`. This
   is a semantic/IA mismatch that should remain visible in any cross-platform
   mapping.
8. **macOS feedback gap.** `actionMessage` is published and updated but not
   rendered, as described in [macOS state gap](#macos-state-gap).

## State coverage and missing-state register

| Surface | Default/loaded | Loading | Empty | Error/retry | Offline/stale | Interaction states | Missing or constrained state |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Launch/auth/onboarding | Yes | Auth loading | Onboarding handoff | Auth error; app route error | AppState retains stale profile on transport failure, `AppState.swift:L123-L221` | Disabled/loading controls | No native profile setup form by design. |
| Shell/drawer | Yes | Conversation skeleton | No threads / filtered empty | No drawer-specific fetch error presenter | Offline label in toolbar | Selected, pressed, drag, reduce motion, settings route | Focus styling is mostly SwiftUI default, not a shared explicit native token. |
| Dashboard/QR | Yes | Stable skeleton | QR unavailable | Retry and Wallet alert | Profile offline state via AppState | Copy success, share, venue, Wallet busy | No visual runtime proof in this slice. |
| Audience | Yes | Skeleton | Response-driven content; no dedicated empty copy in loaded branch | Retry | Offline label/copy | Ask Jovie handoff | `isStale`/offline semantics are split across repository/view state. |
| Library | Yes | No | Filtered empty | No | No | Selected filter, card press | API loading/error/offline contract absent because preview-local. |
| Calendar | Yes | Skeleton | Nothing on calendar | Retry | Offline/pending labels | Filter, selected day, pending confirm/reject | Founder-locked; no visual changes proposed. |
| Inbox | Yes | Skeleton | Caught up / empty action cards | Retry | Offline/pending labels | Swipe triage, context menu, reduce motion | Undo/recovery semantics are local to card behavior. |
| Chat | Empty/transcript | Thinking/streaming | Online/offline empty copy | Failed turn retry and composer error slot | Offline cached history/draft guidance | Scroll, slash palette, workflow sheet, entity chips, web handoff | No native public chat route; ready profile required. |
| Settings | Loaded | Logout spinner | Not applicable | External link failure is delegated to system/browser | Not explicit | Disabled logout, rows, close | No explicit in-view link failure state. |
| Talk/entity/workflow overlays | Default/review | Starting/recording | Empty transcript error | Reserved error slot / permission copy | Not explicit | Sheets, detents, review, editable draft | Pen presence and persistence unknown. |
| macOS MenuMonitor | Counts/status | No explicit loading state | Zero-count badge | Kanban fallback/error text | Fallback is explicit | Actions/status output | `actionMessage` is not rendered; no loading indicator. |

## Deterministic Pen handoff contract

This section is deliberately a handoff specification, not a Pen mutation. Each
frame is a source-mapped review target. The companion machine-readable file is
[`native-ui-pen-handoff.json`](native-ui-pen-handoff.json).

### Handoff rules

- `pen_presence` is `unknown_by_policy` for every frame.
- `write_authorized` is `false` for every frame.
- `promotion` is `blocked` until a coordinator proves source mapping, canonical
  save/readback, persistence, and any required runtime/device evidence.
- A frame may use the existing locked Chat or Calendar composition as a review
  reference, but may not be treated as a new master or visual approval.
- Use one frame per state family and record compact/medium/wide behavior as
  constraints, not as unapproved alternate compositions.
- Use no serif fonts. Keep page/sidebar on the base elevation and main content
  one elevation above. Reserve QR/sheet/Talk/workflow levels semantically.
- Visible controls must be 32px/points or less inside 44px/point hit targets
  where the source permits; never shrink the hit target to the icon glyph.

### Frame specifications

| Frame ID | Target | Source-backed anatomy | Required states | Responsive constraint | Status |
| --- | --- | --- | --- | --- | --- |
| `ios-launch-auth` | Compact iPhone launch → auth | Logo, route state, browser auth action, reserved error slot | launching, signed out, loading, error | Max-width auth column; no layout jump when error appears | `source-mapped`; Pen unknown |
| `ios-shell-drawer` | Compact/medium iOS shell | Drawer base, raised content plane, toolbar, surface switcher, recent threads, settings | closed/open/drag, selected, loading skeleton, no threads, filtered empty, offline | Drawer max 320/86%; edge gesture only; no horizontal tab paging | `source-mapped`; founder lock applies to Chat entry |
| `ios-dashboard-qr` | Compact/medium profile dashboard | Toolbar/avatar, QR plate, public URL, copy/share, optional Wallet | loading, loaded, QR unavailable, copied, Wallet busy/error, venue | Square QR footprint; venue is full-screen semantic overlay | `source-mapped` |
| `ios-audience` | Compact/medium drawer surface | Hero metric, 2-column stats, Ask Jovie | idle/loading/loaded/error/offline | Preserve two-column tile geometry; no table expansion inferred | `source-mapped` |
| `ios-library` | Compact/medium asset feed | Filter strip, asset cards, entity handoff | loaded/filter/empty | Horizontal filters; vertical feed; preview status must be visible to coordinator | `source-mapped`, partial |
| `ios-calendar-locked` | Compact/medium founder-locked Calendar | Header, sections, rows, Ask Jovie | loaded/empty/loading/error/offline/pending | Keep current source anatomy; no visual proposal | `locked source reference` |
| `ios-inbox-locked` | Compact/medium founder-locked Inbox | Header, action cards, Ask Jovie | loaded/empty/loading/error/offline/triage | Keep swipe semantics and reserved card footprint | `locked source reference` |
| `ios-chat-locked` | Compact/medium founder-locked Chat | Transcript, composer, empty copy, tool/entity cards | empty/offline/streaming/retry/handoff | Composer bottom inset; no source drift | `locked source reference` |
| `ios-settings` | Compact/medium settings route | Account card, links, build rows, logout | loaded/logout busy/disabled | Scrollable single-column rows; 44-point icon target | `source-mapped` |
| `ios-talk-context` | Compact/medium semantic overlays | Talk full-screen review, entity sheet, workflow sheet | starting/recording/reviewing, medium/large sheet, workflow actions | Overlay above raised content plane; reserve transcript/error areas | `source-mapped` |
| `macos-menu-monitor` | macOS menu-bar operator surface | Shipping label, counts, error/fallback, actions/status output | zero/positive/99+, refreshed/error/fallback/action output | No iOS/web frame reuse; menu-bar-only | `source-mapped`, operator-only |

## Coordinator acceptance gates

The handoff is complete only when all of these remain true:

1. Every native frame points to a current source owner and exact line range.
2. No frame is treated as Pen presence/absence proof; Pen state remains
   `unknown_by_policy` until separately inspected under the coordinator's lock.
3. Chat and Calendar remain founder-locked and source-mapped only.
4. The elevation invariant is visible in the mapped anatomy.
5. State coverage distinguishes source-verified states from proposed states.
6. Preview-backed Library, placeholder-backed Entity Context, audience route
   split, and macOS action feedback gap remain explicitly labeled.
7. No new SwiftUI view, modifier, token, or Pen component is created merely to
   make the registry look complete.
