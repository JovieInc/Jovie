import Image from 'next/image';
import Link from 'next/link';
import type { ComponentPropsWithoutRef } from 'react';

import { DashboardNav } from '@/components/dashboard/DashboardNav';
import { DashboardRemoveBrandingCard } from '@/components/dashboard/molecules/DashboardRemoveBrandingCard';
import { UserButton } from '@/components/molecules/UserButton';
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
import { cn } from '@/lib/utils';

type SidebarRootProps = ComponentPropsWithoutRef<typeof Sidebar>;

export type DashboardSidebarProps = Omit<SidebarRootProps, 'children'>;

export function DashboardSidebar({
  className,
  ...props
}: DashboardSidebarProps) {
  const { state } = useSidebar();
  const isCollapsed = state === 'closed';

  return (
    <Sidebar
      variant='sidebar'
      collapsible='icon'
      className={className}
      {...props}
    >
      <SidebarHeader className='relative'>
        <div className='group/toggle flex items-center gap-2 px-2 py-3'>
          <Link
            href='/dashboard/overview'
            aria-label='Go to dashboard'
            className={cn(
              'flex flex-1 items-center gap-3 rounded-md px-1 py-1 transition-colors hover:bg-sidebar-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
              'group-data-[state=closed]:group-hover/toggle:hidden group-data-[state=closed]:group-focus-within/toggle:hidden'
            )}
          >
            <div className='flex items-center justify-center'>
              <Image
                src='/brand/Jovie-Logo-Icon.svg'
                alt='Jovie'
                width={20}
                height={20}
                className='h-8 w-8 rounded-full'
              />
            </div>
            <span className='sr-only group-data-[collapsible=icon]:hidden'>
              Dashboard
            </span>
          </Link>
          <SidebarTrigger
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cn(
              'h-9 w-9 shrink-0 border border-sidebar-border/60 bg-sidebar/70 text-secondary-token hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring',
              'group-data-[state=closed]:hidden group-data-[state=closed]:group-hover/toggle:flex group-data-[state=closed]:group-focus-within/toggle:flex'
            )}
          />
        </div>
        <SidebarSeparator className='my-1' />
      </SidebarHeader>

      <SidebarContent className='flex-1'>
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
            <UserButton showUserInfo={!isCollapsed} />
          </div>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
