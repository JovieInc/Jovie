'use client';

import { Button } from '@jovie/ui';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentPropsWithoutRef } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { CopyToClipboardButton } from '@/components/dashboard/atoms/CopyToClipboardButton';
import { DashboardNav } from '@/components/dashboard/dashboard-nav';
import { OptimizedAvatar } from '@/components/molecules/OptimizedAvatar';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarRail,
  SidebarSeparator,
  SidebarShortcutHint,
  SidebarTrigger,
  useSidebar,
} from '@/components/organisms/Sidebar';
import { UserButton } from '@/components/organisms/user-button';
import { cn } from '@/lib/utils';

type SidebarRootProps = ComponentPropsWithoutRef<typeof Sidebar>;

export type DashboardSidebarProps = Omit<SidebarRootProps, 'children'>;

export function DashboardSidebar({
  className,
  ...props
}: DashboardSidebarProps) {
  const { state } = useSidebar();
  const isCollapsed = state === 'closed';
  const pathname = usePathname();
  const isInSettings = pathname.startsWith('/app/settings');

  const dashboardData = useDashboardData();
  const username =
    dashboardData.selectedProfile?.usernameNormalized ??
    dashboardData.selectedProfile?.username;
  const profileHref = username ? `/${username}` : undefined;
  const displayName =
    dashboardData.selectedProfile?.displayName?.trim() ||
    dashboardData.selectedProfile?.username ||
    'Your profile';
  const avatarUrl = dashboardData.selectedProfile?.avatarUrl;

  return (
    <Sidebar
      variant='sidebar'
      collapsible='icon'
      className={cn(
        '[--sidebar-width:244px]',
        '[--sidebar-width-icon:0px]',
        'transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]',
        className
      )}
      {...props}
    >
      <SidebarHeader className='relative pb-0'>
        <div className='group/toggle flex items-center gap-2 px-2 py-1'>
          {isInSettings ? (
            <Link
              href='/app'
              aria-label='Back'
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
            <Link
              href='/app'
              aria-label='Go to dashboard'
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-md transition-all duration-150 ease-out hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring'
              )}
            >
              <BrandLogo size={16} tone='auto' className='h-5 w-5' />
              <span className='sr-only'>Dashboard</span>
            </Link>
          )}
          <div className='group/shortcut ml-auto flex items-center gap-2'>
            <SidebarShortcutHint className='hidden opacity-0 transition-opacity duration-200 lg:inline-flex group-hover/shortcut:opacity-100' />
            <SidebarTrigger
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className={cn(
                'h-8 w-8 shrink-0 border border-sidebar-border bg-sidebar/70 text-secondary-token hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                'group-data-[state=closed]:hidden'
              )}
            />
          </div>
        </div>
        {!isInSettings && (
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

      <SidebarContent className='flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
        <SidebarGroup className='flex min-h-0 flex-1 flex-col pb-1'>
          <SidebarGroupContent className='flex-1'>
            <DashboardNav />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {!isInSettings && (
        <SidebarFooter className='mt-auto'>
          <SidebarSeparator className='mx-0' />
          <div className='px-2 py-3'>
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
  );
}
