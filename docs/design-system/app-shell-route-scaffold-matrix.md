# App Shell Route-to-Scaffold Matrix

System of record for which scaffold each authenticated route renders through.
Source ticket: JOV-4867 (P1 UI drift — `docs/audits/JOVIE_UI_DRIFT_AUDIT_2026-08-03.md`).

## Layer contract

| Layer | Component | Role |
| --- | --- | --- |
| Frame | `apps/web/components/organisms/AppShellFrame.tsx` | Auth primitive. Owns sidebar mount, main plane, right rail, audio tray, mobile bottom surface. Mounted once by `AuthShell` for the whole `app/app/(shell)` group. |
| Content | `apps/web/components/organisms/AppShellContentPanel.tsx` | **The single authenticated content contract.** Owns max-width, frame (`content-container` default), content padding (`default`), surface mode, and scroll ownership (`panel` default). |
| Adapter | `apps/web/components/organisms/PageShell.tsx` | Compatibility adapter only. Forwards every prop to `AppShellContentPanel` with **no divergent defaults** (JOV-4867). Prefer `AppShellContentPanel` in new code. |

Before JOV-4867, `PageShell` silently overrode the contract with
`frame='none'` / `contentPadding='none'` defaults, so two routes that looked
identical in source rendered different geometry depending on which name they
imported. Defaults now live in exactly one place: `AppShellContentPanel`.
Callers that need the unframed/unpadded look pass those props explicitly.

## Route → scaffold matrix (primary authenticated routes)

Routes mount inside `AppShellFrame` via `app/app/(shell)/layout.tsx` → `AuthShell`. The content column then renders one of:

| Route | Content scaffold | `frame` | `contentPadding` | `scroll` | Notes |
| --- | --- | --- | --- | --- | --- |
| `/app/dashboard` (chat) | `ChatWorkspaceSurface` → PageShell | `none` | `none` | `panel` | Full-bleed chat plane; ambient gradient owned by frame. |
| `/app/chats` (`/app/threads`) | `ThreadsPageClient` → PageShell | `content-container` | `none` | `panel` | |
| `/app/library` | `LibrarySurface` → PageShell | `content-container` | `none` | `panel` | `surfaceMode='table'`. |
| `/app/calendar` | `CalendarPageClient` → PageShell | `none` | `none` | `panel` | Toolbar slot for month nav. |
| `/app/tasks` | `TasksPageClient` → PageShell | `none` | `none` | `panel` | Absolute-inset workspace. |
| `/app/insights` | `InsightsPanel` → PageShell | `none` | `none` | `panel` | |
| `/app/presence` | `DspPresenceView` → PageShell | `none` | `none` | `panel` | |
| `/app/audience` | `DashboardAudienceTableUnified` → PageShell | `none` | `none` | `panel` | `surfaceMode='table'`. |
| `/app/releases` | `ReleaseProviderMatrix` → PageShell | `none` | `none` | `panel` | |
| `/app/releases/[id]/tasks` | `ReleaseTaskPage` → PageShell | `content-container` | `none` | `panel` | |
| `/app/tour-dates` | `TourDatesPageClient` → PageShell | `none` | `none` | `panel` | `surfaceMode='table'`. |
| `/app/profiles` | `ProfilesWorkspace` → PageShell | `none` | `none` | `panel` | `surfaceMode='table'` when populated. |
| `/app/earnings` | `DashboardPay` → PageShell | `none` | `compact` | `panel` | `maxWidth='wide'`. |
| `/app/dashboard/release-plan` | route page → PageShell | `none` | `default` | `panel` | |
| `/app/settings/*` | `settings/layout.tsx` → PageShell | `none` | `none` | `page` | Page-level scroll owner; `maxWidth='wide'`. |
| `/app/admin/*` | `AdminPage` → PageShell | `none` | `none` | `panel` | |
| `/app/admin/ingest` | `AdminIngestPageClient` → PageShell | `none` | `none` | `panel` | |
| demo surfaces | `DemoShowcaseSurface` et al. → AppShellContentPanel | per call | per call | per call | Demo surfaces use the canonical panel directly. |

## Geometry invariants (test-pinned)

Pinned by `apps/web/tests/unit/shell/page-shell-content-contract.test.tsx`
and `apps/web/tests/unit/components/organisms/AppShellContentPanel.test.tsx`:

- **Layout:** unbroken `min-h-0` / `flex-1` chain from the panel `<section>` to
  the content leaf; toolbar slot is `shrink-0` so it never shifts the column.
- **Scroll:** default `scroll='panel'` keeps the section at `overflow-hidden`
  (routes scroll inside the shell clip so the right rail stays fixed);
  `scroll='page'` (settings) moves `overflow-y-auto` onto the section.
- **Focus:** the shell section takes no `tabindex`; toolbar controls precede
  content in DOM order so tab order matches visual order.
- **Adapter parity:** `PageShell` renders byte-identical markup to
  `AppShellContentPanel` for the same props, with or without explicit
  `frame`/`contentPadding`.
