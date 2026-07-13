'use client';

import { useCallback, useMemo } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import {
  adminNavigation,
  inboxNavItem,
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

const ADMIN_ITEMS = adminNavigation.map(toMenuItem);

export interface DashboardMobileTabsProps {
  readonly className?: string;
}

export function DashboardMobileTabs({
  className,
}: DashboardMobileTabsProps): React.JSX.Element {
  const { isAdmin } = useDashboardData();
  const { signOut } = useAuthSafe();
  const inboxHomeEnabled = useAppFlag('INBOX_HOME');

  // Mirrors DashboardNav's INBOX_HOME gating (GH #12634 / #14206 follow-up):
  // computed inside the component (not at module scope) so the bottom bar
  // reacts to the flag instead of freezing Inbox out at first import.
  const primaryItems = useMemo(() => {
    const items = inboxHomeEnabled
      ? [inboxNavItem, ...mobilePrimaryNavigation]
      : mobilePrimaryNavigation;
    return items.map(toMenuItem);
  }, [inboxHomeEnabled]);

  const expandedItems = useMemo(
    () => mobileExpandedNavigation.map(toMenuItem),
    []
  );

  const handleSignOut = useCallback(async () => {
    await signOut({ redirectUrl: '/' });
  }, [signOut]);

  return (
    <LiquidGlassMenu
      primaryItems={primaryItems}
      expandedItems={expandedItems}
      adminItems={isAdmin ? ADMIN_ITEMS : undefined}
      onSignOut={handleSignOut}
      className={cn('lg:hidden', className)}
    />
  );
}
