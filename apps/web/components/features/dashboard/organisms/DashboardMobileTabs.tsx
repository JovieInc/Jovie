'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import {
  isLibraryNavigationRoute,
  mobileExpandedNavigation,
  mobilePrimaryNavigation,
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

  useEffect(() => {
    if (!isMobile) return;
    trackNavigationImpressions(
      PRIMARY_ITEMS.map(item => item.id),
      pathname,
      telemetryContext
    );
  }, [isMobile, pathname, telemetryContext]);

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
      primaryItems={PRIMARY_ITEMS}
      expandedItems={EXPANDED_ITEMS}
      utilityItems={UTILITY_ITEMS}
      onItemActivate={handleItemActivate}
      onExpandedItemsVisible={handleExpandedItemsVisible}
      onSignOut={handleSignOut}
      isItemActive={(item, currentPathname) => {
        if (item.id === 'library') {
          return isLibraryNavigationRoute(currentPathname);
        }
        if (item.href === APP_ROUTES.DASHBOARD) {
          return currentPathname === item.href;
        }
        return (
          currentPathname === item.href ||
          currentPathname.startsWith(`${item.href}/`)
        );
      }}
      className={cn('lg:hidden', className)}
    />
  );
}
