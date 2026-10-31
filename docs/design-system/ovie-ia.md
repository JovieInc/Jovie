# Ovie IA

One information architecture for every Ovie page, mirrored from Jovie's
shell ([product canon](../../canon/PRODUCT.md#jovie-and-ovie-mirror-one-shell-founder-decision-2026-10-20)).
The page-spec registry is
[`apps/web/data/appScreens/ovie-ia.ts`](../../apps/web/data/appScreens/ovie-ia.ts);
the screen inventory it covers is `APP_SCREEN_SOURCES` in the same folder.

## Page anatomy

1. **Title.** The shell breadcrumb (`DashboardHeader`) is the only title.
   Pages pass `title` to `AdminPage` and never render an `h1`.
2. **Sub-navigation.** One primitive family, owned by `AdminPage`:
   - `views=` for separate routes behind one sidebar row (Shipping:
     Pipeline, Product, Timeline; Fleet: Health, Agents). It renders the
     canonical `RouteSegmentControl` in the page toolbar, the same control
     Jovie's Audience uses. The view label equals the page title.
   - `tabs=` for views of the same data inside one destination (People,
     Platform Connections, Playlists, Agents). It renders
     `WorkspaceTabsSurface`.
   - Nothing else. A destination with its own sidebar row needs no
     sub-navigation; a view group with one view is deleted, not rendered.
3. **Sections.** `ContentSurfaceCard` + `ContentSectionHeader`
   (`density='compact'`) + a `p-3` body. One heading per section; the card
   is the only surface.
4. **Metrics.** `ContentMetricRow` for label/value rows,
   `ContentMetricStat` / `ContentMetricCard` for hero numbers, `HomeLoopPulse`
   tiles on Home. A value that is not freshly measured renders through
   `MeasuredValue` with its state (`stale` or `unknown`), its source and its
   age. A bare "n/a" or em dash is a dead end.
5. **Pipelines.** `StatusPipeline` for any ordered lifecycle or funnel. Each
   stage carries its evidenced state (`StatusGlyph`), its real reading and
   the evidence behind it. No arrow-joined pills.
6. **Empty states.** `EmptyState` (or `HomeLoopSection`'s reserved empty
   line on Home); loading and error states keep the populated geometry.

## Canonical primitives

| Need | Owner |
|---|---|
| Page frame and toolbar | `components/features/admin/layout/AdminPage.tsx` |
| Route views | `components/molecules/RouteSegmentControl.tsx` via `AdminRouteViews` |
| Query tabs | `components/organisms/WorkspaceTabsSurface.tsx` |
| Section header | `components/molecules/ContentSectionHeader.tsx` |
| Metric row / stat / card | `ContentMetricRow`, `ContentMetricStat`, `ContentMetricCard` |
| Unknown or stale value | `components/molecules/MeasuredValue.tsx` |
| Status pipeline | `components/molecules/StatusPipeline.tsx` |
| Status glyph | `@jovie/ui` `StatusGlyph` |
| Empty state | `components/molecules/EmptyState.tsx` |

## Audit, 2026-10-29

53 operator screens: 19 are redirects; 34 render. Before this change four
pages (Shipping, Product, Timeline, Fleet) rendered `OperatorRouteTabs`, a
hand-built link row that duplicated the segment control, and the Product
page joined seven bordered pills with arrows. Timeline also rendered a
one-option "Activity" tab. Bare "n/a" placeholders lived in the Delivery card
and the capability evidence matrix.

Remaining debt across Jovie and Ovie app routes is grandfathered per file in
[`canonical-nav-metric.baseline.json`](../../apps/web/tests/unit/design-system/canonical-nav-metric.baseline.json)
and only shrinks: hand-built tab roles (4 files), `<nav>` link rows with
`aria-current` (4), local `*Metric`/`*Stat`/`*Kpi` components (7, e.g.
`CampaignMetric`, `HudKpiSubgrid`, `FunnelMetricsStrip`) and bare
placeholders (56 files).

## Guards

- `apps/web/tests/unit/design-system/ovie-ia-registry.test.ts`: every
  operator page matches its registered sub-navigation, every view-group
  route is registered, and no page renders its own `h1`.
- `apps/web/tests/unit/design-system/canonical-nav-metric-ratchet.test.ts`:
  ad-hoc tab roles, `<nav>` link rows, local metric components and bare
  placeholders cannot grow in any file under `app/app/(shell)` or
  `components/features`.
- Defects DG-008 and DG-009 in the
  [defect guard registry](defect-guard-registry.json).

**Ship now:** this IA as the taste default. **Re-evaluate when:** Tim's
post-ship walkthrough of Ovie flags a page. **Then:** change the registry
and the owner primitive, never a single page.
