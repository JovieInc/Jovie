'use client';

import {
  mobileExpandedNavigation,
  mobilePrimaryNavigation,
  settingsNavItem,
} from '@/features/dashboard/dashboard-nav';
import type { NavItem } from '@/features/dashboard/dashboard-nav/types';
import { useAuthSafe } from '@/hooks/useClerkSafe';
import { cn } from '@/lib/utils';

import { LiquidGlassMenu, type LiquidGlassMenuItem } from './LiquidGlassMenu';

function toMenuItem(item: NavItem): LiquidGlassMenuItem {
  return { id: item.id, label: item.name, href: item.href, icon: item.icon };
}

const PRIMARY_ITEMS = mobilePrimaryNavigation.map(toMenuItem);
const EXPANDED_ITEMS = mobileExpandedNavigation.map(toMenuItem);
const UTILITY_ITEMS = [settingsNavItem].map(toMenuItem);

export interface DashboardMobileTabsProps {
  readonly className?: string;
}

export function DashboardMobileTabs({
  className,
}: DashboardMobileTabsProps): React.JSX.Element {
  const { signOut } = useAuthSafe();

  const handleSignOut = async () => {
    await signOut({ redirectUrl: '/' });
  };

  return (
    <LiquidGlassMenu
      primaryItems={PRIMARY_ITEMS}
      expandedItems={EXPANDED_ITEMS}
      utilityItems={UTILITY_ITEMS}
      onSignOut={handleSignOut}
      className={cn('lg:hidden', className)}
    />
  );
}
