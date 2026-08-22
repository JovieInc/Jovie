'use client';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@jovie/ui';
import { ArrowLeft, Copy, ExternalLink, LogOut, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { UpdateAvailablePill } from '@/components/atoms/UpdateAvailablePill';
import { toast } from '@/components/feedback';
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
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/organisms/Sidebar';
import { UserButton } from '@/components/organisms/user-button';
import { getVersionUpdateTitle } from '@/components/shell/getVersionUpdateTitle';
import { HeaderSearchSurfaceFromContext } from '@/components/shell/HeaderSearchSurfaceFromContext';
import { InstallBanner } from '@/components/shell/InstallBanner';
import { BASE_URL, HOSTNAME } from '@/constants/domains';
import { APP_ROUTES, isDemoRoutePath } from '@/constants/routes';
import { useShellSidebarOverride } from '@/contexts/ShellSidebarOverrideContext';
import { DashboardNav } from '@/features/dashboard/dashboard-nav';
import {
  artistSettingsNavigation,
  paymentsNavItem,
  userSettingsNavigation,
} from '@/features/dashboard/dashboard-nav/config';
import type { NavItem } from '@/features/dashboard/dashboard-nav/types';
import { useAuthSafe } from '@/hooks/useClerkSafe';
import { copyToClipboard } from '@/hooks/useClipboard';
import { useProfileData } from '@/hooks/useProfileData';
import { APP_SHELL_WORKSPACES } from '@/lib/app-shell/workspaces';
import { BRAND_WORDMARKS, type BrandVariant } from '@/lib/brand/tokens';
import {
  isElectronRuntime,
  useIsElectronRuntime,
} from '@/lib/desktop/electron-bridge';
import { env } from '@/lib/env-client';
import { useAppFlag } from '@/lib/flags/client';
import {
  useVersionMonitor,
  type VersionMismatchInfo,
} from '@/lib/hooks/useVersionMonitor';
import { useDashboardProfileQuery } from '@/lib/queries/useDashboardProfileQuery';
import { cn } from '@/lib/utils';
import type { AppShellSection } from '@/types/app-shell';
import {
  isOperatorNavigationHrefActive,
  OPERATOR_NAV_SECTIONS,
} from './operator-navigation';
import { ProfileSwitcher } from './ProfileSwitcher';
import { SidebarBottomNowPlayingBridge } from './SidebarBottomNowPlayingBridge';

export interface UnifiedSidebarProps {
  readonly section: AppShellSection;
  /** Brand skin for the shell chrome. 'ov' is the internal/admin skin (JOV-4083). */
  readonly variant?: BrandVariant;
}

const VERSION_DISMISSAL_KEY = 'jovie-version-update-dismissed';
const VERSION_NOTIFICATION_DELAY_MS = 10_000;

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
          <ContextMenu key={item.id}>
            <ContextMenuTrigger asChild>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isActive}
                  tooltip={item.name}
                >
                  <Link
                    href={item.href}
                    aria-current={isActive ? 'page' : undefined}
                    className='flex w-full min-w-0 items-center gap-2'
                  >
                    <item.icon className='size-3.5' />
                    <span className='truncate'>{item.name}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem
                onSelect={async () => {
                  const origin =
                    globalThis.window === undefined
                      ? BASE_URL
                      : globalThis.location.origin;
                  const url = `${origin}${item.href}`;
                  const ok = await copyToClipboard(url);
                  if (ok) {
                    toast.success('Link copied');
                  } else {
                    toast.error('Failed to copy link');
                  }
                }}
              >
                <Copy className='mr-2 h-4 w-4' />
                Copy link
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        );
      })}
    </SidebarMenu>
  );
}

/** Dedicated operator navigation; customer DashboardNav stays customer-only. */
function OperatorNavigation({ pathname }: { readonly pathname: string }) {
  return (
    <nav
      aria-label='OV Navigation'
      className='flex flex-1 flex-col gap-4 overflow-hidden pt-1'
    >
      {OPERATOR_NAV_SECTIONS.map(section => (
        <div key={section.label}>
          <span className='mb-1.5 block px-2.5 text-xs font-caption tracking-normal text-sidebar-muted/90 group-data-[collapsible=icon]:hidden'>
            {section.label}
          </span>
          <SettingsNavGroup
            items={section.items}
            pathname={pathname}
            isItemActive={item =>
              isOperatorNavigationHrefActive(pathname, item.href)
            }
          />
        </div>
      ))}
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
      className='flex flex-1 flex-col gap-4 overflow-hidden pt-1'
    >
      <div>
        <span className='mb-1.5 block px-2.5 text-xs font-caption tracking-normal text-sidebar-muted/90 group-data-[collapsible=icon]:hidden'>
          Account
        </span>
        <SettingsNavGroup items={userItems} pathname={pathname} />
      </div>
      <div>
        <span className='mb-1.5 block px-2.5 text-xs font-caption tracking-normal text-sidebar-muted/90 group-data-[collapsible=icon]:hidden'>
          Artist
        </span>
        <SettingsNavGroup items={artistItems} pathname={pathname} />
      </div>
    </nav>
  );
}

/** Logo (clean header) or back button for settings/library */
function SidebarHeaderNav({
  isRouteSidebar,
  isOperatorSection,
  canSwitchWorkspaces,
  hasMultipleProfiles,
  isDemoRoute,
  variant = 'jovie',
  routeBackHref = APP_ROUTES.DASHBOARD,
  routeBackLabel = 'Back to App',
}: Readonly<{
  isRouteSidebar: boolean;
  isOperatorSection: boolean;
  canSwitchWorkspaces: boolean;
  hasMultipleProfiles: boolean;
  isDemoRoute: boolean;
  variant?: BrandVariant;
  routeBackHref?: string;
  routeBackLabel?: string;
}>) {
  const isDesktop = useIsElectronRuntime();

  return (
    <div className='flex w-full items-center'>
      {(() => {
        if (isRouteSidebar) {
          return (
            <div className='flex w-full items-center gap-2'>
              <Link
                href={routeBackHref}
                aria-label={routeBackLabel}
                className={cn(
                  'focus-ring-themed inline-flex h-6 shrink-0 items-center gap-1 rounded-lg px-2 text-xs text-sidebar-item-foreground transition-[background,border-color,color] duration-normal ease-interactive hover:bg-sidebar-accent/55 hover:text-sidebar-item-foreground focus-visible:bg-sidebar-accent/55 focus-visible:text-sidebar-item-foreground [font-weight:var(--font-weight-nav)]',
                  'group-data-[collapsible=icon]:size-7 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0'
                )}
              >
                <ArrowLeft
                  className='size-3.5 text-sidebar-item-icon'
                  aria-hidden='true'
                />
                <span className='truncate group-data-[collapsible=icon]:hidden'>
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
                'group-data-[collapsible=icon]:justify-center'
              )}
            >
              <BrandLogo
                size={14}
                tone='auto'
                rounded={false}
                className='rounded-sm shrink-0'
              />
              <span className='truncate flex-1 text-left text-app tracking-tight text-sidebar-item-foreground group-data-[collapsible=icon]:hidden [font-weight:var(--font-weight-nav)]'>
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
        if (hasMultipleProfiles && !isOperatorSection) {
          return <ProfileSwitcher />;
        }
        // Clean header: brand logo + wordmark for identity (matches Linear's
        // workspace pill pattern). User menu lives in the bottom Settings button.
        // Wordmark and logo variant are driven by the active brand skin.
        return (
          <div
            className={cn(
              'flex h-7 w-full items-center gap-1.5 px-2.5',
              'group-data-[collapsible=icon]:justify-center'
            )}
          >
            <BrandLogo
              size={14}
              tone='auto'
              variant={variant}
              rounded={false}
              className='rounded-sm shrink-0'
            />
            <span className='truncate text-app tracking-tight text-sidebar-item-foreground [font-weight:var(--font-weight-nav)] group-data-[collapsible=icon]:hidden'>
              {BRAND_WORDMARKS[variant]}
            </span>
          </div>
        );
      })()}

      {!isDesktop ? (
        <SidebarCollapseButton className='ml-auto shrink-0' />
      ) : null}
    </div>
  );
}

function ShellSidebarInstallBanner() {
  const isPassiveRuntime = env.IS_TEST || env.IS_E2E;
  const [versionUpdate, setVersionUpdate] =
    useState<VersionMismatchInfo | null>(null);
  const [showVersionBanner, setShowVersionBanner] = useState(false);
  const notificationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const handleVersionMismatch = useCallback((info: VersionMismatchInfo) => {
    try {
      if (sessionStorage.getItem(VERSION_DISMISSAL_KEY)) return;
    } catch {
      // Session storage may be unavailable in restricted browsers.
    }

    setVersionUpdate(info);
    if (notificationTimeoutRef.current) {
      clearTimeout(notificationTimeoutRef.current);
    }
    notificationTimeoutRef.current = setTimeout(() => {
      setShowVersionBanner(true);
    }, VERSION_NOTIFICATION_DELAY_MS);
  }, []);

  useVersionMonitor({
    onVersionMismatch: handleVersionMismatch,
    enabled: !isPassiveRuntime,
  });

  useEffect(() => {
    return () => {
      if (notificationTimeoutRef.current) {
        clearTimeout(notificationTimeoutRef.current);
      }
    };
  }, []);

  const dismissVersionUpdate = useCallback(() => {
    try {
      sessionStorage.setItem(VERSION_DISMISSAL_KEY, 'true');
    } catch {
      // Session storage may be unavailable in restricted browsers.
    }
    setShowVersionBanner(false);
    setVersionUpdate(null);
  }, []);

  const reload = useCallback(() => {
    globalThis.location.reload();
  }, []);

  if (isPassiveRuntime) {
    return null;
  }

  if (!showVersionBanner || !versionUpdate) {
    return null;
  }

  const title = getVersionUpdateTitle(versionUpdate.newVersion);

  return (
    <InstallBanner
      open
      icon={RefreshCw}
      title={title}
      description='A new version is available. Reload to update.'
      ctaLabel='Reload'
      ctaIcon={RefreshCw}
      onCta={reload}
      onDismiss={dismissVersionUpdate}
      className='group-data-[collapsible=icon]:hidden'
    />
  );
}

function OperatorSessionControls() {
  const { signOut } = useAuthSafe();
  const handleSignOut = useCallback(async () => {
    await signOut({ redirectUrl: '/' });
  }, [signOut]);

  return (
    <div className='px-2.5 py-0.5'>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton tooltip='Sign Out' onClick={handleSignOut}>
            <LogOut className='size-3.5' aria-hidden='true' />
            <span className='truncate group-data-[collapsible=icon]:hidden'>
              Sign Out
            </span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </div>
  );
}

export function SidebarIdentityFooter({
  profileHref,
}: Readonly<{ profileHref: string | undefined }>) {
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const profileDisplayHref = profileHref
    ? `${HOSTNAME}${profileHref}`
    : undefined;

  return (
    <div
      data-sidebar='user-panel'
      data-testid='sidebar-user-panel'
      className='border-t border-(--noir-ion-border-subtle) px-2.5 py-1.5'
    >
      <fieldset
        data-sidebar='identity-group'
        data-sidebar-identity-group='creator'
        data-sidebar-identity-boundary='true'
        data-testid='sidebar-identity-group'
        className={cn(
          'group/sidebar-identity w-full min-w-0 rounded-xl border border-(--noir-ion-border-subtle) bg-transparent p-0.5',
          'transition-colors duration-fast ease-interactive',
          'hover:bg-sidebar-accent/40',
          'focus-within:border-sidebar-ring/35 focus-within:bg-sidebar-accent/35 focus-within:ring-1 focus-within:ring-sidebar-ring/20',
          isAccountMenuOpen && 'border-sidebar-ring/35 bg-sidebar-accent/55'
        )}
      >
        <legend className='sr-only'>Creator identity</legend>
        <UserButton
          embeddedInIdentityGroup
          onMenuOpenChange={setIsAccountMenuOpen}
          profileHref={profileHref}
          settingsHref={APP_ROUTES.SETTINGS}
          showUserInfo
        />
        {profileHref && profileDisplayHref ? (
          <Link
            href={profileHref}
            aria-label={`Open public profile at ${profileDisplayHref}`}
            title='Public Profile'
            data-focus-treatment='underline-only'
            data-sidebar-identity-action='public-profile'
            className={cn(
              'flex min-h-6 min-w-0 items-center gap-1.5 rounded-md pb-1 pl-10 pr-2 pt-0.5 text-2xs font-normal text-sidebar-muted outline-none',
              'transition-colors duration-fast ease-interactive hover:text-sidebar-item-foreground focus-visible:text-primary-token focus-visible:underline focus-visible:underline-offset-2',
              'group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-7 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0'
            )}
          >
            <ExternalLink className='size-3 shrink-0' aria-hidden='true' />
            <span className='truncate group-data-[collapsible=icon]:hidden'>
              {profileDisplayHref}
            </span>
          </Link>
        ) : null}
      </fieldset>
    </div>
  );
}

/**
 * UnifiedSidebar - Single sidebar component for all post-auth sections
 *
 * Header shows workspace identity, navigation owns attention and update state,
 * and one protected footer panel owns the public-profile and account controls.
 */
export function UnifiedSidebar({
  section,
  variant = 'jovie',
}: UnifiedSidebarProps) {
  const { creatorProfiles, isAdmin: canSwitchWorkspaces } = useDashboardData();
  const sidebarOverride = useShellSidebarOverride();
  const pathname = usePathname();
  const isDemoRoute = isDemoRoutePath(pathname);
  const isInSettings = section === 'settings';
  const isOperatorSection = section === 'admin' || section === 'ov';
  const isRouteSidebar = isInSettings || sidebarOverride !== null;
  const hasMultipleProfiles = creatorProfiles.length >= 2;
  // Read the bridge synchronously so the desktop update listener mounts on
  // the first committed sidebar render. Electron emits update events once;
  // waiting for the effect-backed runtime hook would miss a boot-time event.
  const isDesktop = isElectronRuntime();

  const { profileHref } = useProfileData(section !== 'ov');

  return (
    <Sidebar
      variant='sidebar'
      data-shell-rail-motion='left'
      collapsible='offcanvas'
      className={cn(
        'bg-base',
        '[--sidebar-width:var(--app-shell-sidebar-width)]',
        // The left rail owns its internal label/icon staging while
        // AppShellFrame owns the adjacent main-plane allocation (#4522).
        'transition-[flex-basis,width,transform,opacity] duration-cinematic ease-cinematic motion-reduce:transition-none',
        // OV brand skin: class-based token override, same mechanism as `.dark`
        // (see design-system.css → OV MODE). Zero layout impact.
        variant === 'ov' && 'ov-mode'
      )}
    >
      <SidebarHeader
        data-electron-drag-region='true'
        className={cn(
          'relative justify-center gap-0 px-2.5',
          'h-(--app-shell-header-height-compact) py-0.5'
        )}
      >
        <SidebarHeaderNav
          isRouteSidebar={isRouteSidebar}
          isOperatorSection={isOperatorSection}
          canSwitchWorkspaces={canSwitchWorkspaces}
          hasMultipleProfiles={hasMultipleProfiles}
          isDemoRoute={isDemoRoute}
          variant={variant}
          routeBackHref={sidebarOverride?.backHref}
          routeBackLabel={sidebarOverride?.backLabel}
        />
      </SidebarHeader>

      <SidebarContent className='min-h-0 flex-1 px-2.5 pb-2.5 pt-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
        <SidebarGroup className='flex min-h-0 flex-1 flex-col pb-1'>
          <SidebarGroupContent className='flex min-h-0 flex-1 flex-col'>
            {section === 'ov' ? (
              <OperatorNavigation pathname={pathname} />
            ) : isInSettings ? (
              <SettingsNavigation pathname={pathname} section={section} />
            ) : sidebarOverride ? (
              sidebarOverride.content
            ) : (
              <DashboardNav>
                <HeaderSearchSurfaceFromContext className='w-full max-w-none sm:w-full lg:w-full' />
              </DashboardNav>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
        <div
          data-sidebar='notifications'
          data-testid='sidebar-notifications'
          className='shrink-0 group-data-[collapsible=icon]:hidden'
        >
          {isDesktop ? (
            <div className='flex px-2 pb-1.5'>
              <UpdateAvailablePill />
            </div>
          ) : (
            <ShellSidebarInstallBanner />
          )}
        </div>
      </SidebarContent>

      {section === 'ov' ? (
        <SidebarFooter className='mt-auto gap-0 px-0 py-0'>
          <OperatorSessionControls />
        </SidebarFooter>
      ) : (
        // SidebarFooter is shrink-0; with the restored full-height flex chain
        // (sidebar peer + shell mount both h-full), SidebarContent's flex-1
        // absorbs free space so media and the protected account panel pin bottom.
        <SidebarFooter className='mt-auto gap-0 px-0 py-0'>
          <SidebarBottomNowPlayingBridge />
          <SidebarIdentityFooter profileHref={profileHref} />
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
