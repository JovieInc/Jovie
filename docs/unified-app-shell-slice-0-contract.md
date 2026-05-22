# Unified App Shell Migration Slice 0 Contract

Issue: JOV-2219

## Purpose

Slice 0 defines what later implementation slices are allowed to move from the
experimental shell surfaces into production. It adds contracts and measurement
coverage only; it does not migrate production UI or route behavior. Each
implementation slice must cite this contract and land one approved slice at a
time.

## Hard Constraints

- No production import may reference `apps/web/app/exp/*`.
- `/start -> /app` means visual continuity only. Do not make `/start` depend on
  the authenticated app shell provider chain or app dashboard data.
- Move one approved slice at a time. Do not batch Foundation, Library,
  Releases, Tasks, Chat, Onboarding, and Lyrics in one product-code PR.
- Preserve existing route ownership, auth checks, entitlements, redirects, and
  data adapters unless a later Linear issue explicitly assigns that change.
- Demo/mock data from `apps/web/app/exp/*` is not a production data source.
- Runtime Design V1 flags continue to resolve through the existing app flag
  system. Do not create a new rollout gate in this migration.

## HOT ZONE Ownership

- Slice 0 owns contract docs, performance manifest coverage, and shell route
  harnesses only.
- Each implementation slice owns only the named route files, adapters, and tests
  in its approved plan.
- Cross-slice surfaces such as global shell state, onboarding auth, release data
  models, and chat transport require explicit Linear scope before editing.

## Route UX And Data Contracts

| Area | Production routes | UX contract | Data contract | Do not change in this migration |
| --- | --- | --- | --- | --- |
| Foundation | `/app`, `/app/chat`, `/app/chat/[id]`, `/app/dashboard/*`, `/app/settings/*`, `/app/library`, `/app/lyrics/[trackId]` | One authenticated app frame with stable sidebar, header, right-panel rail, audio/player chrome, route-aware skeletons, and no horizontal page overflow. `/app` keeps chat-first landing behavior. | `apps/web/app/app/(shell)/layout.tsx` owns auth, path resolution, flag snapshot, and skeleton selection. `DashboardShellContent` owns ban check, onboarding redirect, sidebar cookie, providers, and shell data choice. Lightweight routes must use `shouldUseEssentialShellData()`. | Do not bypass `(shell)/layout.tsx`. Do not add a second shell provider stack. Do not make visual flags change route data ownership. |
| Library | `/app/library` plus existing dashboard library aliases only if the approved slice names them | Read-only catalog of release assets with local search/filter/sort/view state, empty state, loading state, and links back to Releases. No upload or asset-generation workflow in this migration. | Server route checks auth/flag, calls `getDashboardShellData(userId)`, redirects onboarding users to `/start`, loads release matrix for the selected profile, then maps through `buildLibraryReleaseAssets()`. Client search/filter is local over the provided assets. | No library schema. No generated asset table. No per-card network fetch. No direct import from `/exp/library-v1`. |
| Releases | `/app/dashboard/releases`, `/app/dashboard/releases/[releaseId]/*` | Preserve the existing releases table/list behavior, provider status, import affordances, drawer/detail polish, and cold-load skeleton. Flagged visual changes must still render the legacy view when the flag is off. | Auth uses `getCachedAuth()`. Route uses `getDashboardShellData(userId)`, redirects onboarding users to `/start`, and prefetches `loadReleaseMatrix(profileId)` through TanStack Query. Client reads `useReleasesQuery(profileId)` and dashboard context. | Do not move releases onto demo release objects. Do not couple releases view selection to shell chrome beyond existing app flags. |
| Tasks | `/app/dashboard/tasks`, `/app/dashboard/releases/[releaseId]/tasks` | Task workspace keeps list/board/detail ergonomics, mobile task list behavior, upgrade interstitial, and release-task context. | Entitlements come from `getCurrentUserEntitlements()` / task access gates. Task mutations and list reads stay in existing server actions with profile scoping, deleted-row filtering, cursor/limit bounds, release access checks, and task type contracts. | No durable job/thread linkage, task schema edits, or agent runtime changes unless a separate issue assigns them. |
| Entity panels | Chat release/contact/tour-date panels and releases drawer entities | Entity details open in the existing right-panel rail or drawer without stealing route ownership. Closed panels must not hydrate full entity catalogs. | Chat entity panel targets are `release`, `contact`, and `tour-date`. Release/contact/event data is fetched lazily by the existing query hooks only when a target is active and a profile id exists. | Do not add global entity state outside the current panel context. Do not fetch all releases, contacts, and events just to render closed shell chrome. |
| Chat Threads | `/app/chat`, `/app/chat/[id]`, `/api/chat/conversations`, `/api/chat/conversations/[id]`, message routes | New thread and existing thread routes share the same app-frame composition, composer geometry, thread title badge, archive/delete affordances, and empty/error/loading states. Thread switching must not flash dashboard skeletons. | Page bodies have zero blocking server data. Conversation metadata for title is isolated from rendering. APIs are no-store, profile-scoped, paginated, and bounded: list limit defaults to 20 and caps at 50; message fetch defaults to 100 and caps at 200; max conversations per profile is 200. | Do not introduce duplicate chat persistence paths. Do not let shell visuals bypass chat auth/profile checks or AI egress safeguards. |
| Onboarding | `/start`, `/onboarding` compatibility redirect | `/start` is the canonical chat onboarding entry. It should visually feel continuous with `/app` while remaining a dynamic onboarding surface. `/onboarding` keeps redirect compatibility and preserves query params. | `/start` renders `OnboardingShell`; `/api/chat` owns onboarding chat streaming and signed onboarding session cookie creation. Profile completion stays in onboarding actions. | Do not import the authenticated app shell into `/start`. Do not require dashboard data before the user has a profile. Do not replace Clerk/auth state transitions. |
| Lyrics | `/app/lyrics/[trackId]` | Track-scoped read-only lyrics surface with empty state when DB lyrics are unavailable, no demo lyrics, and audio/player continuity through the existing player hook. | Route checks auth/flag, loads shell data, redirects onboarding users, scopes the track to selected profile, resolves lyrics in this order: `discogRecordings.lyrics`, `discogTracks.lyrics`, `discogReleases.metadata.lyrics`. Plain text maps to untimed lines. | No timed-lyrics schema, no demo lyric fallback, no cross-profile lookup, no release data refactor without a separate issue. |

## Data Ownership And Request Budgets

| Area | Data owner | Direct load budget | Interaction budget | Fail/empty behavior |
| --- | --- | --- | --- | --- |
| Foundation shell | `(shell)/layout.tsx`, `DashboardShellContent`, `shell-route-matches.ts` | Auth plus one app flag snapshot plus one dashboard shell/full dashboard fetch decision | Sidebar cookie read once server-side; right panel hydrates only when open | Auth redirects, ban renders unavailable page, dashboard load error renders route error state |
| Library | Library route and `library-data.ts` mapper | Shell data plus one release matrix read for selected profile | Search/filter/sort are client-local; provider links use existing URLs | Empty catalog renders library empty state; dashboard load error renders page error |
| Releases | Releases route/actions and releases query hooks | Shell data plus one release matrix prefetch when profile exists | Client query cache handles warm navigation; skeleton only when no cached data exists | Prefetch failure is captured and page can still render client query/error state |
| Tasks | Task server actions and task workspace components | Entitlement read plus task list/board calls bounded by server action limits | Mutations revalidate owned task routes only | Upgrade interstitial for missing entitlement; access errors fail closed |
| Entity panels | Chat entity panel context plus release/contact/event query hooks | Zero work while closed | One active target query at a time per panel kind | Missing entity renders unavailable copy in the panel |
| Chat Threads | Chat page clients and chat conversation APIs | Shell data only for page frame; active conversation API call after client hydration | Conversation list, active messages, and mutations use bounded APIs with no-store headers | Missing profile/conversation returns 404 JSON; route UI shows existing fallback/error states |
| Onboarding | `OnboardingShell`, `/api/chat`, onboarding actions | `/start` page render plus chat route work after user input | Session cookie is minted by route handler/server action, not page render | `/onboarding` redirects to `/start`; incomplete profile flows remain in onboarding runtime |
| Lyrics | Lyrics route and lyrics helpers | Shell data plus one profile-scoped track resolution | Audio state reads existing player hook; seeking stays client-side | Unknown track/profile returns not found; empty lyrics render production empty state |

## `/exp/*` Inventory Format

Every implementation slice that uses an experimental file must include an
inventory table in its PR description or linked plan using this format. Decision
values are Keep, Adapt, and Delete; production must never import from
`apps/web/app/exp/*`.

### Starter Inventory For `/exp/shell-v1`

| Source item | Default decision | Notes |
| --- | --- | --- |
| Shell frame, sidebar, header, right rail, audio chrome | Adapt | Use production `AuthShellWrapper`, dashboard providers, route skeletons, tokens, and shortcuts. |
| `CanvasView` demos for releases, tracks, tasks, library, lyrics, settings, thread, onboarding | Adapt by named slice only | Treat each canvas as reference material, not a shared production router. |
| Demo `RELEASES`, `TRACKS`, `TASKS`, `THREADS`, entity arrays, mock lyrics | Delete | Replace with existing production data contracts listed above. |
| Components already under `@/components/shell/*` | Keep or Adapt | Production imports from shared components are allowed when they already live outside `app/exp/*`. |
| Direct import of `@/app/exp/library-v1/page` from shell-v1 | Delete | Production must not import experimental route files. |
| Keyboard shortcut ideas | Adapt | Register through the existing shortcut registry and make affordances discoverable. |
| Carbon/theme constants and local CSS variables | Adapt | Use existing app-shell/design tokens; do not create a parallel theme. |
| Onboarding canvas | Adapt in Onboarding slice only | Visual continuity with `/app`; no authenticated app shell dependency. |

### Starter Inventory For `/exp/library-v1`

| Source item | Default decision | Notes |
| --- | --- | --- |
| Grid/table view toggle, local search, left rail filters, sort dropdown, status bar | Adapt | Bind to `LibraryReleaseAsset` or another approved production adapter. |
| Detail drawer and destination-aware actions | Adapt | Only if backed by existing release/provider URLs and approved route ownership. |
| `Asset`, `Variant`, generated asset object model | Delete for Slice 0/initial library | No schema or generated asset runtime in this migration. |
| `generateAssets()`, poster pools, fixed demo timestamp, demo release seeds | Delete | Demo fixtures are not production data. |
| `ShellDropdown` visual behavior | Keep or Adapt | Use the shared component directly from `@/components/shell`, not the experimental route. |
| Upload/generate/new asset affordances | Delete unless separately assigned | No upload/assets schema in this migration. |

## Screenshot And Pixel Target Matrix

Use the existing responsive system widths as the source of truth. Minimum Slice
0 target set is below; later slices can add more states, but they must not drop
these without approval.

| Target | Routes/states | Viewports | Required assertions |
| --- | --- | --- | --- |
| Foundation shell | `/app`, `/app/chat`, `/app/chat/[fixtureThreadId]`; sidebar expanded/collapsed; right panel closed/open where applicable | 1440x900, 1280x800, 820x1180, 390x844, 320x568 | No blank frame, no horizontal overflow, route-aware skeleton matches final frame, header/sidebar/audio chrome stay aligned |
| Library | `/app/library`; populated, empty, search no-results | 1440x900, 820x1180, 390x844, 320x568 | Cards/table do not resize the shell, text truncates cleanly, local search does not shift layout, empty state is centered |
| Releases | `/app/dashboard/releases`; cold skeleton, populated matrix, drawer/detail open | 1440x900, 820x1180, 390x844 | Flag-off parity remains valid; flag-on visual changes do not change release data or provider status |
| Tasks | `/app/dashboard/tasks`; list/board/detail, mobile row selection, upgrade state | 1440x900, 820x1180, 390x844, 320x568 | Task panes scroll inside owned containers, mobile list has no clipped actions, entitlement state is explicit |
| Entity panels | Chat release/contact/tour-date panel open; releases drawer entity states | 1440x900, 820x1180, 390x844 | Panel mounts only for active targets, close affordance is visible, fallback copy renders for missing entities |
| Chat threads | New chat, existing thread, composer typing, archive/delete menu, thread title badge | 1440x900, 820x1180, 390x844, 320x568 | Composer padding, message width, and thread controls remain stable across thread switches |
| Onboarding | `/start` initial, artist picker, error picker, narrow empty picker; `/onboarding` redirect | 1440x900, 820x1180, 390x844, 320x568 | `/start` visually aligns with app shell language without importing app shell providers; query params survive redirect |
| Lyrics | `/app/lyrics/[trackId]`; lyrics present, empty lyrics, active audio track | 1440x900, 820x1180, 390x844, 320x568 | No demo fallback, lyric rows remain readable, player controls do not overlap content |

Pixel target policy:

- For parity slices, compare against the current production route at the same
  viewport and flag state. Unexpected full-page pixel movement over 0.20% needs
  written approval in the PR.
- For intentional visual migration slices, attach before/after screenshots and
  call out expected differences by route/state.
- A black, blank, clipped, horizontally overflowing, or dev-toolbar-covered
  screenshot is always a failure, even if the diff threshold passes.
- Product screenshot or visual regression checks should be evidence for the
  slice; do not make brittle text/pixel assertions the only deploy gate.

## Slice Exit Checklist For Implementers

- Cite this doc and the approved slice issue.
- Fill the `/exp/*` inventory table for every experimental item referenced.
- Confirm no production import references `apps/web/app/exp/*`.
- Confirm route data ownership and request budgets above still hold.
- Attach the screenshot matrix evidence for the touched route group.
- Run the narrowest relevant checks for the touched files and paste the exact
  passing or failing output in the PR.
- If a desired change falls outside the approved slice, create or update a
  Linear issue before mentioning it as planned scope.
