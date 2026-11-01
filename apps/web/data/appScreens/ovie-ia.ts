/**
 * Ovie information architecture: the page-spec registry for every operator
 * screen in `APP_SCREEN_SOURCES`. Canon: docs/design-system/ovie-ia.md.
 *
 * Metadata only. `ovie-ia-registry.test.ts` reads each page source and fails
 * when a page's sub-navigation drifts from this table, when a view group
 * route has no page here, or when a page renders its own heading.
 */
import type { AdminViewGroupId } from '@/constants/admin-navigation';

/**
 * - `route-views`: the page is one of several routes behind one sidebar
 *   destination; `AdminPage views=` renders the canonical RouteSegmentControl.
 * - `query-tabs`: views of the same data inside one destination;
 *   `AdminPage tabs=` renders WorkspaceTabsSurface.
 * - `none`: one destination, one view. The sidebar row is the navigation.
 */
export type OvieSubnav = 'route-views' | 'query-tabs' | 'none';

export interface OviePageSpec {
  readonly subnav: OvieSubnav;
  /** Required for `route-views`: which view group the page belongs to. */
  readonly views?: AdminViewGroupId;
  /** A `route-views` page may also filter its own data with query tabs. */
  readonly tabs?: boolean;
}

const ADMIN = 'apps/web/app/app/(shell)/admin';

/**
 * Pages with sub-navigation. Every other non-redirect operator page is
 * `{ subnav: 'none' }`; list it here only when it gains views or tabs.
 */
export const OVIE_PAGE_IA: Readonly<Record<string, OviePageSpec>> = {
  [`${ADMIN}/shipping/page.tsx`]: { subnav: 'route-views', views: 'shipping' },
  [`${ADMIN}/product/page.tsx`]: { subnav: 'route-views', views: 'shipping' },
  [`${ADMIN}/activity/page.tsx`]: { subnav: 'route-views', views: 'shipping' },
  [`${ADMIN}/operations/page.tsx`]: {
    subnav: 'route-views',
    views: 'operations',
  },
  [`${ADMIN}/system/page.tsx`]: {
    subnav: 'route-views',
    views: 'operations',
    tabs: true,
  },
  [`${ADMIN}/people/page.tsx`]: { subnav: 'query-tabs' },
  [`${ADMIN}/platform-connections/page.tsx`]: { subnav: 'query-tabs' },
  [`${ADMIN}/playlists/page.tsx`]: { subnav: 'query-tabs' },
};

export const OVIE_DEFAULT_PAGE_SPEC: OviePageSpec = { subnav: 'none' };

export function oviePageSpec(source: string): OviePageSpec {
  return OVIE_PAGE_IA[source] ?? OVIE_DEFAULT_PAGE_SPEC;
}
