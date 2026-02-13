'use client';

import { Button } from '@jovie/ui';
import { ArrowLeft, SquarePen } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { DashboardNav } from '@/components/dashboard/dashboard-nav';
import {
  artistSettingsNavigation,
  userSettingsNavigation,
} from '@/components/dashboard/dashboard-nav/config';
import type { NavItem } from '@/components/dashboard/dashboard-nav/types';
import { CopyToClipboardButton } from '@/components/dashboard/molecules/CopyToClipboardButton';
import { Avatar } from '@/components/molecules/Avatar';
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

export interface UnifiedSidebarProps {
  readonly section: 'admin' | 'dashboard' | 'settings';
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

/** Render a group of nav items */
function SettingsNavGroup({
  items,
  pathname,
}: {
  items: NavItem[];
  pathname: string;
}) {
  return (
    <SidebarMenu>
      {items.map(item => {
        const isActive =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <SidebarMenuItem key={item.id}>
            <SidebarMenuButton
              asChild
              isActive={isActive}
              tooltip={item.name}
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
  return (
    <nav
      aria-label={`${section} navigation`}
      className='flex flex-1 flex-col gap-3 overflow-hidden'
    >
      <SettingsNavGroup items={userSettingsNavigation} pathname={pathname} />
      <div className='mx-2 border-t border-sidebar-border group-data-[collapsible=icon]:mx-0' />
      <div>
        <span className='mb-1 block px-2 text-[11px] font-medium text-sidebar-muted group-data-[collapsible=icon]:hidden'>
          Artist
        </span>
        <SettingsNavGroup
          items={artistSettingsNavigation}
          pathname={pathname}
        />
      </div>
    </nav>
  );
}

/** Mobile profile card shown in sidebar on small screens */
function MobileProfileCard({
  displayName,
  username,
  avatarUrl,
  profileHref,
}: Readonly<{
  displayName: string;
  username: string | undefined;
  avatarUrl: string | null | undefined;
  profileHref: string | undefined;
}>) {
  return (
    <div className='px-2 pb-3 pt-2 lg:hidden'>
      <div className='flex items-center gap-3 rounded-lg border border-sidebar-border bg-sidebar/40 p-3'>
        <Avatar
          src={avatarUrl}
          alt={displayName}
          name={displayName}
          size='lg'
          className='h-10 w-10'
        />
        <div className='min-w-0'>
          <p className='truncate text-sm font-semibold text-sidebar-foreground'>
            {displayName}
          </p>
          {username ? (
            <p className='truncate text-xs text-sidebar-muted'>@{username}</p>
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
            <Link href={profileHref} target='_blank' rel='noopener noreferrer'>
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
  );
}

/** Workspace button (logo + name) or back button for settings */
function SidebarHeaderNav({
  isInSettings,
  isAdmin,
  isDashboardOrAdmin,
  profileHref,
}: Readonly<{
  isInSettings: boolean;
  isAdmin: boolean;
  isDashboardOrAdmin: boolean;
  profileHref: string | undefined;
}>) {
  return (
    <div className='flex w-full items-center'>
      {isInSettings ? (
        <Link
          href={APP_ROUTES.DASHBOARD}
          aria-label='Back to dashboard'
          className={cn(
            'inline-flex h-7 items-center gap-1.5 rounded-md px-2 py-0.5 text-[13px] font-medium text-sidebar-item-foreground transition-all duration-150 ease-out hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:bg-sidebar-accent',
            'group-data-[collapsible=icon]:justify-center'
          )}
        >
          <ArrowLeft className='size-4' aria-hidden='true' />
          <span className='truncate group-data-[collapsible=icon]:hidden'>
            Back to app
          </span>
        </Link>
      ) : (
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
              <BrandLogo size={16} tone='auto' className='size-4 shrink-0' />
              <span className='text-sm font-semibold text-sidebar-foreground group-data-[collapsible=icon]:hidden'>
                {isAdmin ? 'Admin' : 'Jovie'}
              </span>
            </button>
          }
        />
      )}

      {!isInSettings && isDashboardOrAdmin && (
        <Link
          href={APP_ROUTES.CHAT}
          aria-label='New thread'
          className='ml-auto flex size-7 shrink-0 items-center justify-center rounded-md bg-transparent text-sidebar-foreground transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:bg-sidebar-accent group-data-[collapsible=icon]:hidden'
        >
          <SquarePen className='size-4' />
        </Link>
      )}
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
export function UnifiedSidebar({ section }: UnifiedSidebarProps) {
  const { state, isMobile, setOpen } = useSidebar();
  const isCollapsed = state === 'closed';
  const pathname = usePathname();
  const isInSettings = section === 'settings';
  const isAdmin = section === 'admin';
  const isDashboardOrAdmin = section !== 'settings';

  const { username, profileHref, displayName, avatarUrl } =
    useProfileData(isDashboardOrAdmin);

  return (
    <Sidebar
      variant='sidebar'
      collapsible='icon'
      className={cn(
        'bg-base',
        '[--sidebar-width:220px]',
        'transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]'
      )}
    >
      <SidebarHeader className='relative h-[52px] justify-center gap-0 px-2 py-0'>
        <SidebarHeaderNav
          isInSettings={isInSettings}
          isAdmin={isAdmin}
          isDashboardOrAdmin={isDashboardOrAdmin}
          profileHref={profileHref}
        />
        {isDashboardOrAdmin && (
          <MobileProfileCard
            displayName={displayName}
            username={username}
            avatarUrl={avatarUrl}
            profileHref={profileHref}
          />
        )}
      </SidebarHeader>

      <SidebarContent className='flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-2'>
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

      <div className='px-3 pb-2 pt-1 group-data-[collapsible=icon]:hidden'>
        <span className='text-[11px] text-sidebar-muted select-none'>
          v{process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0'}
          {process.env.NEXT_PUBLIC_BUILD_SHA
            ? ` (${process.env.NEXT_PUBLIC_BUILD_SHA})`
            : ''}
        </span>
      </div>

      <SidebarRail />

      {isCollapsed && !isMobile && (
        <button
          type='button'
          aria-label='Expand sidebar'
          onClick={() => setOpen(true)}
          className='absolute inset-0 z-10 cursor-pointer bg-transparent'
          style={{ pointerEvents: 'auto' }}
        />
      )}
    </Sidebar>
  );
}
