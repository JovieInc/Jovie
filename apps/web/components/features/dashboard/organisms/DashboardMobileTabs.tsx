'use client';

import { ExternalLink } from 'lucide-react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo } from 'react';
import {
  artistNavigation,
  CUSTOMER_NAV_CAPACITY,
  isNavigationItemActive,
  navigationVisibleForFlags,
  partitionCustomerNavigation,
  primaryNavigation,
  settingsNavItem,
} from '@/features/dashboard/dashboard-nav';
import type { NavItem } from '@/features/dashboard/dashboard-nav/types';
import { useAuthSafe } from '@/hooks/useClerkSafe';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useProfileData } from '@/hooks/useProfileData';
import { useIsElectronRuntime } from '@/lib/desktop/electron-bridge';
import { useAppFlag } from '@/lib/flags/client';
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

export interface DashboardMobileTabsProps {
  readonly className?: string;
}

export function DashboardMobileTabs({
  className,
}: DashboardMobileTabsProps): React.JSX.Element {
  const { signOut } = useAuthSafe();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentNavigationHref = useMemo(() => {
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);
  const isMobile = useMediaQuery('(max-width: 1023px)');
  const isElectron = useIsElectronRuntime();
  const { profileHref } = useProfileData(true);
  const profilesWorkspaceEnabled = useAppFlag('PROFILES_WORKSPACE');
  const customerNavigation = useMemo(
    () =>
      navigationVisibleForFlags(primaryNavigation, {
        PROFILES_WORKSPACE: profilesWorkspaceEnabled,
      }),
    [profilesWorkspaceEnabled]
  );
  const telemetryContext = useMemo<NavigationTelemetryContext>(
    () => ({
      isElectron,
      isMobile: true,
      navVariant: 'canonical_identity_work_v1',
    }),
    [isElectron]
  );

  const activeItemId = useMemo(() => {
    const active = customerNavigation.find(item =>
      isNavigationItemActive(item, pathname, searchParams)
    );
    return active?.id ?? null;
  }, [customerNavigation, pathname, searchParams]);

  const { primaryItems, expandedItems } = useMemo(() => {
    const partition = partitionCustomerNavigation(customerNavigation, {
      visibleCap: CUSTOMER_NAV_CAPACITY.mobilePrimaryVisible,
      activeItemId,
    });
    return {
      primaryItems: partition.visible.map(toMenuItem),
      expandedItems: [...partition.more, ...artistNavigation].map(toMenuItem),
    };
  }, [activeItemId, customerNavigation]);

  const utilityItems = useMemo<LiquidGlassMenuItem[]>(
    () => [
      ...(profileHref
        ? [
            {
              id: 'public-profile',
              label: 'Public Profile',
              href: profileHref,
              icon: ExternalLink,
            },
          ]
        : []),
      ...UTILITY_ITEMS,
    ],
    [profileHref]
  );

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
        sourcePathname: currentNavigationHref,
        destinationHref: item.href,
        inputMethod,
        context: telemetryContext,
      }),
    [currentNavigationHref, telemetryContext]
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
      utilityItems={utilityItems}
      onItemActivate={handleItemActivate}
      onExpandedItemsVisible={handleExpandedItemsVisible}
      onSignOut={handleSignOut}
      isItemActive={(item, currentPathname) =>
        isNavigationItemActive(item, currentPathname, searchParams)
      }
      inFlow
      className={cn('lg:hidden', className)}
    />
  );
}
