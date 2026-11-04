'use client';

import { usePathname } from 'next/navigation';
import { RouteSegmentControl } from '@/components/molecules/RouteSegmentControl';
import {
  ADMIN_VIEW_GROUPS,
  type AdminViewGroupId,
  activeAdminView,
} from '@/constants/admin-navigation';

/**
 * Sub-navigation between the routes behind one sidebar destination
 * (Shipping: Pipeline, Product, Timeline). Composes the canonical
 * RouteSegmentControl, the same control Jovie uses for Audience views, so
 * geometry, focus, keyboard and touch targets have one owner. Pages never
 * render this directly: `AdminPage views=` places it in the page toolbar.
 */
export function AdminRouteViews({
  group,
}: Readonly<{ readonly group: AdminViewGroupId }>) {
  const pathname = usePathname();
  const { label, views } = ADMIN_VIEW_GROUPS[group];
  return (
    <RouteSegmentControl
      aria-label={label}
      value={activeAdminView(group, pathname)}
      options={views.map(view => ({
        value: view.href,
        label: view.label,
        href: view.href,
      }))}
    />
  );
}
