import { APP_ROUTES } from '@/constants/routes';

export interface AdminWorkspaceTab {
  readonly label: string;
  readonly href: string;
}

/**
 * Views behind one sidebar row. Product and Timeline are Shipping views; Agents
 * and Room are Fleet views. Each keeps its route, so deep links stay valid.
 */
export const ADMIN_WORKSPACE_TABS = {
  shipping: [
    { label: 'Pipeline', href: APP_ROUTES.ADMIN_SHIPPING },
    { label: 'Product', href: APP_ROUTES.ADMIN_PRODUCT },
    { label: 'Timeline', href: APP_ROUTES.ADMIN_ACTIVITY },
  ],
  operations: [
    { label: 'Health', href: APP_ROUTES.ADMIN_OPERATIONS },
    { label: 'Agents', href: APP_ROUTES.ADMIN_AGENTS },
    { label: 'Room', href: APP_ROUTES.ADMIN_ROOM },
  ],
} as const satisfies Record<string, readonly AdminWorkspaceTab[]>;

export type AdminViewGroupId = keyof typeof ADMIN_WORKSPACE_TABS;

/**
 * Accessible names for each view group's sub-navigation. `AdminPage views=`
 * renders the group through the canonical RouteSegmentControl; see
 * docs/design-system/ovie-ia.md.
 */
export const ADMIN_VIEW_GROUPS = {
  shipping: { label: 'Shipping Views', views: ADMIN_WORKSPACE_TABS.shipping },
  operations: { label: 'Fleet Views', views: ADMIN_WORKSPACE_TABS.operations },
} as const satisfies Record<
  AdminViewGroupId,
  { readonly label: string; readonly views: readonly AdminWorkspaceTab[] }
>;

/** The view whose route owns `pathname`; the group's first view otherwise. */
export function activeAdminView(
  group: AdminViewGroupId,
  pathname: string
): string {
  const views: readonly AdminWorkspaceTab[] = ADMIN_WORKSPACE_TABS[group];
  const match = views.find(
    view => pathname === view.href || pathname.startsWith(`${view.href}/`)
  );
  return (match ?? views[0]).href;
}
