'use client';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@jovie/ui';
import {
  ArrowLeft,
  ChevronDown,
  Copy,
  Download,
  RefreshCw,
  SquarePen,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { BrandLogo } from '@/components/atoms/BrandLogo';
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
import { Tooltip } from '@/components/shell/Tooltip';
import { BASE_URL } from '@/constants/domains';
import { APP_ROUTES, isDemoRoutePath } from '@/constants/routes';
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
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { env } from '@/lib/env-client';
import { useAppFlag } from '@/lib/flags/client';
import { TOAST_MESSAGES } from '@/lib/hooks/useNotifications';
import {
  useVersionMonitor,
  type VersionMismatchInfo,
} from '@/lib/hooks/useVersionMonitor';
import { useDashboardProfileQuery } from '@/lib/queries/useDashboardProfileQuery';
import { usePlanGate } from '@/lib/queries/usePlanGate';
import { cn } from '@/lib/utils';
import { ProfileSwitcher } from './ProfileSwitcher';
import { SidebarBottomNowPlayingBridge } from './SidebarBottomNowPlayingBridge';

export interface UnifiedSidebarProps {
  readonly section: 'admin' | 'dashboard' | 'settings';
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

/** Workspace button (logo + name) or back button for settings */
function SidebarHeaderNav({
  isInSettings,
  isAdmin,
  isDashboardOrAdmin,
  profileHref,
  hasMultipleProfiles,
  isDemoRoute,
}: Readonly<{
  isInSettings: boolean;
  isAdmin: boolean;
  isDashboardOrAdmin: boolean;
  profileHref: string | undefined;
  hasMultipleProfiles: boolean;
  isDemoRoute: boolean;
}>) {
  const shellChatV1Enabled = useAppFlag('DESIGN_V1');
  const newThreadLink = (
    <Link
      href={APP_ROUTES.CHAT}
      aria-label='New thread'
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-[10px] bg-transparent text-sidebar-item-icon transition-[background,color] duration-normal ease-interactive hover:bg-sidebar-accent/60 hover:text-sidebar-item-foreground focus-visible:outline-none focus-visible:bg-sidebar-accent/60 focus-visible:text-sidebar-item-foreground',
        !shellChatV1Enabled && 'ml-auto group-data-[collapsible=icon]:hidden'
      )}
    >
      <SquarePen className='size-3' />
    </Link>
  );

  return (
    <div className='flex w-full items-center'>
      {(() => {
        if (isInSettings) {
          return (
            <div className='flex w-full items-center gap-2'>
              <Link
                href={APP_ROUTES.DASHBOARD}
                aria-label='Back to App'
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
                  Back to App
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
        return (
          <UserButton
            profileHref={profileHref}
            settingsHref={APP_ROUTES.SETTINGS}
            trigger={
              <button
                type='button'
                aria-label='Open workspace menu'
                className={cn(
                  'flex h-7 w-full items-center gap-1.5 rounded-[10px] px-2.5 transition-[background,border-color,color] duration-normal ease-interactive hover:bg-sidebar-accent/60 focus-visible:outline-none focus-visible:bg-sidebar-accent/60',
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
                  {isAdmin ? 'Admin' : 'Jovie'}
                </span>
                <ChevronDown
                  className='size-2.5 shrink-0 text-sidebar-item-icon group-data-[collapsible=icon]:hidden'
                  aria-hidden='true'
                />
              </button>
            }
          />
        );
      })()}

      {!isInSettings &&
        isDashboardOrAdmin &&
        (shellChatV1Enabled ? (
          <Tooltip
            label='New thread'
            side='bottom'
            className='ml-auto group-data-[collapsible=icon]:hidden'
          >
            {newThreadLink}
          </Tooltip>
        ) : (
          newThreadLink
        ))}
    </div>
  );
}

function ShellSidebarInstallBanner() {
  const isPassiveRuntime = env.IS_TEST || env.IS_E2E;
  const { isPro, isTrialing } = usePlanGate();
  const isPaidPro = isPro && !isTrialing;
  const pwaInstallEnabled = useAppFlag('PWA_INSTALL_BANNER');
  const { canPrompt, isIOS, install, dismiss: dismissPwa } = usePWAInstall();
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

  if (showVersionBanner && versionUpdate) {
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

  if (!pwaInstallEnabled || !isPaidPro || !canPrompt) return null;

  return (
    <InstallBanner
      open
      icon={Download}
      title={TOAST_MESSAGES.PWA_INSTALL}
      description={
        isIOS
          ? TOAST_MESSAGES.PWA_INSTALL_IOS
          : TOAST_MESSAGES.PWA_INSTALL_DESCRIPTION
      }
      ctaLabel={isIOS ? 'Dismiss' : 'Install'}
      ctaIcon={isIOS ? null : Download}
      onCta={isIOS ? dismissPwa : install}
      onDismiss={dismissPwa}
      className='group-data-[collapsible=icon]:hidden'
    />
  );
}

/**
 * UnifiedSidebar - Single sidebar component for all post-auth sections
 *
 * Header workspace button (logo + name) opens user menu dropdown (Linear-style).
 * Settings section shows a back button instead.
 * No footer — user menu lives in the header.
 */
export function UnifiedSidebar({ section }: UnifiedSidebarProps) {
  const { isAdmin: isUserAdmin, creatorProfiles } = useDashboardData();
  const shellChatV1Enabled = useAppFlag('DESIGN_V1');
  const pathname = usePathname();
  const isDemoRoute = isDemoRoutePath(pathname);
  const isInSettings = section === 'settings';
  const isAdmin = section === 'admin';
  const isDashboardOrAdmin = section !== 'settings';
  const hasMultipleProfiles = creatorProfiles.length >= 2;

  const { profileHref } = useProfileData(isDashboardOrAdmin);

  return (
    <Sidebar
      variant='sidebar'
      collapsible='offcanvas'
      className={cn(
        'bg-base',
        '[--sidebar-width:var(--linear-app-sidebar-width)]',
        'transition-[width,transform] duration-normal ease-interactive'
      )}
    >
      <SidebarHeader
        className={cn(
          'relative justify-center gap-0 px-2.5',
          'h-(--linear-app-header-height-compact) py-0.5'
        )}
      >
        <SidebarHeaderNav
          isInSettings={isInSettings}
          isAdmin={isAdmin}
          isDashboardOrAdmin={isDashboardOrAdmin}
          profileHref={profileHref}
          hasMultipleProfiles={hasMultipleProfiles}
          isDemoRoute={isDemoRoute}
        />
      </SidebarHeader>

      <SidebarContent className='min-h-0 flex-1 px-2.5 pb-2.5 pt-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
        <SidebarGroup className='flex min-h-0 flex-1 flex-col pb-1'>
          <SidebarGroupContent className='flex-1'>
            {isDashboardOrAdmin ? (
              <DashboardNav />
            ) : (
              <SettingsNavigation pathname={pathname} section={section} />
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {isInSettings ? null : (
        <div className='mt-auto shrink-0'>
          <SidebarBottomNowPlayingBridge />
          {isDemoRoute ? null : <SidebarUpgradeBanner />}
          {shellChatV1Enabled ? (
            <ShellSidebarInstallBanner />
          ) : (
            <SidebarInstallBanner />
          )}

          {isUserAdmin && (
            <div className='pl-2 pr-3.5 pb-2 pt-1'>
              <span className='text-2xs text-sidebar-muted select-none'>
                v{process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0'}
                {process.env.NEXT_PUBLIC_BUILD_SHA
                  ? ` (${process.env.NEXT_PUBLIC_BUILD_SHA})`
                  : ''}
              </span>
            </div>
          )}
        </div>
      )}
    </Sidebar>
  );
}
