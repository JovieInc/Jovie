'use client';

import { useCallback, useMemo } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import {
  adminNavigation,
  filterProfilesWorkspaceNavigation,
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
  const profilesWorkspaceEnabled = useAppFlag('PROFILES_WORKSPACE');
  const { signOut } = useAuthSafe();
  const expandedItems = useMemo(
    () =>
      filterProfilesWorkspaceNavigation(
        mobileExpandedNavigation,
        profilesWorkspaceEnabled
      ).map(toMenuItem),
    [profilesWorkspaceEnabled]
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
