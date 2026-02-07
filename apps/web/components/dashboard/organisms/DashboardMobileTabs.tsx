'use client';

import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import {
  adminNavigation,
  mobileExpandedNavigation,
  mobilePrimaryNavigation,
} from '@/components/dashboard/dashboard-nav';
import type { NavItem } from '@/components/dashboard/dashboard-nav/types';
import { cn } from '@/lib/utils';

import { LiquidGlassMenu, type LiquidGlassMenuItem } from './LiquidGlassMenu';

function toMenuItem(item: NavItem): LiquidGlassMenuItem {
  return { id: item.id, label: item.name, href: item.href, icon: item.icon };
}

const PRIMARY_ITEMS = mobilePrimaryNavigation.map(toMenuItem);
const EXPANDED_ITEMS = mobileExpandedNavigation.map(toMenuItem);
const ADMIN_ITEMS = adminNavigation.map(toMenuItem);

export interface DashboardMobileTabsProps {
  readonly className?: string;
}

export function DashboardMobileTabs({
  className,
}: DashboardMobileTabsProps): React.JSX.Element {
  const { isAdmin } = useDashboardData();

  return (
    <LiquidGlassMenu
      primaryItems={PRIMARY_ITEMS}
      expandedItems={EXPANDED_ITEMS}
      adminItems={isAdmin ? ADMIN_ITEMS : undefined}
      className={cn('lg:hidden', className)}
    />
  );
}
