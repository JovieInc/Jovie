'use client';

import {
  EntitySidebarShell,
  type EntitySidebarShellProps,
} from '@/components/molecules/drawer/EntitySidebarShell';
import { SIDEBAR_WIDTH } from '@/lib/constants/layout';

/** Shell allocation, mobile adaptation, and focus behavior stay with the shared drawer. */
export const ADMIN_DETAIL_RAIL_WIDTH = SIDEBAR_WIDTH;

export type AdminDetailRailProps = Omit<
  EntitySidebarShellProps,
  'width' | 'workspaceSurface' | 'entityHeaderSurface' | 'footerSurface'
>;

/** One flat inspector surface; sections use spacing and headings for hierarchy. */
export function AdminDetailRail({
  headerMode = 'minimal',
  scrollStrategy = 'shell',
  ...props
}: AdminDetailRailProps) {
  return (
    <EntitySidebarShell
      {...props}
      headerMode={headerMode}
      scrollStrategy={scrollStrategy}
      width={ADMIN_DETAIL_RAIL_WIDTH}
      workspaceSurface='flat'
      entityHeaderSurface='flat'
      footerSurface='flat'
    />
  );
}
