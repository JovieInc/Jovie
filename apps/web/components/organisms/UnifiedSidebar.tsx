'use client';

import { Button } from '@jovie/ui';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { CopyToClipboardButton } from '@/components/dashboard/atoms/CopyToClipboardButton';
import { DashboardNav } from '@/components/dashboard/dashboard-nav';
import type { NavItem } from '@/components/dashboard/dashboard-nav/types';
import { OptimizedAvatar } from '@/components/molecules/OptimizedAvatar';
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
  SidebarRail,
  SidebarShortcutHint,
  SidebarTrigger,
  useSidebar,
} from '@/components/organisms/Sidebar';
import { UserButton } from '@/components/organisms/user-button';
import { cn } from '@/lib/utils';

// Delay before hiding floating sidebar (milliseconds)
const FLOATING_SIDEBAR_HIDE_DELAY_MS = 150;
const TRIGGER_ZONE = 20; // pixels from left edge
const SIDEBAR_WIDTH = 250; // keep visible while over sidebar

export interface UnifiedSidebarProps {
  readonly section: 'admin' | 'dashboard' | 'settings';
  readonly navigation: NavItem[];
}

/**
 * Custom hook to manage floating sidebar visibility on desktop
 */
function useFloatingSidebar(isCollapsed: boolean, isMobile: boolean) {
  const [isFloatingVisible, setIsFloatingVisible] = useState(false);

  useEffect(() => {
    if (isMobile || !isCollapsed) {
      setIsFloatingVisible(false);
      return;
    }

    let hideTimeout: ReturnType<typeof setTimeout> | undefined;

    const handleMouseMove = (e: MouseEvent) => {
      if (hideTimeout !== undefined) clearTimeout(hideTimeout);

      if (e.clientX <= TRIGGER_ZONE) {
        setIsFloatingVisible(true);
      } else if (e.clientX > SIDEBAR_WIDTH) {
        hideTimeout = setTimeout(
          () => setIsFloatingVisible(false),
          FLOATING_SIDEBAR_HIDE_DELAY_MS
        );
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      if (hideTimeout !== undefined) clearTimeout(hideTimeout);
    };
  }, [isCollapsed, isMobile]);

  return isFloatingVisible;
}

/**
 * Extract profile data from dashboard context
 */
function useProfileData(isDashboardOrAdmin: boolean) {
  const dashboardDataRaw = useDashboardData();
  const dashboardData = isDashboardOrAdmin ? dashboardDataRaw : null;

  const username = dashboardData
    ? (dashboardData.selectedProfile?.usernameNormalized ??
      dashboardData.selectedProfile?.username)
    : undefined;

  return {
    username,
    profileHref: username ? `/${username}` : undefined,
    displayName: dashboardData
      ? dashboardData.selectedProfile?.displayName?.trim() ||
        dashboardData.selectedProfile?.username ||
        'Your profile'
      : 'Your profile',
    avatarUrl: dashboardData?.selectedProfile?.avatarUrl,
  };
}

/** Navigation list for settings section */
function SettingsNavigation({
  navigation,
  pathname,
  section,
}: {
  navigation: NavItem[];
  pathname: string;
  section: string;
}) {
  return (
    <nav
      aria-label={`${section} navigation`}
      className='flex flex-1 flex-col overflow-hidden'
    >
      <SidebarMenu>
        {navigation.map(item => {
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <SidebarMenuItem key={item.id}>
              <SidebarMenuButton
                asChild
                isActive={isActive}
                className='font-medium'
              >
                <Link
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className='flex w-full min-w-0 items-center gap-3'
                >
                  <item.icon className='size-4' />
                  <span className='truncate'>{item.name}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </nav>
  );
}

/**
 * UnifiedSidebar - Single sidebar component for all post-auth sections
 *
 * Adapts dynamically based on section:
 * - Admin: Shows "Admin Console" label
 * - Settings: Shows back button to dashboard
 * - Dashboard: Shows just logo
 *
 * Footer shows:
 * - Admin: (no footer - cleaner interface)
 * - Dashboard: Branding card + UserButton
 * - Settings: (no footer)
 *
 * Replaces: DashboardSidebar, AdminSidebar
 */
export function UnifiedSidebar({ section, navigation }: UnifiedSidebarProps) {
  const { state, isMobile } = useSidebar();
  const isCollapsed = state === 'closed';
  const pathname = usePathname();
  const isInSettings = section === 'settings';
  const isDashboard = section === 'dashboard';
  const isAdmin = section === 'admin';
  const isDashboardOrAdmin = isDashboard || isAdmin;

  const isFloatingVisible = useFloatingSidebar(isCollapsed, isMobile);
  const { username, profileHref, displayName, avatarUrl } =
    useProfileData(isDashboardOrAdmin);

  return (
    <>
      <Sidebar
        variant='sidebar'
        collapsible='offcanvas'
        className={cn(
          'bg-base',
          '[--sidebar-width:240px]',
          'transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]'
        )}
      >
        <SidebarHeader className='relative pb-0'>
          <div className='group/toggle flex items-center gap-2 px-2 py-1'>
            {/* Logo/Header Area - varies by section */}
            {isInSettings ? (
              // Settings: Back button to dashboard
              <Link
                href='/app'
                aria-label='Back to dashboard'
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-md px-2 py-0.5 text-[13px] font-medium transition-all duration-150 ease-out hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                  'group-data-[collapsible=icon]:justify-center'
                )}
              >
                <ArrowLeft className='h-4 w-4' aria-hidden='true' />
                <span className='truncate group-data-[collapsible=icon]:hidden'>
                  Back
                </span>
              </Link>
            ) : (
              // Dashboard & Admin: Just logo
              <Link
                href={isAdmin ? '/app/admin' : '/app'}
                aria-label={isAdmin ? 'Go to admin' : 'Go to dashboard'}
                className={cn(
                  'flex h-7 flex-1 items-center gap-2 rounded-md px-1 py-0.5 transition-all duration-150 ease-out hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                  'group-data-[collapsible=icon]:justify-center'
                )}
              >
                <div className='flex items-center justify-center'>
                  <BrandLogo size={16} tone='auto' className='h-4 w-4' />
                </div>
                <span className='text-[13px] font-semibold text-sidebar-foreground group-data-[collapsible=icon]:hidden'>
                  {isAdmin ? 'Admin' : 'Jovie'}
                </span>
              </Link>
            )}

            {/* Collapse trigger - show for dashboard/admin, not settings */}
            {!isInSettings && (
              <div className='group/shortcut ml-auto flex items-center gap-2'>
                <SidebarShortcutHint className='hidden opacity-0 transition-opacity duration-200 lg:inline-flex group-hover/shortcut:opacity-100' />
                <SidebarTrigger
                  aria-label={
                    isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'
                  }
                  className={cn(
                    'h-8 w-8 shrink-0 rounded-md border border-transparent bg-transparent text-primary-token/80 dark:text-secondary-token transition-colors hover:border-subtle hover:bg-surface-2 hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive',
                    'group-data-[state=closed]:hidden'
                  )}
                />
              </div>
            )}
          </div>

          {/* Mobile profile card - for dashboard and admin */}
          {isDashboardOrAdmin && (
            <div className='px-2 pb-3 pt-2 lg:hidden'>
              <div className='flex items-center gap-3 rounded-lg border border-sidebar-border bg-sidebar/40 p-3'>
                <OptimizedAvatar
                  src={avatarUrl}
                  alt={displayName}
                  size={64}
                  className='h-10 w-10'
                />
                <div className='min-w-0'>
                  <p className='truncate text-sm font-semibold text-sidebar-foreground'>
                    {displayName}
                  </p>
                  {username ? (
                    <p className='truncate text-xs text-sidebar-muted'>
                      @{username}
                    </p>
                  ) : null}
                </div>
              </div>
              {profileHref ? (
                <div className='mt-3 flex items-center gap-2'>
                  <Button
                    asChild
                    size='sm'
                    variant='secondary'
                    className='flex-1 min-h-[44px]'
                  >
                    <Link
                      href={profileHref}
                      target='_blank'
                      rel='noopener noreferrer'
                    >
                      View profile
                    </Link>
                  </Button>
                  <CopyToClipboardButton
                    relativePath={profileHref}
                    idleLabel='Copy link'
                    successLabel='Copied'
                    errorLabel='Copy failed'
                    className='flex-1 min-h-[44px]'
                  />
                </div>
              ) : null}
            </div>
          )}
        </SidebarHeader>

        {/* Navigation Content */}
        <SidebarContent className='flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-2'>
          <SidebarGroup className='flex min-h-0 flex-1 flex-col pb-1'>
            <SidebarGroupContent className='flex-1'>
              {isDashboardOrAdmin ? (
                <DashboardNav />
              ) : (
                <SettingsNavigation
                  navigation={navigation}
                  pathname={pathname}
                  section={section}
                />
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        {/* Footer - for dashboard and admin (branding + user button) */}
        {isDashboardOrAdmin && (
          <SidebarFooter className='mt-auto'>
            <div className='px-2 py-2'>
              <div
                className={cn(
                  isCollapsed
                    ? 'flex items-center justify-center'
                    : 'flex items-center'
                )}
              >
                <UserButton
                  showUserInfo={!isCollapsed}
                  profileHref={profileHref}
                  settingsHref='/app/settings'
                />
              </div>
            </div>
          </SidebarFooter>
        )}

        <SidebarRail />
      </Sidebar>

      {/* Floating sidebar - shows on hover when collapsed */}
      {isCollapsed && !isMobile && isFloatingVisible && (
        <div className='fixed inset-y-0 left-0 z-50 w-[240px] p-3 animate-in slide-in-from-left duration-200'>
          <div className='h-full bg-base border border-subtle rounded-xl shadow-2xl flex flex-col overflow-hidden'>
            {/* Header */}
            <div className='relative pb-0 p-2'>
              <div className='flex items-center gap-2 py-1'>
                <Link
                  href={isAdmin ? '/app/admin' : '/app'}
                  aria-label={isAdmin ? 'Go to admin' : 'Go to dashboard'}
                  className='flex h-7 flex-1 items-center gap-2 rounded-md px-1 py-0.5 transition-all duration-150 ease-out hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                >
                  <div className='flex items-center justify-center'>
                    <BrandLogo size={16} tone='auto' className='h-4 w-4' />
                  </div>
                  <span className='text-[13px] font-semibold text-sidebar-foreground'>
                    {isAdmin ? 'Admin' : 'Jovie'}
                  </span>
                </Link>
              </div>
            </div>

            {/* Content */}
            <div className='flex-1 overflow-y-auto px-2'>
              {isDashboardOrAdmin ? (
                <DashboardNav />
              ) : (
                <SettingsNavigation
                  navigation={navigation}
                  pathname={pathname}
                  section={section}
                />
              )}
            </div>

            {/* Footer */}
            {isDashboardOrAdmin && (
              <div className='mt-auto'>
                <div className='px-2 py-2'>
                  <UserButton
                    showUserInfo={true}
                    profileHref={profileHref}
                    settingsHref='/app/settings'
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
