'use client';

import { useCallback, useMemo } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import {
  adminNavigation,
  libraryNavItem,
  mobileExpandedNavigation,
  mobilePrimaryNavigation,
} from '@/features/dashboard/dashboard-nav';
import type { NavItem } from '@/features/dashboard/dashboard-nav/types';
import { useAuthSafe } from '@/hooks/useClerkSafe';
import { useAppFlag } from '@/lib/flags/client';
import { cn } from '@/lib/utils';

import { LiquidGlassMenu, type LiquidGlassMenuItem } from './LiquidGlassMenu';

function toMenuItem(item: NavItem): LiquidGlassMenuItem {
  return { id: item.id, label: item.name, href: item.href, icon: item.icon };
}

const PRIMARY_ITEMS = mobilePrimaryNavigation.map(toMenuItem);
const ADMIN_ITEMS = adminNavigation.map(toMenuItem);

export interface DashboardMobileTabsProps {
  readonly className?: string;
}

export function DashboardMobileTabs({
  className,
}: DashboardMobileTabsProps): React.JSX.Element {
  const { isAdmin } = useDashboardData();
  const { signOut } = useAuthSafe();
  const designV1LibraryEnabled = useAppFlag('DESIGN_V1');
  const expandedItems = useMemo(
    () =>
      (designV1LibraryEnabled
        ? [libraryNavItem, ...mobileExpandedNavigation]
        : mobileExpandedNavigation
      ).map(toMenuItem),
    [designV1LibraryEnabled]
  );

  const handleSignOut = useCallback(async () => {
    await signOut({ redirectUrl: '/' });
  }, [signOut]);

  return (
    <LiquidGlassMenu
      primaryItems={PRIMARY_ITEMS}
      expandedItems={expandedItems}
      adminItems={isAdmin ? ADMIN_ITEMS : undefined}
      onSignOut={handleSignOut}
      className={cn('lg:hidden', className)}
    />
  );
}
