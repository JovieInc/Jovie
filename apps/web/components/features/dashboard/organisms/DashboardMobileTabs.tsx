'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import {
  artistNavigation,
  CUSTOMER_NAV_CAPACITY,
  isLibraryNavigationRoute,
  partitionCustomerNavigation,
  primaryNavigation,
  settingsNavItem,
} from '@/features/dashboard/dashboard-nav';
import type { NavItem } from '@/features/dashboard/dashboard-nav/types';
import { useAuthSafe } from '@/hooks/useClerkSafe';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useIsElectronRuntime } from '@/lib/desktop/electron-bridge';
import {
  type NavigationTelemetryContext,
  startNavigationTelemetry,
  trackNavigationImpressions,
} from '@/lib/tracking/navigation-telemetry';
import { cn } from '@/lib/utils';

import { LiquidGlassMenu, type LiquidGlassMenuItem } from './LiquidGlassMenu';

function toMenuItem(item: NavItem): LiquidGlassMenuItem {
  return { id: item.id, label: item.name, href: item.href, icon: item.icon };
}

const UTILITY_ITEMS = [settingsNavItem].map(toMenuItem);

function isMobileNavItemActive(
  item: Pick<NavItem, 'id' | 'href'>,
  pathname: string
): boolean {
  if (item.id === 'library') {
    return isLibraryNavigationRoute(pathname);
  }
  if (item.href === APP_ROUTES.DASHBOARD) {
    return pathname === item.href;
  }
  if (item.id === 'chat' && item.href === APP_ROUTES.CHAT) {
    return pathname === APP_ROUTES.CHAT;
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export interface DashboardMobileTabsProps {
  readonly className?: string;
}

export function DashboardMobileTabs({
  className,
}: DashboardMobileTabsProps): React.JSX.Element {
  const { signOut } = useAuthSafe();
  const pathname = usePathname();
  const isMobile = useMediaQuery('(max-width: 1023px)');
  const isElectron = useIsElectronRuntime();
  const telemetryContext = useMemo<NavigationTelemetryContext>(
    () => ({
      isElectron,
      isMobile: true,
      navVariant: 'canonical_customer_ia_v1',
    }),
    [isElectron]
  );

  const activeItemId = useMemo(() => {
    const active = primaryNavigation.find(item =>
      isMobileNavItemActive(item, pathname)
    );
    return active?.id ?? null;
  }, [pathname]);

  const { primaryItems, expandedItems } = useMemo(() => {
    const partition = partitionCustomerNavigation(primaryNavigation, {
      visibleCap: CUSTOMER_NAV_CAPACITY.mobilePrimaryVisible,
      activeItemId,
    });
    return {
      primaryItems: partition.visible.map(toMenuItem),
      expandedItems: [
        ...partition.more,
        ...artistNavigation,
      ].map(toMenuItem),
    };
  }, [activeItemId]);

  useEffect(() => {
    if (!isMobile) return;
    trackNavigationImpressions(
      primaryItems.map(item => item.id),
      pathname,
      telemetryContext
    );
  }, [isMobile, pathname, primaryItems, telemetryContext]);

  const handleItemActivate = useCallback(
    (
      item: LiquidGlassMenuItem,
      inputMethod: Parameters<typeof startNavigationTelemetry>[0]['inputMethod']
    ) =>
      startNavigationTelemetry({
        itemId: item.id,
        sourcePathname: pathname,
        destinationHref: item.href,
        inputMethod,
        context: telemetryContext,
      }),
    [pathname, telemetryContext]
  );

  const handleExpandedItemsVisible = useCallback(
    (items: readonly LiquidGlassMenuItem[]) => {
      if (!isMobile) return;
      trackNavigationImpressions(
        items.map(item => item.id),
        pathname,
        telemetryContext
      );
    },
    [isMobile, pathname, telemetryContext]
  );

  const handleSignOut = async () => {
    await signOut({ redirectUrl: '/' });
  };

  return (
    <LiquidGlassMenu
      primaryItems={primaryItems}
      expandedItems={expandedItems}
      utilityItems={UTILITY_ITEMS}
      onItemActivate={handleItemActivate}
      onExpandedItemsVisible={handleExpandedItemsVisible}
      onSignOut={handleSignOut}
      isItemActive={(item, currentPathname) =>
        isMobileNavItemActive(item, currentPathname)
      }
      inFlow
      className={cn('lg:hidden', className)}
    />
  );
}
