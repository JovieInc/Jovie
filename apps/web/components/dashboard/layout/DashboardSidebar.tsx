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
        <div className='group/toggle flex items-center gap-2 px-3 py-2'>
          {isInSettings ? (
            <Link
              href='/app'
              aria-label='Back'
              className={cn(
                'inline-flex h-9 items-center gap-2 rounded-lg px-2.5 py-1 text-[13px] font-medium text-secondary-token transition-all duration-150 ease-out hover:bg-sidebar-accent hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                'group-data-[collapsible=icon]:justify-center'
              )}
            >
              <ArrowLeft className='size-4' aria-hidden='true' />
              <span className='truncate group-data-[collapsible=icon]:hidden'>
                Back
              </span>
            </Link>
          ) : (
            <Link
              href='/app'
              aria-label='Go to dashboard'
              className={cn(
                'flex size-9 items-center justify-center rounded-lg transition-all duration-150 ease-out hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring'
              )}
            >
              <BrandLogo size={16} tone='auto' className='size-5' />
              <span className='sr-only'>Dashboard</span>
            </Link>
          )}
          <div className='group/shortcut ml-auto flex items-center gap-2'>
            <SidebarShortcutHint className='hidden opacity-0 transition-opacity duration-200 lg:inline-flex group-hover/shortcut:opacity-100' />
            <SidebarTrigger
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className={cn(
                'size-8 shrink-0 rounded-lg border border-default bg-bg-surface-1 text-tertiary-token hover:bg-sidebar-accent hover:text-primary-token focus-visible:ring-2 focus-visible:ring-sidebar-ring transition-all duration-150',
                'group-data-[state=closed]:hidden'
              )}
            />
          </div>
        </div>
        {!isInSettings && (
          <div className='px-3 pb-4 pt-3 lg:hidden'>
            <div className='flex items-center gap-3 rounded-xl border border-default bg-bg-surface-1 p-3.5 shadow-sm'>
              <OptimizedAvatar
                src={avatarUrl}
                alt={displayName}
                size={64}
                className='size-12 ring-2 ring-sidebar-accent'
              />
              <div className='min-w-0 flex-1'>
                <p className='truncate text-sm font-semibold text-primary-token'>
                  {displayName}
                </p>
                {username ? (
                  <p className='truncate text-xs text-tertiary-token'>
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
                  className='flex-1 min-h-[44px] rounded-xl'
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
                  className='flex-1 min-h-[44px] rounded-xl'
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
          <div className='px-3 py-3'>
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
