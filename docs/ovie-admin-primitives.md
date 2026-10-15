# Ovie admin primitive convergence

Source inventory for JOV-8098, 2026-10-15. Ovie's generated route adapters import
these web screens; there is no second UI implementation in `apps/ovie`.

This PR is the canonical primitive and People migration slice. Remaining report
and mixed-workspace migrations are required work in **JOV-8393**. This inventory
is source evidence, not certification of authenticated routes or production.

## Composition contract

- `AdminPage` composes `AppShellContentPanel`. Choose `layout='workspace'` for a
  primary task surface: every ancestor keeps `min-h-0`, tabs stay above the task,
  and the task fills the remaining viewport. `layout='document'` remains the
  default for reports, dossiers, settings, and feeds.
- `AdminTableShell` owns fixed toolbar/footer chrome and a constrained task
  region. `AdminDataTable` owns overflow, sticky headers, and the virtualizer's
  scroll element. Card and kanban alternatives own their respective scrolling.
- `AdminDataTable` uses schema-sized columns in loading, empty, grouped, and
  populated states, including responsive/controlled hidden columns. Use TanStack
  `columnVisibility` for responsive columns so headers, skeletons and spanning
  rows share the same visible schema; CSS-only hiding cannot update spans. Its default
  row mode is compact (40px); people use dense (32px), media two-line (56px),
  notes description (72px), and flag controls controls (96px). Cells truncate by
  default; multiline content opts into wrapping within its row budget.
- `AdminDetailRail` composes `EntitySidebarShell` with the shared `SIDEBAR_WIDTH`,
  flat header/workspace/footer surfaces and shell-owned scrolling by default.
  Drawer sections use plain surfaces. `RightDrawer` retains mobile modal,
  keyboard, focus, and close behavior; `AppShellRightRail` owns desktop placement.

## Screen inventory

Paths are relative to `apps/web/app/app/(shell)/admin`. All screens retain the
shared authenticated shell. A group lists every route in that category.

| Routes | Shell / table / inspector ownership |
| --- | --- |
| `people` — contacts/customers, creators, users, waitlist, releases, assets, feedback | `AdminPage(workspace)` → `AdminTableShell` → `AdminDataTable`. Customer, creator, user and feedback inspectors use `AdminDetailRail`; release/asset details retain their shared entity inspectors. |
| `people?view=recovery` | `AdminPage(document)`; evidence dossier intentionally scrolls. |
| `certifications`, `outbound` | Existing table-mode `PageShell` → canonical admin table shell/data. `AdminDetailRail` replaces local rail widths/surfaces. |
| `presence` | `WorkspacePage`; `AdminDataTable` and `AdminDetailRail` replace direct shared primitive calls. |
| `activity`, `costs`, `features` | `AdminPage`; canonical data tables. Remaining document-to-workspace composition, Activity wrapper and loading parity: JOV-8393. |
| `growth`, `product` | `AdminPage` with mixed reports, campaigns/lead/agent-run tables, and source panels; tables use `AdminDataTable`. Primary table viewport composition: JOV-8393. |
| `inbox`, `needs-you`, `operations`, `shipping`, `system` | `AdminPage` reports/queues. Founder and shipping entity inspectors use `AdminDetailRail`. Specialized report grids: JOV-8393. |
| `investors`, `investors/links`, `investors/settings`, `investors/updates`, `interviews` | `AdminPage` documents; local investor adapter composes shared table atoms. Schema migration: JOV-8393. |
| `feature-registry`, `platform-connections`, `playlists`, `revenue-lift`, `screenshots`, `share-studio`, `visibility-audit`, `agent-runs/[id]`, `chat-playground` | `AdminPage` documents; canonical tables where applicable. Report grid migration and complete route validation: JOV-8393. |
| `lists`, `lists/[id]`, `lists/views/[viewId]` | Existing `WorkspacePage` list/feed and triage compositions; intentional child scrolling. |
| `chat`, `hud`, `wiki`, `wiki/[...slug]` | Existing chat, HUD, and wiki owners. Conversation/report/document semantics retain their existing scroll regions. |
| `integrations` | Shared settings layout and integration screen. |
| root, `algorithm-health`, `campaigns`, `creators`, `feedback`, `growth/yc-metrics`, `ingest`, `leads`, `ops`, `outreach`, `outreach/dm`, `outreach/email`, `outreach/review`, `releases`, `users`, `waitlist` | Redirects; no independent screen to migrate. |

The architecture contract test walks JSX in both admin source roots. Direct
`UnifiedTable`/entity-shell/drawer implementations are restricted to canonical
adapters. Seven native report-table exceptions remain explicitly enumerated in
sorted order; JOV-8393 owns their migration and removal from that list. Investor
atom composition is also tracked there. Exceptions do not certify those grids.

## Verification and visual states

`AdminWorkspace.stories.tsx` is the hostile-content reference: 200 records, long
names, missing values, avatars, responsive columns, loading/empty/grouped/data
states, virtual scrolling, and a flat inspector with collapsible sections.

Component Playwright measurements cover 1440×900, 1024×768, and 390×844, in light
and dark themes. Compare column widths, row/viewport bounds, avatar containment,
sticky headers, virtualized row changes, and inspector Escape behavior. These
checks do not substitute for authenticated route or deployed runtime evidence;
JOV-8393 owns the complete screen pass.

EVENT: use the existing shared shell, table row modes, entity media and drawer
owners. Admin adapters supply composition defaults rather than a parallel design
system. Ship now: stabilize these owners and People. Re-evaluate when the
JOV-8393 inventory pass is ready; then remove the remaining report exceptions.

Component evidence: [original desktop](screenshots/jov-8098/before-desktop.png),
[canonical desktop](screenshots/jov-8098/after-desktop.png), and
[canonical mobile inspector](screenshots/jov-8098/after-mobile.png).
The original fixture's table scroller measured 6435px tall in a 900px viewport;
the canonical desktop scroller measured 748px, with tabs and pagination visible.
The exact selected-owner coverage run passed 123 tests in 22 files, with 90.09%
line coverage over the selected shared owners. The original implementation failed
four assertions in the added workspace/page tests.

Component visual audit: PASS for hierarchy, spacing, typography scale, density,
interaction states, theme contrast, native drawer affordances and layout stability
in the fixture. Authenticated screen coverage remains JOV-8393 acceptance.
