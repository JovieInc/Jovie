import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentPropsWithoutRef } from 'react';
import { useDashboardData } from '@/app/app/dashboard/DashboardDataContext';
import { DashboardNav } from '@/components/dashboard/DashboardNav';
import { DashboardRemoveBrandingCard } from '@/components/dashboard/molecules/DashboardRemoveBrandingCard';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from '@/components/organisms/Sidebar';
import { UserButton } from '@/components/organisms/UserButton';
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

  return (
    <Sidebar
      variant='sidebar'
      collapsible='icon'
      className={cn(
        '[--sidebar-width:236px]',
        '[--sidebar-width-icon:56px]',
        'transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]',
        className
      )}
      {...props}
    >
      <SidebarHeader className='relative pb-0'>
        <div className='group/toggle flex items-center gap-2 px-2 py-1'>
          {isInSettings ? (
            <Link
              href='/app/dashboard/overview'
              aria-label='Back'
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-md px-2 py-0.5 text-[13px] font-medium transition-all duration-150 ease-out hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                'group-data-[collapsible=icon]:justify-center'
              )}
            >
              <ArrowLeftIcon className='h-4 w-4' aria-hidden='true' />
              <span className='truncate group-data-[collapsible=icon]:hidden'>
                Back
              </span>
            </Link>
          ) : (
            <Link
              href='/app/dashboard/overview'
              aria-label='Go to dashboard'
              className={cn(
                'flex h-9 flex-1 items-center gap-3 rounded-md px-1 py-1 transition-all duration-150 ease-out hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                'group-data-[collapsible=icon]:justify-center'
              )}
            >
              <div className='flex items-center justify-center'>
                <Image
                  src='/brand/Jovie-Logo-Icon.svg'
                  alt='Jovie'
                  width={20}
                  height={20}
                  className='h-7 w-7 rounded-full'
                />
              </div>
              <span className='sr-only group-data-[collapsible=icon]:hidden'>
                Dashboard
              </span>
            </Link>
          )}
          <SidebarTrigger
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cn(
              'ml-auto h-8 w-8 shrink-0 border border-sidebar-border bg-sidebar/70 text-secondary-token hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring',
              'group-data-[state=closed]:hidden'
            )}
          />
        </div>
      </SidebarHeader>

      <SidebarContent className='flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
        <SidebarGroup className='flex min-h-0 flex-1 flex-col pb-1'>
          <SidebarGroupContent className='flex-1'>
            <DashboardNav />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className='mt-auto'>
        <SidebarSeparator className='mx-0' />
        <div className='px-2 pt-3 group-data-[collapsible=icon]:hidden'>
          <DashboardRemoveBrandingCard />
        </div>
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
      <SidebarRail />
    </Sidebar>
  );
}
