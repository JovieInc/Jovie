'use client';

import { Button } from '@jovie/ui';
import { ArrowLeft, SquarePen } from 'lucide-react';
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
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/organisms/Sidebar';
import { UserButton } from '@/components/organisms/user-button';
import { APP_ROUTES } from '@/constants/routes';
import { cn } from '@/lib/utils';

// Delay before hiding floating sidebar (milliseconds)
const FLOATING_SIDEBAR_HIDE_DELAY_MS = 150;
const TRIGGER_ZONE = 20; // pixels from left edge
const SIDEBAR_WIDTH = 270; // keep visible while over sidebar

export interface UnifiedSidebarProps {
  readonly section: 'admin' | 'dashboard' | 'settings';
  readonly navigation: NavItem[];
}

/**
 * Custom hook to manage floating sidebar visibility on desktop.
 * Uses requestAnimationFrame to throttle mousemove processing to once per frame.
 */
function useFloatingSidebar(isCollapsed: boolean, isMobile: boolean) {
  const [isFloatingVisible, setIsFloatingVisible] = useState(false);

  useEffect(() => {
    if (isMobile || !isCollapsed) {
      setIsFloatingVisible(false);
      return;
    }

    let hideTimeout: ReturnType<typeof setTimeout> | undefined;
    let rafId: number | undefined;
    let latestX = 0;

    const processMousePosition = () => {
      rafId = undefined;
      if (hideTimeout !== undefined) clearTimeout(hideTimeout);

      if (latestX <= TRIGGER_ZONE) {
        setIsFloatingVisible(true);
      } else if (latestX > SIDEBAR_WIDTH) {
        hideTimeout = setTimeout(
          () => setIsFloatingVisible(false),
          FLOATING_SIDEBAR_HIDE_DELAY_MS
        );
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      latestX = e.clientX;
      rafId ??= requestAnimationFrame(processMousePosition);
    };

    document.addEventListener('mousemove', handleMouseMove);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      if (hideTimeout !== undefined) clearTimeout(hideTimeout);
      if (rafId !== undefined) cancelAnimationFrame(rafId);
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

/** Floating sidebar overlay shown on hover when sidebar is collapsed */
function FloatingSidebar({
  isAdmin,
  isDashboardOrAdmin,
  navigation,
  pathname,
  section,
  profileHref,
}: Readonly<{
  isAdmin: boolean;
  isDashboardOrAdmin: boolean;
  navigation: NavItem[];
  pathname: string;
  section: string;
  profileHref: string | undefined;
}>) {
  return (
    <div className='fixed inset-y-0 left-0 z-50 w-[270px] p-3 animate-in slide-in-from-left duration-200'>
      <div className='h-full bg-base border border-subtle rounded-xl shadow-2xl flex flex-col overflow-hidden'>
        {/* Header */}
        <div className='flex h-12 items-center px-2'>
          <UserButton
            profileHref={profileHref}
            settingsHref={APP_ROUTES.SETTINGS}
            trigger={
              <button
                type='button'
                aria-label='Open workspace menu'
                className='flex h-7 items-center gap-1.5 rounded-md px-1 py-0.5 transition-all duration-150 ease-out hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:bg-sidebar-accent'
              >
                <BrandLogo size={16} tone='auto' className='h-4 w-4 shrink-0' />
                <span className='text-sm font-semibold text-sidebar-foreground'>
                  {isAdmin ? 'Admin' : 'Jovie'}
                </span>
              </button>
            }
          />
          {isDashboardOrAdmin && (
            <Link
              href={APP_ROUTES.CHAT}
              aria-label='New thread'
              className='ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-transparent text-sidebar-foreground transition-colors hover:bg-sidebar-accent'
            >
              <SquarePen className='h-4 w-4' />
            </Link>
          )}
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
      </div>
    </div>
  );
}

/**
 * UnifiedSidebar - Single sidebar component for all post-auth sections
 *
 * Header workspace button (logo + name) opens user menu dropdown (Linear-style).
 * Settings section shows a back button instead.
 * No footer — user menu lives in the header.
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
          '[--sidebar-width:250px]',
          'transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]'
        )}
      >
        <SidebarHeader className='relative h-[52px] justify-center gap-0 px-2 py-0'>
          <div className='flex w-full items-center'>
            {/* Logo/Header Area - varies by section */}
            {isInSettings ? (
              // Settings: Back button to dashboard
              <Link
                href={APP_ROUTES.DASHBOARD}
                aria-label='Back to dashboard'
                className={cn(
                  'inline-flex h-7 items-center gap-1.5 rounded-md px-2 py-0.5 text-[13px] font-medium text-sidebar-item-foreground transition-all duration-150 ease-out hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:bg-sidebar-accent',
                  'group-data-[collapsible=icon]:justify-center'
                )}
              >
                <ArrowLeft className='h-4 w-4' aria-hidden='true' />
                <span className='truncate group-data-[collapsible=icon]:hidden'>
                  Back
                </span>
              </Link>
            ) : (
              // Dashboard & Admin: Workspace button opens user menu (Linear-style)
              <UserButton
                profileHref={profileHref}
                settingsHref={APP_ROUTES.SETTINGS}
                trigger={
                  <button
                    type='button'
                    aria-label='Open workspace menu'
                    className={cn(
                      'flex h-7 items-center gap-2 rounded-md px-2 py-0.5 transition-all duration-150 ease-out hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:bg-sidebar-accent',
                      'group-data-[collapsible=icon]:justify-center'
                    )}
                  >
                    <BrandLogo
                      size={16}
                      tone='auto'
                      className='h-4 w-4 shrink-0'
                    />
                    <span className='text-sm font-semibold text-sidebar-foreground group-data-[collapsible=icon]:hidden'>
                      {isAdmin ? 'Admin' : 'Jovie'}
                    </span>
                  </button>
                }
              />
            )}

            {/* Compose icon - Linear-style: starts a new thread */}
            {!isInSettings && isDashboardOrAdmin && (
              <Link
                href={APP_ROUTES.CHAT}
                aria-label='New thread'
                className='ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-transparent text-sidebar-foreground transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:bg-sidebar-accent group-data-[collapsible=icon]:hidden'
              >
                <SquarePen className='h-4 w-4' />
              </Link>
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

        {/* Version + build label */}
        <div className='px-3 pb-2 pt-1 group-data-[collapsible=icon]:hidden'>
          <span className='text-[11px] text-sidebar-muted select-none'>
            v{process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0'}
            {process.env.NEXT_PUBLIC_BUILD_SHA
              ? ` (${process.env.NEXT_PUBLIC_BUILD_SHA})`
              : ''}
          </span>
        </div>

        <SidebarRail />
      </Sidebar>

      {/* Floating sidebar - shows on hover when collapsed */}
      {isCollapsed && !isMobile && isFloatingVisible && (
        <FloatingSidebar
          isAdmin={isAdmin}
          isDashboardOrAdmin={isDashboardOrAdmin}
          navigation={navigation}
          pathname={pathname}
          section={section}
          profileHref={profileHref}
        />
      )}
    </>
  );
}
