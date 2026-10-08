'use client';

// @coverage-via apps/web/tests/unit/components/organisms/UnifiedSidebar.library.test.tsx

import { ArrowLeft, Pin, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type PropsWithChildren, useMemo } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { AskJovieMark } from '@/components/ask-jovie/AskJovie';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { UpdateAvailablePill } from '@/components/atoms/UpdateAvailablePill';
import { SidebarCollapseButton } from '@/components/molecules/sidebar-collapse-button';
import { WorkspaceSelector } from '@/components/molecules/WorkspaceSelector';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  useSidebar,
} from '@/components/organisms/sidebar';
import { SidebarIdentityGroup } from '@/components/organisms/sidebar-identity-group';
import { HeaderSearchSurfaceFromContext } from '@/components/shell/HeaderSearchSurfaceFromContext';
import { RailStagedContent } from '@/components/shell/RailStagedContent';
import { useRuntimeUpdate } from '@/components/shell/RuntimeUpdateProvider';
import {
  SHELL_RAIL_ALLOCATION,
  SHELL_RAIL_BLOCK_LABEL,
  SHELL_RAIL_LABEL,
} from '@/components/shell/rail-motion';
import { SidebarInboxLink } from '@/components/shell/SidebarInboxLink';
import { SidebarMoreMenu } from '@/components/shell/SidebarMoreMenu';
import { SidebarSummerRecentMenu } from '@/components/shell/SidebarSummerRecentMenu';
import { isAvailable } from '@/components/shell/useRailFocusReturn';
import { useSidebarPageSearch } from '@/components/shell/useSidebarPageSearch';
import { ADMIN_PRIMARY_WORKSPACE_IDS } from '@/constants/admin-navigation';
import { APP_ROUTES, isDemoRoutePath } from '@/constants/routes';
import { useShellSidebarOverride } from '@/contexts/ShellSidebarOverrideContext';
import { DashboardNav } from '@/features/dashboard/dashboard-nav';
import {
  artistSettingsNavigation,
  paymentsNavItem,
  userSettingsNavigation,
} from '@/features/dashboard/dashboard-nav/config';
import { NavMenuItem } from '@/features/dashboard/dashboard-nav/NavMenuItem';
import type { NavItem } from '@/features/dashboard/dashboard-nav/types';
import { useProfileData } from '@/hooks/useProfileData';
import { APP_SHELL_WORKSPACES } from '@/lib/app-shell/workspaces';
import { BRAND_WORDMARKS, type BrandVariant } from '@/lib/brand/tokens';
import { useIsElectronRuntime } from '@/lib/desktop/electron-bridge';
import { env } from '@/lib/env-client';
import { useAppFlag } from '@/lib/flags/client';
import { useDashboardProfileQuery } from '@/lib/queries/useDashboardProfileQuery';
import { cn } from '@/lib/utils';
import type { AppShellSection } from '@/types/app-shell';
import { useDesktopUpdateContext } from './desktop-update/DesktopUpdateProvider';
import {
  isOperatorNavigationHrefActive,
  OPERATOR_NAV_ITEMS,
} from './operator-navigation';
import { IdentitySwitcher } from './ProfileSwitcher';
import { SidebarBottomNowPlayingBridge } from './SidebarBottomNowPlayingBridge';
import { WhatsNewBanner } from './whats-new/WhatsNewBanner';

export interface UnifiedSidebarProps {
  readonly section: AppShellSection;
  /** Brand skin for the shell chrome. 'ov' is the internal/admin skin (JOV-4083). */
  readonly variant?: BrandVariant;
  /** Only transfer the collapsed browser action when a header is present. */
  readonly headerOwnsCollapsedToggle?: boolean;
}

/** Render a group of nav items */
function SettingsNavGroup({
  items,
  pathname,
  isItemActive,
}: Readonly<{
  items: readonly NavItem[];
  pathname: string;
  isItemActive?: (item: NavItem) => boolean;
}>) {
  return (
    <SidebarMenu>
      {items.map(item => {
        const isActive =
          isItemActive?.(item) ??
          (pathname === item.href || pathname.startsWith(`${item.href}/`));
        return (
          <NavMenuItem key={item.id} item={item} isActive={isActive} calm />
        );
      })}
    </SidebarMenu>
  );
}

/** Dedicated operator navigation; customer DashboardNav stays customer-only. */
function OperatorNavigation({ pathname }: { readonly pathname: string }) {
  const findPage = useSidebarPageSearch(OPERATOR_NAV_ITEMS);
  const { user } = useDashboardData();
  const primary = OPERATOR_NAV_ITEMS.filter(item =>
    ADMIN_PRIMARY_WORKSPACE_IDS.some(id => id === item.registryId)
  );
  const overflow = OPERATOR_NAV_ITEMS.filter(
    item => !ADMIN_PRIMARY_WORKSPACE_IDS.some(id => id === item.registryId)
  );
  return (
    <nav
      aria-label='OV Navigation'
      className='flex flex-1 flex-col gap-4 overflow-y-auto pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
    >
      <SettingsNavGroup
        items={primary}
        pathname={pathname}
        isItemActive={item =>
          isOperatorNavigationHrefActive(pathname, item.href)
        }
      />
      <SidebarMoreMenu
        items={overflow}
        pinScope={user?.id ? `${user.id}:ov` : undefined}
        isActive={item => isOperatorNavigationHrefActive(pathname, item.href)}
        onFindPage={findPage}
      />
      {user?.id ? (
        <SidebarSummerRecentMenu
          key={user.id}
          userId={user.id}
          active={pathname === APP_ROUTES.ADMIN_CHAT}
        />
      ) : null}
    </nav>
  );
}

/** Navigation list for settings section — grouped with labels like Linear */
function SettingsNavigation({
  pathname,
  section,
}: {
  pathname: string;
  section: string;
}) {
  const { selectedProfile } = useDashboardData();
  const isStripeConnectEnabled = useAppFlag('STRIPE_CONNECT_ENABLED');
  // Prefer the TanStack Query cache (updated by profile mutations) over
  // the server-rendered context so the sidebar reflects name edits immediately.
  const { data: cachedProfileData } = useDashboardProfileQuery();
  // Cache may hold either the unwrapped DashboardProfile (from optimistic updates)
  // or the { profile: DashboardProfile } envelope (from server refetch).
  const cachedDisplayName =
    cachedProfileData?.displayName ??
    (
      cachedProfileData as unknown as {
        profile?: { displayName?: string | null };
      }
    )?.profile?.displayName;
  // Only fall back to selectedProfile when cache hasn't loaded yet (undefined/null).
  // If cachedDisplayName is empty string, the user intentionally cleared it.
  const artistName =
    cachedDisplayName == null
      ? selectedProfile?.displayName?.trim() || undefined
      : cachedDisplayName.trim() || undefined;

  // Build user settings items with conditional Payments
  const userItems = useMemo(() => {
    if (!isStripeConnectEnabled) return userSettingsNavigation;
    // Insert Payments after Billing & Subscription
    const billingIndex = userSettingsNavigation.findIndex(
      i => i.id === 'billing'
    );
    const items = [...userSettingsNavigation];
    items.splice(billingIndex + 1, 0, paymentsNavItem);
    return items;
  }, [isStripeConnectEnabled]);

  // Replace "Profile" label with the artist's display name when available
  const artistItems = useMemo(() => {
    if (!artistName) return artistSettingsNavigation;
    return artistSettingsNavigation.map(item =>
      item.id === 'artist-profile' ? { ...item, name: artistName } : item
    );
  }, [artistName]);

  return (
    <nav
      aria-label={`${section} navigation`}
      className='flex flex-1 flex-col gap-4 overflow-y-auto pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
    >
      <div>
        <span
          className={cn(
            'mb-1.5 block px-2.5 text-xs font-caption tracking-normal text-sidebar-muted/90',
            SHELL_RAIL_BLOCK_LABEL
          )}
        >
          Account
        </span>
        <SettingsNavGroup items={userItems} pathname={pathname} />
      </div>
      <div>
        <span
          className={cn(
            'mb-1.5 block px-2.5 text-xs font-caption tracking-normal text-sidebar-muted/90',
            SHELL_RAIL_BLOCK_LABEL
          )}
        >
          Artist
        </span>
        <SettingsNavGroup items={artistItems} pathname={pathname} />
      </div>
    </nav>
  );
}

/** Logo (clean header) or back button for settings/library */
function SidebarHeaderNav({
  headerOwnsCollapsedToggle,
  isRouteSidebar,
  isOperatorSection,
  canSwitchWorkspaces,
  hasMultipleIdentities,
  isDemoRoute,
  variant = 'jovie',
  routeBackHref = APP_ROUTES.DASHBOARD,
  routeBackLabel = 'Back to App',
}: Readonly<{
  headerOwnsCollapsedToggle: boolean;
  isRouteSidebar: boolean;
  isOperatorSection: boolean;
  canSwitchWorkspaces: boolean;
  hasMultipleIdentities: boolean;
  isDemoRoute: boolean;
  variant?: BrandVariant;
  routeBackHref?: string;
  routeBackLabel?: string;
}>) {
  const isDesktop = useIsElectronRuntime();
  const { state, isMobile, open: pinned } = useSidebar();
  const chromeHidden = state === 'closed' && !isMobile;
  const { inboxNavigation } = useDashboardData();

  return (
    <div className='flex w-full items-center' data-sidebar-brand-row='true'>
      {/* In the 52px icon rail the whole brand/action cluster stages out
          (max-width → 0, fade, 6px drift) while the collapse toggle — ordered
          first and centered — stays reachable. Before this, the fixed-width
          chrome pushed the toggle past the clipped rail edge and the sidebar
          could not be reopened from the rail itself (JOV-4522). */}
      <RailStagedContent hidden={chromeHidden} className='min-w-0 flex-1'>
        {(() => {
          if (isRouteSidebar) {
            return (
              <div className='flex w-full items-center gap-2'>
                <Link
                  href={routeBackHref}
                  aria-label={routeBackLabel}
                  className={cn(
                    'focus-ring-themed inline-flex h-6 shrink-0 items-center gap-1 rounded-lg px-2 text-xs text-sidebar-item-foreground transition-[background,border-color,color] duration-normal ease-interactive hover:bg-sidebar-accent/55 hover:text-sidebar-item-foreground focus-visible:bg-sidebar-accent/55 focus-visible:text-sidebar-item-foreground [font-weight:var(--font-weight-nav)]',
                    'group-data-[collapsible=icon]:size-7 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:px-0'
                  )}
                >
                  <ArrowLeft
                    className='size-3.5 text-sidebar-item-icon'
                    aria-hidden='true'
                  />
                  <span className={cn('truncate', SHELL_RAIL_LABEL)}>
                    {routeBackLabel}
                  </span>
                </Link>
              </div>
            );
          }
          if (isDemoRoute) {
            return (
              <div
                className={cn(
                  'flex h-7 w-full items-center gap-1.5 rounded-full px-2.5',
                  'group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:px-0'
                )}
              >
                <BrandLogo
                  size='chrome'
                  tone='auto'
                  rounded={false}
                  className='rounded-sm shrink-0'
                />
                <span
                  className={cn(
                    'truncate flex-1 text-left text-app tracking-tight text-sidebar-item-foreground [font-weight:var(--font-weight-nav)]',
                    SHELL_RAIL_LABEL
                  )}
                >
                  Demo
                </span>
              </div>
            );
          }
          if (canSwitchWorkspaces) {
            return (
              <WorkspaceSelector
                currentWorkspaceId={variant === 'ov' ? 'ov' : 'customer'}
                workspaces={APP_SHELL_WORKSPACES}
              />
            );
          }
          if (hasMultipleIdentities && !isOperatorSection) {
            return <IdentitySwitcher />;
          }
          // Clean header: the Jovie mark is the global "Ask Jovie" entry point
          // (JOV-6569). OV skin keeps its static identity wordmark; user menu
          // lives in the bottom Settings button.
          if (headerOwnsCollapsedToggle) return null;
          return (
            <div
              className={cn(
                'flex h-7 w-full items-center gap-1.5',
                'group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:px-0'
              )}
            >
              {variant === 'ov' ? (
                <>
                  <BrandLogo
                    size='compact'
                    tone='auto'
                    variant={variant}
                    rounded={false}
                    className='rounded-sm shrink-0'
                  />
                  <span className={cn('truncate', SHELL_RAIL_LABEL)}>
                    {BRAND_WORDMARKS[variant]}
                  </span>
                </>
              ) : (
                <AskJovieMark variant={variant} railOwner='left' />
              )}
            </div>
          );
        })()}
      </RailStagedContent>
      {!isRouteSidebar && !isOperatorSection && !isDemoRoute ? (
        <RailStagedContent
          hidden={chromeHidden}
          className='flex items-center'
          data-sidebar-header-actions='true'
        >
          <SidebarInboxLink availability={inboxNavigation} />
          <HeaderSearchSurfaceFromContext compact />
        </RailStagedContent>
      ) : null}

      {!isDesktop && !headerOwnsCollapsedToggle ? (
        <RailStagedContent
          hidden={!pinned && !isMobile && headerOwnsCollapsedToggle}
          stage={headerOwnsCollapsedToggle}
          className='ml-auto shrink-0 group-data-[collapsible=icon]:order-first group-data-[collapsible=icon]:mx-auto'
        >
          <SidebarCollapseButton />
        </RailStagedContent>
      ) : null}
    </div>
  );
}

/** Bottom-owned shell slot for transient entity cards and status banners. */
export function SidebarDock({ children }: PropsWithChildren) {
  return (
    <div
      data-sidebar-dock='true'
      className='flex shrink-0 flex-col gap-1 overflow-visible'
    >
      {children}
    </div>
  );
}

/**
 * UnifiedSidebar - Single sidebar component for all post-auth sections
 *
 * Header shows workspace identity, navigation owns attention and update state,
 * and one footer identity group owns creator identity and Public Profile access.
 */
export function UnifiedSidebar({
  section,
  variant = 'jovie',
  headerOwnsCollapsedToggle = false,
}: UnifiedSidebarProps) {
  const { identities, isAdmin: canSwitchWorkspaces } = useDashboardData();
  const sidebarOverride = useShellSidebarOverride();
  const {
    state: sidebarState,
    isMobile,
    isFloating,
    pinSidebar,
    closeSidebar,
  } = useSidebar();
  const isElectron = useIsElectronRuntime();
  const pathname = usePathname();
  const isDemoRoute = isDemoRoutePath(pathname);
  const isInSettings = section === 'settings';
  const isOperatorSection = section === 'admin' || section === 'ov';
  const isRouteSidebar = isInSettings || sidebarOverride !== null;
  const hasMultipleIdentities = identities.length >= 2;
  // Read the bridge synchronously so the desktop update listener mounts on
  // the first committed sidebar render. Electron emits update events once;
  // waiting for the effect-backed runtime hook would miss a boot-time event.

  const { profileHref } = useProfileData(section !== 'ov');
  const isSidebarCollapsed = !isMobile && sidebarState === 'closed';
  const showWhatsNew =
    !env.IS_TEST && !env.IS_E2E && (isElectron || section === 'ov');
  const update = useRuntimeUpdate();
  const typedUpdate = useDesktopUpdateContext();
  const updateOwnsSlot = Boolean(
    update?.available ||
      ['available', 'downloading', 'ready', 'error'].includes(
        typedUpdate?.state.state ?? ''
      )
  );
  const ambientDock = (
    <SidebarDock>
      <div
        data-sidebar-attention-slot='true'
        className='flex h-8 shrink-0 items-center px-2'
      >
        {isSidebarCollapsed ? null : <UpdateAvailablePill />}
        <WhatsNewBanner
          enabled={showWhatsNew}
          collapsed={isSidebarCollapsed}
          compact
          suppressed={updateOwnsSlot}
        />
      </div>
      <SidebarBottomNowPlayingBridge
        collapsed={isSidebarCollapsed}
        detached={headerOwnsCollapsedToggle && isSidebarCollapsed && !isMobile}
      />
    </SidebarDock>
  );

  return (
    <Sidebar
      variant='sidebar'
      data-shell-rail-motion='left'
      collapsible={headerOwnsCollapsedToggle ? 'offcanvas' : 'icon'}
      toolbar={
        headerOwnsCollapsedToggle && (isMobile || !isElectron) ? (
          <div
            className={cn(
              'flex w-full items-center gap-1.5',
              !isMobile &&
                (isFloating || isSidebarCollapsed || isElectron) &&
                'invisible'
            )}
            data-web-sidebar-control={isMobile ? undefined : 'true'}
          >
            <AskJovieMark variant={variant} railOwner='left' />
            <div className='ml-auto'>
              <SidebarCollapseButton />
            </div>
          </div>
        ) : undefined
      }
      className={cn(
        'bg-base',
        '[--sidebar-width:var(--app-shell-sidebar-width)]',
        // The left rail owns its internal label/icon staging while
        // AppShellFrame owns the adjacent main-plane allocation (#4522).
        SHELL_RAIL_ALLOCATION,
        // OV brand skin: class-based token override, same mechanism as `.dark`
        // (see design-system.css → OV MODE). Zero layout impact.
        variant === 'ov' && 'ov-mode'
      )}
    >
      <SidebarHeader
        data-electron-drag-region='true'
        className={cn(
          'relative justify-center gap-0 px-(--space-2-5)',
          'h-(--app-shell-header-height) py-0 px-2'
        )}
      >
        <SidebarHeaderNav
          headerOwnsCollapsedToggle={headerOwnsCollapsedToggle}
          isRouteSidebar={isRouteSidebar}
          isOperatorSection={isOperatorSection}
          canSwitchWorkspaces={canSwitchWorkspaces}
          hasMultipleIdentities={hasMultipleIdentities}
          isDemoRoute={isDemoRoute}
          variant={variant}
          routeBackHref={sidebarOverride?.backHref}
          routeBackLabel={sidebarOverride?.backLabel}
        />
        {isFloating ? (
          <div
            className='absolute right-2 flex items-center gap-1 bg-sidebar'
            data-electron-no-drag='true'
          >
            <button
              type='button'
              onClick={event => {
                const returnFocus = event.detail === 0;
                const trigger = event.currentTarget;
                pinSidebar?.();
                if (returnFocus)
                  requestAnimationFrame(() => {
                    if (
                      document.activeElement !== document.body &&
                      document.activeElement !== trigger
                    )
                      return;
                    const toggle = Array.from(
                      document.querySelectorAll<HTMLElement>(
                        '[data-rail-toggle="left"]'
                      )
                    ).find(isAvailable);
                    toggle?.focus({ preventScroll: true });
                  });
              }}
              aria-label='Pin Sidebar'
              className='focus-ring-themed flex h-7 items-center gap-1 rounded-md px-2 text-xs text-primary-token hover:bg-sidebar-accent'
            >
              <Pin aria-hidden='true' className='size-3.5' />
              Pin
            </button>
            <button
              type='button'
              onClick={closeSidebar}
              aria-label='Close Sidebar'
              className='focus-ring-themed grid size-7 place-items-center rounded-md text-secondary-token hover:bg-sidebar-accent'
            >
              <X aria-hidden='true' className='size-3.5' />
            </button>
          </div>
        ) : null}
      </SidebarHeader>

      <SidebarContent className='min-h-0 flex-1 px-2 pb-(--space-2-5) pt-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
        <SidebarGroup className='flex min-h-0 flex-1 flex-col pb-1'>
          <SidebarGroupContent className='flex min-h-0 flex-1 flex-col'>
            {section === 'ov' ? (
              <OperatorNavigation pathname={pathname} />
            ) : isInSettings ? (
              <SettingsNavigation pathname={pathname} section={section} />
            ) : sidebarOverride ? (
              sidebarOverride.content
            ) : (
              <DashboardNav
                headerOwnsInbox={!isDemoRoute && !isOperatorSection}
              >
                {isDemoRoute ? (
                  <HeaderSearchSurfaceFromContext className='w-full max-w-none sm:w-full lg:w-full' />
                ) : null}
              </DashboardNav>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className='mt-auto gap-0 border-t border-subtle px-0 pt-(--space-2-5) pb-(--space-3-5)'>
        {ambientDock}
        <SidebarIdentityGroup
          calm={!isRouteSidebar}
          profileHref={section === 'ov' ? undefined : profileHref}
          label={section === 'ov' ? 'Account' : undefined}
        />
      </SidebarFooter>
    </Sidebar>
  );
}
