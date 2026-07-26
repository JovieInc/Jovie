# Launch Atomic Design Compliance Program

Issue: JOV-4473; baseline: `main@e336794c875a9f636e89770b4cbe8db8e489109c`
Design-read: Reading this as: a launch-readiness compliance system for artists and operators, with a calm, compact product language, leaning toward Jovie System B and its existing atomic architecture. Dials: `DESIGN_VARIANCE=low`, `MOTION_INTENSITY=functional`, `VISUAL_DENSITY=high`

## Outcome and success metric

The launch UI should use one atomic system without becoming one oversized
refactor. Work ships as independently reviewable slices that reduce duplicated
component families, preserve the loaded composition across state changes, and
avoid files owned by active work.

The program succeeds when:

1. Every launch surface is mapped to canonical atoms, molecules, organisms, and
   documented exceptions.
2. New launch-surface code cannot introduce a raw overlay, menu, loading
   animation, filter toolbar, empty state, or icon action when a canonical
   primitive fits.
3. Loading, loaded, empty, error, and refresh states preserve the same frame,
   control slots, focus path, and key bounding boxes.
4. Each migration slice stays below the repository size gates, includes visual
   evidence for desktop and mobile, and can land without waiting for unrelated
   launch work.

## Scope

### Launch surfaces

- Public homepage.
- Public `/start` through waitlist outcomes.
- Authenticated shell: sidebar, header/global search, identity menu, overlays.
- Inbox when actionable.
- New Chat and active chat.
- All Chats.
- Profiles.
- Library.
- Shared right rails, tables/lists, empty states, composer/input, and status
  states used by those surfaces.

### Feature-gated consumers

Contacts, Calendar, and Tasks are excluded from surface implementation. Shared
primitive changes may propagate to them only when behavior and geometry remain
equivalent.

Calendar's future direction is recorded now so it does not grow a bespoke
system when reactivated:

- The calendar grid occupies the full-width main plane.
- The selected event opens in the shared right rail, never below the grid.
- Releases, events, and needs-review are canonical header-toolbar filters.
- Redundant subtitle and description copy is removed.
- Month/date selection and Today form one coherent toolbar control group.
- Calendar consumes shared header, filter, and rail primitives.

## Active ownership and overlap matrix

| Owner / PR | Current files in or beside scope | Risk | Program action |
| --- | --- | --- | --- |
| Homepage design, active coordinated work | `app/(home)`, homepage components and copy | High | Audit contracts and receive screenshots only. Do not edit until the owner hands off. |
| PR #14904 onboarding repair | `OnboardingChat.tsx`, recovery row, helpers, tests | High | No onboarding implementation edits. Record loading and component gaps for a later replant. |
| Chat reliability, including PR #14901 | Chat API artist context; other active chat work is coordinated externally | High | No chat behavior or route migration in the foundation slice. |
| PR #14820 oversized dashboard batch | Shell layout/content, Inbox, chat, Library, Profiles, `/start/loading.tsx`, Storybook config, design docs, many other files | Critical | Treat as an ownership fence. Do not edit any listed route or shell file. Re-evaluate after the batch is split or closed. |
| PR #14636 Library collections | `LibrarySurface.tsx` plus Library tests | High | Library is reference evidence only until this PR lands or is replanted. |
| PR #14895 public profile direction | Public-profile drawers, rails, actions, views, tests | High | Public-profile surface work is out of this slice. Shared atoms must remain compatible. |
| PR #14660 atom Storybook coverage | Storybook config, visual policy/gate files, many `packages/ui` atom stories | Medium | Avoid its exact files. Coordinate Storybook contract and rebase before landing. |
| PR #14652 visual enforcement | Storybook config, CI visual gate, visual policy | High | Do not implement a second visual gate. Supply the forward-only rule and baseline requirements to this owner. |
| PR #14824 Storybook cleanup | Story removals plus UI/design docs and CI workflows | High | Do not revive removed stories or edit its exact files. New stories must render real canonical components. |
| This slice, JOV-4473 | New compliance document, loading atoms, semantic surface-state primitive, focused tests/stories | Low | No route consumer migrations in the foundation PR. |

## Launch surface compliance matrix

Statuses: **Canonical** means shared ownership; **Mixed** means equivalents remain; **Unknown geometry** means parity is unproved; **Owner hold** means do not edit while coordinated work owns the surface.

| Surface | Canonical structure already present | Main gaps | Loading geometry | Status / next slice |
| --- | --- | --- | --- | --- |
| Homepage | System B tokens, canonical Button, shared marketing shell | Active composition work determines final hierarchy; do not normalize against a moving target | No data skeleton should be added to the static homepage | Owner hold; audit selected composition after owner handoff |
| `/start` → waitlist | `AppShellFrame`, `Skeleton`, onboarding/waitlist feature shells | Onboarding and waitlist still contain action-local raw spin/pulse candidates; behavior is actively changing | `/start/loading.tsx` documents final frame dimensions, but onboarding standalone loading uses a separate copy-heavy composition | Owner hold; later migrate through shared state primitives |
| App shell | `AppShellFrame`, `SidebarNavItem`, `HeaderSearchSurface`, `AppShellRightRail`, shared menu atoms | `AppShellSkeleton` still uses raw `.skeleton` divs; identity menu contains raw pulse blocks; overlay families need equivalence review | Shell width/header slots are known; default main geometry is not route-specific | Foundation consumer after PR #14820 fence clears |
| Inbox (`/app`) | Opportunity card organisms, shared shell and profile rail | Actionable state is feature-shaped; must not be treated as New Chat | Current route classifier returns the New Chat skeleton for `/app` | **Unknown geometry / P0 migration** after chat and dashboard ownership clears |
| New Chat | `ChatWorkspaceSurface`, canonical chat input/composer family, shared entity rail | Multiple action-local spinner candidates and raw button implementations require behavior review, not mechanical replacement | New Chat route skeleton matches the welcome/composer composition | Owner hold; migrate only after chat reliability handoff |
| Active chat | Shared chat transcript, composer, entity chips/popovers, right rail | Tool cards and upload/confirm surfaces contain many local pending indicators; some are valid action-local exceptions | Conversation skeleton owns transcript viewport and composer dock | Owner hold; migrate action-local indicators after reliability work |
| All Chats (`/app/chats`) | `PageShell`, `AppSearchField`, `Button`, shared thread row/context menu, `ConfirmDialog` | Local header instead of `PageToolbar`; bespoke `ChatListSkeleton`; card-like empty state; secondary copy repeats search behavior | Shell route classifier returns the New Chat skeleton before the local list skeleton mounts | **Unknown geometry / P0 migration** after chat ownership clears |
| Profiles | `PageShell`, `PageToolbar`, `UnifiedTable`, `EntitySidebarShell`, drawer primitives | Local filter array and raw status dots are candidates for canonical tab/status families; rail header includes a bordered fallback tile | Route navigation has `DashboardSegmentSkeleton(profile)`; first shell mount uses generic `AppShellSkeleton` | Mixed; geometry contract slice after PR #14820 |
| Library | `PageShell`, `PageToolbar`, shared menus/popovers/sheet, `UnifiedTable`, drawer/rail primitives | Route-local filter pill, duplicate focus class constants, broad local overlay composition; PR #14636 owns current file | Strongest current example: toolbar slots, table columns, row height, and min-width are reserved | Canonical reference; migrate after PR #14636 |
| Contacts | Shared shell/table/rail families | Feature-gated | Not audited for launch | Excluded |
| Calendar | Future consumer of `PageToolbar`, filters, and `AppShellRightRail` | Current implementation is not the approved future composition | Not audited for launch | Excluded; direction recorded above |
| Tasks | Shared shell/table/rail families | Feature-gated | Not audited for launch | Excluded |

## Atomic family inventory

Static scans identify candidates, not automatic violations. Migration requires behavioral equivalence, focus-path parity, and equal or better geometry.

| Family | Canonical owner | Launch-reachable duplicates or gaps | Decision |
| --- | --- | --- | --- |
| Buttons | `@jovie/ui` `Button`; compact icon controls use canonical icon-button families | Route and feature files still contain raw buttons; static scan found 119 files in the broad launch-reachable/shared set | Audit by behavior. Promote only repeated, equivalent controls. |
| Icon actions | `Button size="icon"`, `TableIconButton`, `DrawerHeaderActions`, reviewed shell icon controls | `IconBtn`, `ThreadCardIconBtn`, local composer and opportunity icon buttons | Keep specialized behavior only when hit area, tooltip, pressed state, or row semantics differ. |
| Menus/dropdowns/popovers | `@jovie/ui` Radix atoms, `CommonDropdown`, `ToolbarMenuPrimitives`, `ShellDropdown` | `ContextMenuOverlay`, `EntityPopover`, route-local menu compositions | Converge styling and focus contracts; do not collapse semantically different popup types into one component. |
| Header toolbars | `PageToolbar`, `PageToolbarActionButton`, `PageToolbarTabButton` | All Chats local header; Library local filter pill; future Calendar controls | Adopt per workspace after route owners hand off. One primary action maximum at toolbar end. |
| Cards/surfaces | `PageShell`, `ContentSurfaceCard`, `DrawerSurfaceCard`, shared card atom | Local bordered/dashed empty containers, fallback icon tiles, tool-card families | Subtract nested chrome first. Tool-result cards remain documented exceptions when the card is the interaction. |
| Tables/list rows | `UnifiedTable`, `ShellListRowFrame`, `SidebarThreadRow`, opportunity row/card organisms | Route-local list skeletons and one-off row chrome | Preserve each row's semantics; share frame, selection, keyboard, and state behavior. |
| Composer/input | `ChatInput`/chat composer family, `Input`, `AppSearchField` | Onboarding and chat action surfaces carry local pending controls | Chat reliability owner decides consumer migration. Foundation owns state vocabulary only. |
| Empty/error | `EmptyState`, `TableEmptyState`, `PageErrorState`, `EntitySidebarShell` empty slot | All Chats local empty card; feature-specific Inbox empty state; mixed drawer empty primitives | Migrate when the state has the same job and action hierarchy. Document true feature exceptions. |
| Entity rails | `AppShellRightRail`, `EntitySidebarShell`, drawer section/header families | Chat and Library hosts compose their own registration layers | Keep registration adapters; converge the rendered rail frame and sections. |
| Share/link rows | `CopyableUrlRow`, `CompactLinkRail`, `SidebarLinkRow`, Library share components | Route-specific share panels and URL cells | Consolidate only matching copy/open/status behavior. |
| Tabs/filter pills | `PageToolbarTabButton`, `TabBar`, `SegmentControl`, table filter primitives | Library filter pills; Profiles local filter list; future Calendar filters | Choose one primitive per interaction semantics; avoid a universal pill abstraction. |
| Status indicators | `StatusBadge`, `TableBadge`, semantic color tokens, `FormStatus` | Raw dots, local labels, upload/save indicators | Standardize status meaning and contrast before appearance. |
| Tooltips | `@jovie/ui` Tooltip/SimpleTooltip plus current shell wrapper | Shell `Tooltip` and feature-local wrappers | Pick one wrapper per required capability, preserve collision and keyboard behavior. |

## Loading-state contract

Loading is a state of the same composition, never a separate visual language.

### Canonical atoms

- `SkeletonBlock`: neutral reserved geometry for a known rectangular slot.
- `SkeletonText`: one or more lines using the final text measure and line height.
- `SkeletonAvatar`: circular or rounded identity-media geometry.
- `SkeletonMedia`: known aspect-ratio media geometry.
- `ProgressIndicator`: compact, accessible, indeterminate progress for the
  initiating control or a truly action-local status row.

Tokens own neutral surface/contrast, radius, restrained motion, and the
reduced-motion static fallback. Skeleton atoms remain `aria-hidden`; the parent
state boundary owns `aria-busy` and the accessible label.

### Semantic surface API

The canonical molecule is `SurfaceState`. `LoadingBoundary` is the Suspense/data
adapter name and must render `SurfaceState`, not a second visual component.

```ts
type SurfaceStateValue =
  | 'loading'
  | 'loaded'
  | 'empty'
  | 'error'
  | 'refreshing';

type SurfaceLoadingMode =
  | 'initial-page'
  | 'section'
  | 'background-refresh';

interface SurfaceStateProps {
  readonly state: SurfaceStateValue;
  readonly loadingMode: SurfaceLoadingMode;
  readonly label: string;
  readonly children: React.ReactNode;
  readonly loading: React.ReactNode;
  readonly empty: React.ReactNode;
  readonly error: React.ReactNode;
  readonly status?: React.ReactNode;
  readonly minHeightClassName?: string;
}
```

Contract:

- The frame is always mounted and exposes stable `data-surface-state`,
  `data-loading-mode`, content, state, and status slots.
- Initial page and section loading use a geometry-matched skeleton supplied by
  the consumer because only the consumer knows its final grid.
- Background refresh always retains loaded or stale children. It places a
  quiet status in the reserved status slot and never replaces the surface with
  a skeleton.
- Empty and error render inside the same frame and preserve the same toolbar,
  rail, table/list container, and primary-action slot.
- Submit/pending work belongs to the initiating control. It must not create a
  page spinner, modal, or replacement screen.
- Full-page loading is allowed only before the route's known frame can render.
- Focus remains in the initiating control or stable frame. State swaps must not
  remount unrelated controls.

### Existing loading inventory

The scoped static scan found:

- 10 production files with raw `animate-pulse`.
- 25 production files with raw `animate-spin`.
- 30 production files referencing `LoadingSpinner`, `Spinner`, or `Loader2`.
- 11 route/feature files implementing a launch loading state directly.

These are audit candidates, not a deletion count. `Spinner` remains the compatibility implementation behind `ProgressIndicator`.

| Surface / implementation | Canonical mode | Final geometry known? | Migration |
| --- | --- | --- | --- |
| `AppShellSkeleton` shell/header/sidebar | Initial page | Shell slots yes; default main no | Convert raw skeleton divs to atoms, then require route main slot for launch routes |
| `/app` Inbox shell fallback | Initial page | No | Add Inbox-shaped main skeleton after active owners hand off |
| New Chat `chat/loading.tsx` | Initial page | Yes | Wrap in `SurfaceState`; keep route-shaped composer geometry |
| Active chat `[id]/loading.tsx` | Initial page / section | Yes | Wrap transcript and dock without changing chat behavior |
| All Chats local `ChatListSkeleton` | Section | Partly | Replace raw blocks with atoms, then align shell fallback to the list frame |
| Profiles `DashboardSegmentSkeleton(profile)` | Initial page | Yes on navigation; no on first shell mount | Reuse the route-shaped main skeleton in the outer shell fallback |
| Library `LibraryLoadingState` | Initial page / section | Yes | Reference implementation; replace raw filter-pill skeleton spans with atoms |
| `/start/loading.tsx` | Initial page | Documented yes | Owner-held; later wrap without changing geometry |
| Onboarding standalone loading | Initial page | No, separate copy-heavy language | Owner-held; derive skeleton from final stage frame |
| Waitlist action-local search/intake | Section / submit | Varies | Preserve content; move only valid local work to `ProgressIndicator` |
| Identity menu billing/user load | Section / refresh | Partly | Keep menu geometry, replace raw pulse blocks after Storybook proof |

## Migration slices

Each slice gets its own focused branch/PR and exact overlap recheck.

1. **Loading foundation**
   - Canonical skeleton atoms and `ProgressIndicator`.
   - `SurfaceState` molecule with loading/loaded/empty/error/refresh stories.
   - Focus/state and stable-frame unit tests.
   - No route consumers.
2. **Shell fallback routing**
   - Make Inbox, All Chats, Profiles, and Library request their own known main
     skeleton inside `AppShellSkeleton`.
   - Add bounding-box assertions for sidebar, header, main frame, and action
     slots.
   - Wait for PR #14820 and chat ownership handoff.
3. **All Chats workspace**
   - Adopt `PageToolbar`, canonical list skeleton atoms, and shared empty state.
   - Remove redundant search-explanation copy.
4. **Profiles workspace**
   - Reuse canonical toolbar tabs/status indicators and prove rail/table
     geometry across state transitions.
5. **Library workspace**
   - Rebase after PR #14636, then migrate the local filter pill/focus recipes
     and raw skeleton spans without changing Library behavior.
6. **Shared shell controls**
   - Sidebar/header/search/identity menu/overlay equivalence pass.
   - Preserve compact chrome and 44px mobile hit targets through safe,
     non-overlapping hit areas.
7. **Chat and onboarding consumers**
   - Start only after the active owners hand off.
   - Migrate action-local pending states and surface boundaries without
     changing reliability or onboarding behavior.
8. **Public homepage and `/start` visual review**
   - Audit the owner-selected final composition, not an intermediate design.
   - No loading skeleton on static content whose final frame is already
     immediately renderable.
9. **Forward-only enforcement**
   - Graduate only after the Storybook/visual baseline is healthy and the
     affected primitive stories are deterministic.

## Forward-only gate

The gate must be introduced by, or coordinated with, the existing Storybook and
visual-gate owners. This program must not create a parallel CI lane.

Graduation rule:

1. Establish a passing baseline on exact current main.
2. Keep pre-existing raw loading implementations in a committed baseline
   allowlist keyed by file and reason.
3. On changed launch/UI files only, fail when new raw `animate-pulse`,
   `animate-spin`, direct `Loader2`, or unapproved loading-screen implementation
   appears outside canonical primitive files.
4. Fail applicable UI changes when Storybook cannot index/build the changed
   canonical stories. A missing or misconfigured harness is a failure, not a
   skip.
5. Keep existing PRs and production builds outside the new requirement until
   the baseline commit lands. The gate is forward-only and shrink-only.
6. Removing an allowlisted exception lowers the baseline. Adding one requires
   an explicit reason and owner in this document or the generated exception
   registry.

## Per-slice evidence contract

Every implementation slice reports:

- Exact base SHA, head SHA, branch, PR, draft/ready state, merge target, and
  current checks.
- Desktop and mobile screenshots for every changed visual state.
- Fresh browser console errors after each capture.
- Storybook story IDs and visual/a11y results.
- Focus-visible, reduced-motion, contrast, and 44px mobile-target evidence.
- Bounding-box or CLS comparison across loading, loaded, empty, error, and
  refresh states when those states change.
- Focused tests, `@jovie/ui` and web typechecks as affected, and Biome on the
  touched files.
- Explicit overlap recheck against open PR files before each edit.

## Exception registry

An exception is valid only when a shared primitive cannot preserve semantics,
behavior, or geometry.

| Exception | Reason | Owner | Re-evaluate when |
| --- | --- | --- | --- |
| Feature-specific chat tool/result cards | The card is the interaction and carries tool-specific confirmation/error semantics | Chat owner | Two tool cards share the same state machine and layout |
| Route-shaped skeleton composition | Only the route knows its final grid, rows, rails, and control slots | Route owner using canonical skeleton atoms | A shared organism owns the final loaded layout |
| Specialized popup type | Dialog, menu, popover, tooltip, and context menu have different focus and dismissal semantics | Shared UI owner | Never merge on appearance alone |

No exception permits bespoke focus rings, raw loading animation, clipped focus,
layout-shifting state swaps, redundant card depth, or inaccessible icon actions.
