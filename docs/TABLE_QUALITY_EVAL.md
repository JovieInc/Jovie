# Table / Data-Grid Quality Eval — v1.0

**Status:** Canonical eval for all table/data-grid surfaces in `apps/web`.
**Owner lane:** GLM 5.3 Flash implements against this eval; loops until PASS.
**Date:** 2026-09-03 · **Author:** table-surface audit (dispatch: audit-only, GLM 5.3).
**Scope:** `components/organisms/table` (canonical system), `features/admin/table` (admin shell layer), every call site listed in the Inventory, plus shared CSS in `styles/system-b-app.css`.

A table surface **PASSES** when every Hard Gate is green, every budget is met, and the human checklist has no unchecked "must" items. Anything else is **FAIL** — a pretty FAIL is still a FAIL.

---

## 1. Inventory (authoritative as of main @ audit date)

### 1.1 Canonical system — `apps/web/components/organisms/table/` (~9.2K lines)

| Layer | Key members | Role |
| --- | --- | --- |
| Organisms | `UnifiedTable.tsx`, `UnifiedTableHeader.tsx`, `UnifiedTableSkeleton.tsx`, `VirtualizedTableBody.tsx`, `VirtualizedTableRow.tsx` | TanStack Table + TanStack Virtual wrapper; the ONE table organism |
| Molecules | `TableHeaderCell`, `TableHeaderRow`, `GroupedTableBody`, `LoadingTableBody`, `SemanticTable`, `TableContextMenu`, `HeaderBulkActions`, `PageToolbar`, `TableBulkActionsToolbar`, `TableSearchBar`, `DisplayMenuDropdown`, `ActionBar`, `ExportCSVButton`, `SocialLinksCell` | composable table parts |
| Atoms | `TableCell`, `TableBadge`, `TableEmptyState`, `TableCheckboxCell`, `TableIconButton`, `TableCountBadge`, `GroupHeader`, `SkeletonRow/Cell`, `ShellListRowFrame/Button`, `AvatarCell`, `DateCell`, `ActionsCell`, Audience* cells | primitives |
| Hooks | `useTableVirtualization`, `useTableKeyboardNav`, `useTableGrouping`, `useTableState`, `useRowSelection`, `useRowKeyboard`, `useAmbientListSelection`, `useStableSelectionRefs` | behavior |
| Utils | `tableKeyMap` (single source of key bindings), `createMultiFieldFilterFn`, `createSelectionColumnFactory`, `useViewMode` | support |
| Styles | `table.styles.ts` presets + `system-b-table-*` CSS in `styles/system-b-app.css` | tokens only |
| Legacy | `SortableHeaderButton.tsx` (aria-sort-less), `atoms/TableHeaderCell.tsx` (imports legacy button) | see GAP-09 |

### 1.2 Admin layer — `components/features/admin/table/` (deprecated re-export hub + admin-specific)

- LIVE: `AdminDataTable` (thin `UnifiedTable` preset: rowHeight 40, virtualization on), `AdminTableShell` (scroll container + sticky toolbar + `stickyTopPx`), `AdminTablePagination`, `useAdminTableKeyboardNavigation`, `useCSVExport`, `molecules/TableRow`, `atoms/TableCheckboxCell`, `organisms/KanbanBoard`, `TableRowActions`, `table.animations.ts`.
- DEAD CODE: `AdminCreatorsTableHeader{,Actions}` (zero live consumers), full MIGRATION_GUIDE.md describing the already-completed dedup.

### 1.3 Canonical-system call sites (UnifiedTable / AdminDataTable)

Admin: `ActivityTableUnified`, `AdminUsersTableUnified`, `AdminReleasesTableUnified`, `AdminFeedbackTable`, `LeadTable`, `AdminCreatorProfilesUnified`, `AdminWaitlistTableUnified` (+WithViews), `investors/page.tsx` (skeleton), `admin/activity/loading.tsx`.
Product/dashboard: `ContactsTable` (settings/contacts + /app/contacts), `DashboardAudienceTableUnified` (contacts?tab=audience), `TaskDataTable` (tasks), `TourDatesTable` (tour-dates), `ReleaseTable`/`ReleaseTableWithTracks`/`ReleaseProviderMatrix` (releases), `LibrarySurface` table (library), `ProfilesWorkspace` (profiles), `EarningsTab` tippers (earnings), `DspPresenceTable` (presence), `PromoDownloadsTable` (release downloads), `AgentOsRunsPanel`, `InviteCampaignManager`, `EmailQueuePanel`, `ReviewQueuePanel`, `ReleaseTablePendingShell`, `AudienceTableLoadingShell`.

### 1.4 Non-canonical table surfaces (div-lists & hand-rolled `<table>`)

- `ShellReleasesView` (releases shell, `role='listbox'` div-list + `ShellListRowFrame`, NOT virtualized).
- Hand-rolled `<table>`: `AdminScoreboardSection` (sr-only data table — good pattern), `FeatureFlagAuditSection`, `RevenueLiftDashboardView` (3 tables), `InvestorTablePrimitives` family (investors + investor-links), `CostsTable`, `AdminFeaturesTable`, `ContentTable`, `PricingComparisonChart` (marketing, has captions).
- Dead legacy family: `features/dashboard/audience/table/**` (0 live importers).

---

## 2. Issue list — ranked by user impact

Ranking axis: how often a real user hits it × how badly it hurts (broken > slow > ugly > maintenance). P0 = ships in the first Flash slice.

| # | Sev | Surface | Issue |
| --- | --- | --- | --- |
| GAP-01 | P0 | `ReleaseTable` desktop, `hideHeader={true}` | Sort state is invisible: the releases table hides its header (`hideHeader`) but columns are still TanStack-sortable via context menu/keyboard, so sorted order changes with zero visual indication. No sort badge, no aria-sort surface, no "Sorted by X" announcement. Linear always shows sort provenance. |
| GAP-02 | P0 | `TourDatesManager` + `TourDatesTable` | Loading never shows: the table is never passed `isLoading`, and its `emptyState` prop is unreachable (parent gates `length > 0 ? table : custom empty div`). A slow sync renders a stale/blank list with no skeleton. Also duplicated empty-state designs (table's prop vs parent div). |
| GAP-03 | P0 | `ShellReleasesView` (releases shell) | Unvirtualized full render: `visibleReleases.map` renders every release row (up to the 200-release data cap) with no windowing, inside `overflow-y-auto`. On large catalogs this is the single heaviest list paint in the product. |
| GAP-04 | P1 | `ContactsTable`, `TourDatesTable`, `EarningsTab`, `PromoDownloadsTable`, `DspPresenceTable`, `ProfilesWorkspace` | No mobile strategy: no `isMobile` branch, no card list. minWidth 960/720px tables on a 390px viewport = horizontal scroll with the page seam, and pinch-zoom-scale reading. Audience + releases + admin users HAVE mobile card fallbacks — these six don't. |
| GAP-05 | P1 | `TableHeaderCell` (molecule) | Sort button a11y gap: `aria-sort` lives on the `<th>`, but the `<button>` has no accessible name describing the action ("Sort by Fan") and the direction glyph is `aria-hidden` with no text alternative; keyboard/SR users get "button" with no context. Sort toggle also cycles asc→desc per column but there's no way to clear sort (3-state) — Linear parity includes unsort. |
| GAP-06 | P1 | `TableHeaderCell` width heuristics | Magic numbers: `header.getSize() >= 9999 || header.getSize() === 150` hardcodes TanStack's default size sentinel (150) in the view layer; `size: 9999` used as "fill" sentinel in `table-config.tsx`. Brittle against TanStack v9 (open dependabot bump #16994 bumps react-table 8→9). |
| GAP-07 | P1 | `UnifiedTable` virtualized body | `aria-rowcount`/`aria-setsize`/`aria-posinset` are absent on the virtualized `<tbody>`: with only ~viewport rows in the DOM, screen readers cannot know the table has 200 rows. `role='rowgroup'` semantics ride on native tags (fine) but virtualized tables should announce total size. |
| GAP-08 | P1 | `GroupedTableBody` + grouped releases | Sticky stacking bug: group headers stick at `top-0` with `z-25` ABOVE the column header's `z-20` — when a group header scrolls under a sticky column header (groupByYear mode), the group header (later DOM, higher z) paints over the column header. Also group headers can't clear sort or coexist with `hideHeader`. |
| GAP-09 | P1 | Repo-wide | Dead/duplicate table code: `features/dashboard/audience/table/**` (entire legacy family, 0 importers), `AdminCreatorsTableHeader{,Actions}` (0 importers), `atoms/TableHeaderCell.tsx` + `SortableHeaderButton` (superseded by molecules version but still exported + referenced by a design-contract test). Each duplicate row is drift surface. |
| GAP-10 | P2 | `DspPresenceTable` | Off-token styling: hand-rolled `hover:bg-[color-mix(...)]`, arbitrary `ring-offset`, `minWidth='720px'`, `className='text-xs text-primary-token'` bypassing `table.styles` presets; duplicated hover/focus treatment vs `system-b-table-row-*`. |
| GAP-11 | P2 | `TourDatesTable` | Off-token row hover: `hover:bg-white/[0.02]` arbitrary value (should be `rowState.hover` / `--color-row-hover`); also `opacity-60` for past dates has no accessible "past" announcement. |
| GAP-12 | P2 | `AdminTableShell` | `stickyTopPx` is computed (ResizeObserver + state) and exposed via render props, but zero live consumers pass it to the table header; `molecules/TableHeaderRow.stickyOffset` exists for exactly this and is only used by the hand-rolled investors family. Either wire it or delete the plumbing (drift between intent and reality). |
| GAP-13 | P2 | `EarningsTab`, `PromoDownloadsTable`, page-flow tables | Sticky headers don't work in page-flow: tables whose scroll container is the page (not an inner `h-full` container) get `sticky top-0` pinned to the viewport — under the app header — or not sticky at all in flow layout. Linear tables always keep the header visible while data scrolls. |
| GAP-14 | P2 | `FeatureFlagAuditSection`, `RevenueLiftDashboardView` | Hand-rolled admin tables: no `caption`, no `scope='col'`/`scope='row'`, no sticky headers, no sort affordance, arbitrary `bg-surface-0` header styles; `RevenueLiftDashboardView` renders three near-identical tables that should be one canonical `AdminDataTable` with column visibility. |
| GAP-15 | P2 | `VirtualizedTableBody` sentinel | Infinite-scroll sentinel is a `<tr>` appended in a SECOND `<tbody>` after the virtualized body's `<tbody>` — multiple tbody elements with absolute-positioned rows can desync IntersectionObserver root sizing; sentinel also lacks `aria-busy` region semantics. |
| GAP-16 | P3 | `useTableKeyboardNav` | No horizontal cell navigation (ArrowLeft/Right) — Linear supports cell-level focus within rows; row-level only here. Also `Home/End` move focus but don't scroll pre-emptively with `block:'nearest'` when the row isn't rendered yet (virtualized offscreen rows: focus() on a detached ref is a no-op — see GAP-17). |
| GAP-17 | P3 | `useTableKeyboardNav` × virtualization | Focus vs virtualization desync: `rowRefsMap.get(nextIndex)?.focus()` — for an offscreen virtualized row the ref is undefined (row not mounted), so arrow keys silently stop at the window edge instead of scrolling to and focusing the next row. |
| GAP-18 | P3 | `UnifiedTable` empty state | `TABLE_EMPTY_STATE_MIN_HEIGHT_PX` reserves loading→empty height, but empty→populated still collapses; and `caption` for the empty table is generic "Empty table" — should describe the surface ("No contacts"). Minor. |
| GAP-19 | P3 | CSV export | `useCSVExport` runs on the client over loaded rows only; users exporting "all" from a paginated table get the current page. Linear exports the full filtered set. (Check per-surface; admin users/waitlist are infinite-loaded so export scope is fuzzy.) |
| GAP-20 | P3 | Density | Only one density (40px rows) is tokenized (`TABLE_ROW_HEIGHTS.COMPACT === STANDARD === 40`); Linear offers comfortable/compact. The constant existing with two identical values is itself drift. |

**Count: 20 gaps — P0: 3 (GAP-01, GAP-02, GAP-03) · P1: 6 (GAP-04..09) · P2: 6 (GAP-10..15) · P3: 5 (GAP-16..20).**

---

## 3. Machine-checkable gates (CI-enforceable)

Each gate names its enforcement point. Flash must make each gate PASS on main; gates are additive and shrink-only (once green, they become ratchets).

### G1 — Canonical import (structure)

- Every new table/data-grid surface imports `UnifiedTable`/`AdminDataTable` from `@/components/organisms/table` (or `@/features/admin/table` re-exports). Zero new hand-rolled `<table>` in `app/app/**` or `components/features/**` except: sr-only data tables (a11y mirror pattern), marketing/pricing (public site), and explicitly-reviewed div-lists (ShellReleasesView — pending GAP-03 decision).
- **Enforcement:** a `tests/unit/design-system/table-canonical-source.test.ts` allowlist scan (same pattern as `workspace-page-seam-contract.test.ts`) with a shrinking exception list seeded from §1.4.

### G2 — Dead table code removed (structure)

- `features/dashboard/audience/table/**` deleted (move the one `AudienceMode` type import to `dashboard-audience-table/types.ts`); `AdminCreatorsTableHeader{,Actions,.stories,.test}` deleted; `organisms/table/atoms/TableHeaderCell.tsx` + `SortableHeaderButton.tsx` either deleted (preferred) or their exports removed from `index.ts` with the seam-contract test updated in the same PR.
- **Enforcement:** grep-based unit test asserting the paths don't exist and `grep -r "SortableHeaderButton" apps/web/components` returns only the molecules header (or nothing).

### G3 — Token-only styling (design)

- Zero arbitrary color values in table surfaces: no `bg-white/[...]`, no `color-mix(...)` in TSX className strings, no raw hex. Row hover/focus/selected must come from `rowState.*`/`selection.*` (`system-b-table-row-*`). Cell typography from `typography.*`; padding from `alignment.*`.
- Column sizing must not use `9999` or compare against `150` in view code — add an explicit `size: 'fill'`-style constant or `meta.fill` flag consumed in one place.
- **Enforcement:** extend `tests/unit/design-system/arbitrary-values.baseline.json` logic with a table-surface-specific scanner (shrink-only baseline seeded at current count, target 0 for the files in §1.1–1.3).

### G4 — Sort a11y + visibility (a11y)

- Sortable header buttons expose an accessible name that includes the column label and current direction, and direction changes are announced (either via `aria-sort` on the th AND a visually-hidden live text in the button, or `aria-live` description). Acceptance: `getByRole('button', { name: /fan.*sort/i })` resolves for a sortable column; toggling sort flips the announced direction.
- Every sortable table shows visible sort provenance even when `hideHeader` is on (toolbar chip or row-group label) — releases table included.
- Sort cycle is 3-state (asc → desc → none) or documented per-surface why 2-state.
- **Enforcement:** unit tests on `molecules/TableHeaderCell` (role/name/direction) + a `hideHeader`-sort-visibility test in the releases surface.

### G5 — Virtualization (perf)

- Any table whose data source is unbounded or user-scale (audience, contacts, releases, library, admin users/waitlist/leads/feedback/creator-profiles/activity) must either virtualize (auto ≥20 rows is the current default — keep it) or prove bounded (≤ ~60 rows) with a code comment citing the bound.
- `ShellReleasesView` must window its rows (virtualizer or `content-visibility: auto` + contain) or migrate to `UnifiedTable` list mode.
- **Enforcement:** structure test — files in a virtualization-required list must pass `enableVirtualization` audit (no `enableVirtualization={false}` without an adjacent `// bounded: N` comment); a Playwright perf probe (optional, behind flag) asserting rendered row count ≤ viewport + overscan for a 200-row fixture.

### G6 — Keyboard nav through the virtual window (a11y/perf)

- Arrow/`j`/`k`/`Home`/`End` navigation must move focus beyond the mounted window: when the target row is unmounted, the table must scroll the virtualizer to the target index, then focus it (retry after `requestAnimationFrame` or subscribe to virtualizer mount). Acceptance: keyboard test with 500 rows: `End` focuses row 499 and it is scrolled into view.
- **Enforcement:** unit test in `UnifiedTable.keyboard.test.tsx` (or a new virtual-nav test) with a >viewport fixture.

### G7 — Loading/empty/error state trio (UX)

- Every canonical call site passes `isLoading` (or is inside a server Suspense shell — then say so in a comment), an `emptyState` with a next-step CTA, and its route/panel has an error fallback (`error.tsx` or boundary) that names the failing surface and offers retry.
- No unreachable/duplicated empty states (TourDates pattern): the parent must NOT gate `length > 0` around a table that already handles empty.
- **Enforcement:** call-site audit test (allowlist of files with their state mechanism: `suspense|isLoading|none` — `none` must be zero after the fix).

### G8 — Mobile (responsive)

- Every user-facing table surface has a ≤md strategy: mobile card list (audience/users/releases pattern), OR a horizontally scrollable table with sticky first column + visible scroll affordance, documented in the inventory. Tables must not overflow the page seam at 390px.
- **Enforcement:** Playwright 390px screenshot smoke per surface in the visual-a11y suite (scrollWidth ≤ viewportWidth + 1px for the page, not the inner scroller).

### G9 — Row-selection a11y (a11y)

- Checkbox cells keep `aria-label` with row context (current), the select-all header exposes checked/indeterminate state (verify current implementation retains it), and bulk-action toolbars announce selected count via an `aria-live` region (audience does; verify admin tables do).
- **Enforcement:** unit tests asserting `aria-checked` states + live-region text for one admin and one product surface.

### G10 — Sticky header correctness (visual)

- In scroll-container tables the `<thead>` must remain fully visible and opaque (no see-through text under it) while scrolling with a toolbar present; group headers must never paint over the column header (z-order: column header above group header, or group header offsets below it).
- `AdminTableShell.stickyTopPx` is either consumed (passed through to the header as `stickyOffset`) or removed with its stories/tests.
- **Enforcement:** Playwright scroll screenshot diff (header pinned at expected offset, no bleed) on one admin surface + one grouped surface; unit test for the offset prop plumbing.

---

## 4. Performance budgets (measured, not vibes)

Bench on a 4× CPU-throttled Chromium, 1440×900, dark prod build, 200-row fixture (the data-layer cap):

| Budget | Target |
| --- | --- |
| Initial render (mount → stable) of a 200-row virtualized table | ≤ 400 ms |
| Scroll interaction (long frame) while scrolling 200 rows | ≥ 50 fps sustained; no frame > 32 ms |
| Sort toggle on 200 rows (client) | ≤ 100 ms to painted |
| Row hover (first paint → hover style) | ≤ 16 ms (no layout thrash; geometry-only transitions) |
| Focus move (arrow key) between adjacent mounted rows | ≤ 32 ms |
| Focus move to an unmounted virtualized row (after G6) | ≤ 150 ms including scroll |
| DOM node count inside a 200-row virtualized table | ≤ (viewport rows + 2×overscan) × cells + chrome |
| Memory growth over 60 s of continuous scrolling | < 10 MB (no listener/ref leaks; rowRefsMap must not grow unbounded — verify delete on unmount) |

`rowRefsMap` note: rows keyed by `rowIndex`; on data shrink, refs for old indexes must be deleted (current `handleRef` null-branch does delete — keep a regression test).

---

## 5. Human checklist (reviewer: run once per surface after CI gates green)

**Semantics & SR**
- [ ] `getByRole('table')` resolves; caption (sr-only) describes THIS surface, not "Data table".
- [ ] Sortable headers: name + direction announced; 3-state cycle understood.
- [ ] Selected rows announce `aria-selected`; select-all shows indeterminate when partial.
- [ ] Virtualized body: total row count conveyed (aria-rowcount or live text).
- [ ] Empty state: heading + one-line why + one CTA. No dead ends.
- [ ] Loading state: skeleton preserves final geometry (no layout shift to empty/data).
- [ ] Error state: names the surface, offers retry, doesn't wipe the toolbar.

**Keyboard**
- [ ] Tab into table lands on first row (or first action); arrow/j/k navigate; Home/End jump; Enter opens, Escape closes overlays only.
- [ ] Navigation traverses the full dataset (virtualized window — GAP-17 fixed).
- [ ] Focus ring visible on every interactive element in dark chrome (2px token ring, never outline:none without replacement).
- [ ] Context menu opens on keyboard (Menu key / Shift+F10) and closes with Escape, returning focus to the row.

**Visual / tokens**
- [ ] Row height 40px; header 32px; densities align across surfaces.
- [ ] Hover/selected/focus row treatments identical across ALL tables (same inset ring + bg mix).
- [ ] Sticky header opaque; no text bleeding through backdrop blur; group header never over column header.
- [ ] No arbitrary colors anywhere in the row; numbers tabular-aligned; truncation with title attr on overflowing cells.
- [ ] 390px: no page-level horizontal overflow; mobile cards or documented scroll strategy.

**Interaction quality (Linear parity)**
- [ ] Sort indicated even with hidden headers.
- [ ] Selection persists across pagination/infinite loads; count visible.
- [ ] Bulk actions appear without layout shift (height reserved).
- [ ] Infinite scroll: loading more doesn't jump scroll position; sentinel announces.
- [ ] Right-click opens context menu on the row under cursor; menu items keyboard-navigable.

---

## 6. Recommended Flash implementation slices (smallest PRs, land order)

Each slice = one PR, ≤ ~800 lines, gated by the matching eval section. Slices are ordered by user impact and by dependency (G2 before G3/G4 to delete drift first).

1. **Slice 1 — Sort visibility + a11y (GAP-01, GAP-05; G4).** `molecules/TableHeaderCell`: accessible name w/ direction, 3-state cycle, live announcement; releases surface: sort chip when `hideHeader`. Tests: header a11y unit + releases visibility test.
2. **Slice 2 — Tour-dates state wiring (GAP-02; G7).** Pass `isLoading` through sync, delete the parent's duplicate empty div, make the table's `emptyState` the single source, route has error fallback. Tests: state-trio audit entry.
3. **Slice 3 — Dead code removal (GAP-09; G2).** Delete legacy audience/table family (relocate `AudienceMode` type), `AdminCreatorsTableHeader{,Actions}`, `SortableHeaderButton` + `atoms/TableHeaderCell` + seam-contract test update. Structure test locks it.
4. **Slice 4 — Keyboard-through-virtual-window (GAP-17, GAP-16; G6).** `useTableKeyboardNav`: virtualizer.scrollToIndex + ref retry; Home/End on 500-row fixture test.
5. **Slice 5 — Token hygiene (GAP-10, GAP-11, GAP-06; G3).** TourDates hover → `rowState.hover`; DspPresence → presets + `meta` sizing; extract `size: 'fill'` constant killing `9999`/`150` magic numbers; baseline ratchet to 0 for table files.
6. **Slice 6 — Releases shell virtualization (GAP-03; G5).** Window `ShellReleasesView` rows (virtualizer over the listbox or migrate to UnifiedTable list mode) + perf budget probe behind a flag.
7. **Slice 7 — Mobile parity wave 1 (GAP-04; G8).** Contacts + TourDates get the audience-style mobile card branch; 390px smoke screenshots.
8. **Slice 8 — Sticky plumbing decision (GAP-12, GAP-13, GAP-08; G10).** Consume-or-delete `stickyTopPx`; fix group/column header z-order; page-flow sticky audit for Earnings/PromoDownloads.
9. **Slice 9 — Hand-rolled admin consolidation (GAP-14; G1).** FeatureFlagAudit + RevenueLift (3→1 tables) onto `AdminDataTable` with column visibility; keep `AdminScoreboardSection`'s sr-only pattern.
10. **Slice 10 — Polish tail (GAP-07, GAP-15, GAP-18, GAP-19, GAP-20; G5/G7/G9).** aria-rowcount on virtualized bodies; sentinel aria-busy + single-tbody; per-surface captions; export scope decision; density constant cleanup.

**Constraint flag for all slices:** dependabot PR #16994 bumps `@tanstack/react-table` 8.21.3 → 9.2.3 (open, needs-human). Flash must write against the currently-installed v8 API; anything touching TanStack internals (GAP-06 sentinel constants especially) should prefer wrapper-level constants so the v9 migration is a one-file change.

**No new dependencies** (adopt > wrap > build): everything above uses the existing TanStack Table/Virtual stack and repo CSS tokens.

---

## 7. PASS definition (summary)

A surface PASSES when: G1–G10 relevant gates green in CI, its perf numbers are within §4 budgets on the 200-row fixture, and §5's must-items are checked for that surface. The fleet PASSES when the inventory in §1 contains no open P0/P1 gap and the ratchets (G2, G3) are locked at their floor.
