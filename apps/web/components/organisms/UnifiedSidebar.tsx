'use client';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@jovie/ui';
import { ArrowLeft, Copy, RefreshCw, Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { SidebarCollapseButton } from '@/components/molecules/sidebar-collapse-button';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/organisms/Sidebar';
import { UserButton } from '@/components/organisms/user-button';
import { InstallBanner } from '@/components/shell/InstallBanner';
import { BASE_URL } from '@/constants/domains';
import { APP_ROUTES, isDemoRoutePath } from '@/constants/routes';
import { useShellSidebarOverride } from '@/contexts/ShellSidebarOverrideContext';
import { DashboardNav } from '@/features/dashboard/dashboard-nav';
import {
  adminSettingsNavItem,
  artistSettingsNavigation,
  paymentsNavItem,
  userSettingsNavigation,
} from '@/features/dashboard/dashboard-nav/config';
import type { NavItem } from '@/features/dashboard/dashboard-nav/types';
import { SidebarInstallBanner } from '@/features/feedback/SidebarInstallBanner';
import { SidebarUpgradeBanner } from '@/features/feedback/SidebarUpgradeBanner';
import { copyToClipboard } from '@/hooks/useClipboard';
import { useProfileData } from '@/hooks/useProfileData';
import { useIsElectronRuntime } from '@/lib/desktop/electron-bridge';
import { env } from '@/lib/env-client';
import { useAppFlag } from '@/lib/flags/client';
import {
  useVersionMonitor,
  type VersionMismatchInfo,
} from '@/lib/hooks/useVersionMonitor';
import { useDashboardProfileQuery } from '@/lib/queries/useDashboardProfileQuery';
import { cn } from '@/lib/utils';
import { ProfileSwitcher } from './ProfileSwitcher';
import { SidebarBottomNowPlayingBridge } from './SidebarBottomNowPlayingBridge';

export interface UnifiedSidebarProps {
  readonly section: 'admin' | 'dashboard' | 'library' | 'settings';
}

const VERSION_DISMISSAL_KEY = 'jovie-version-update-dismissed';
const VERSION_NOTIFICATION_DELAY_MS = 10_000;

/** Render a group of nav items */
function SettingsNavGroup({
  items,
  pathname,
}: Readonly<{
  items: NavItem[];
  pathname: string;
}>) {
  return (
    <SidebarMenu>
      {items.map(item => {
        const isActive =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
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
                    toast.success('Link copied to clipboard');
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

/** Navigation list for settings section — grouped with labels like Linear */
function SettingsNavigation({
  pathname,
  section,
}: {
  pathname: string;
  section: string;
}) {
  const { selectedProfile, isAdmin } = useDashboardData();
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
        <span className='mb-1.5 block px-2.5 text-2xs uppercase tracking-[0.08em] text-sidebar-muted group-data-[collapsible=icon]:hidden [font-weight:var(--font-weight-nav)]'>
          Account
        </span>
        <SettingsNavGroup items={userItems} pathname={pathname} />
      </div>
      <div>
        <span className='mb-1.5 block px-2.5 text-2xs uppercase tracking-[0.08em] text-sidebar-muted group-data-[collapsible=icon]:hidden [font-weight:var(--font-weight-nav)]'>
          Artist
        </span>
        <SettingsNavGroup items={artistItems} pathname={pathname} />
      </div>
      {isAdmin && (
        <div>
          <span className='mb-1.5 block px-2.5 text-2xs uppercase tracking-[0.08em] text-sidebar-muted group-data-[collapsible=icon]:hidden [font-weight:var(--font-weight-nav)]'>
            Administration
          </span>
          <SettingsNavGroup
            items={[adminSettingsNavItem]}
            pathname={pathname}
          />
        </div>
      )}
    </nav>
  );
}

/** Logo (clean header) or back button for settings/library */
function SidebarHeaderNav({
  isRouteSidebar,
  isAdmin,
  hasMultipleProfiles,
  isDemoRoute,
  routeBackHref = APP_ROUTES.DASHBOARD,
  routeBackLabel = 'Back to App',
}: Readonly<{
  isRouteSidebar: boolean;
  isAdmin: boolean;
  hasMultipleProfiles: boolean;
  isDemoRoute: boolean;
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
                  'inline-flex h-6 shrink-0 items-center gap-1 rounded-lg px-2 text-xs text-sidebar-item-foreground transition-[background,border-color,color] duration-normal ease-interactive hover:bg-sidebar-accent/55 hover:text-sidebar-item-foreground focus-visible:outline-none focus-visible:bg-sidebar-accent/55 focus-visible:text-sidebar-item-foreground [font-weight:var(--font-weight-nav)]',
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
        if (hasMultipleProfiles && !isAdmin) {
          return <ProfileSwitcher />;
        }
        // Clean header: Jovie logo + wordmark for identity (matches Linear's
        // workspace pill pattern). User menu lives in the bottom Settings button.
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
              rounded={false}
              className='rounded-sm shrink-0'
            />
            <span className='truncate text-app tracking-tight text-sidebar-item-foreground [font-weight:var(--font-weight-nav)] group-data-[collapsible=icon]:hidden'>
              Jovie
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

  const title = versionUpdate.newVersion
    ? `New Version Available (v${versionUpdate.newVersion})`
    : 'New Version Available';

  return (
    <InstallBanner
      open
      icon={RefreshCw}
      title={title}
      description='An improved version of Jovie is available. Reload to update.'
      ctaLabel='Reload'
      ctaIcon={RefreshCw}
      onCta={reload}
      onDismiss={dismissVersionUpdate}
      className='group-data-[collapsible=icon]:hidden'
    />
  );
}

/**
 * UnifiedSidebar - Single sidebar component for all post-auth sections
 *
 * Header now shows a clean Jovie logo only (no workspace/user button).
 * The user menu (with profile, settings, billing, sign out, etc.) is opened
 * via a native "Settings" button at the bottom of the sidebar (above Now Playing).
 * The version string (vX.Y.Z + optional sha) is now rendered inside the user
 * menu (visible to everyone) instead of the previous admin-only footer.
 */
export function UnifiedSidebar({ section }: UnifiedSidebarProps) {
  const { creatorProfiles } = useDashboardData();
  const shellChatV1Enabled = useAppFlag('DESIGN_V1');
  const sidebarOverride = useShellSidebarOverride();
  const pathname = usePathname();
  const isDemoRoute = isDemoRoutePath(pathname);
  const isInSettings = section === 'settings';
  const isAdmin = section === 'admin';
  const isInLibrary = section === 'library';
  const isRouteSidebar = isInSettings || isInLibrary;
  const isDashboardOrAdmin = section === 'dashboard' || section === 'admin';
  const hasMultipleProfiles = creatorProfiles.length >= 2;

  const { profileHref } = useProfileData(isDashboardOrAdmin);

  return (
    <Sidebar
      variant='sidebar'
      collapsible='offcanvas'
      className={cn(
        'bg-base',
        '[--sidebar-width:var(--linear-app-sidebar-width)]',
        'transition-[width,transform] duration-cinematic ease-cinematic'
      )}
    >
      <SidebarHeader
        data-electron-drag-region='true'
        className={cn(
          'relative justify-center gap-0 px-2.5',
          'h-(--linear-app-header-height-compact) py-0.5'
        )}
      >
        <SidebarHeaderNav
          isRouteSidebar={isRouteSidebar}
          isAdmin={isAdmin}
          hasMultipleProfiles={hasMultipleProfiles}
          isDemoRoute={isDemoRoute}
          routeBackHref={sidebarOverride?.backHref}
          routeBackLabel={sidebarOverride?.backLabel}
        />
      </SidebarHeader>

      <SidebarContent className='min-h-0 flex-1 px-2.5 pb-2.5 pt-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
        <SidebarGroup className='flex min-h-0 flex-1 flex-col pb-1'>
          <SidebarGroupContent className='flex-1'>
            {isInSettings ? (
              <SettingsNavigation pathname={pathname} section={section} />
            ) : isInLibrary ? (
              (sidebarOverride?.content ?? null)
            ) : (
              <DashboardNav />
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {isRouteSidebar ? null : (
        <div className='mt-auto shrink-0'>
          {/* Bottom Settings button opens the existing user menu via UserButton.
              Uses Sidebar atoms for native feel (icon + label, tooltip in icon mode).
              Placed above Now Playing / audio area. */}
          <div className='px-2.5 py-0.5'>
            <SidebarMenu>
              <SidebarMenuItem>
                <UserButton
                  profileHref={profileHref}
                  settingsHref={APP_ROUTES.SETTINGS}
                  trigger={
                    <SidebarMenuButton tooltip='Settings'>
                      <Settings className='size-3.5' />
                      <span className='truncate group-data-[collapsible=icon]:hidden'>
                        Settings
                      </span>
                    </SidebarMenuButton>
                  }
                />
              </SidebarMenuItem>
            </SidebarMenu>
          </div>

          <SidebarBottomNowPlayingBridge />
          {isDemoRoute ? null : <SidebarUpgradeBanner />}
          {shellChatV1Enabled ? (
            <ShellSidebarInstallBanner />
          ) : (
            <SidebarInstallBanner />
          )}
        </div>
      )}
    </Sidebar>
  );
}
