import Image from 'next/image';
import Link from 'next/link';
import type { ComponentPropsWithoutRef } from 'react';

import { SidebarCollapseButton } from '@/components/atoms/SidebarCollapseButton';
import { DashboardNav } from '@/components/dashboard/DashboardNav';
import { DashboardRemoveBrandingCard } from '@/components/dashboard/molecules/DashboardRemoveBrandingCard';
import { EnhancedThemeToggle } from '@/components/dashboard/molecules/EnhancedThemeToggle';
import { FeedbackButton } from '@/components/dashboard/molecules/FeedbackButton';
import { UserButton } from '@/components/molecules/UserButton';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/organisms/Sidebar';

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
      variant='inset'
      collapsible='icon'
      className={className}
      {...props}
    >
      <SidebarHeader className='relative'>
        <SidebarCollapseButton className='absolute right-2 top-3 hidden lg:inline-flex group-data-[collapsible=icon]:left-1/2 group-data-[collapsible=icon]:-translate-x-1/2 group-data-[collapsible=icon]:right-auto' />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size='lg' asChild>
              <Link href='/dashboard/overview'>
                <div className='flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground'>
                  <Image
                    src='/brand/Jovie-Logo-Icon.svg'
                    alt='Jovie'
                    width={16}
                    height={16}
                    className='size-4'
                  />
                </div>
                <div className='grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden'>
                  <span className='truncate font-semibold'>Jovie</span>
                  <span className='truncate text-xs'>Creator Dashboard</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <DashboardNav />
      </SidebarContent>

      <SidebarFooter>
        <DashboardRemoveBrandingCard />
        <SidebarMenu>
          <SidebarMenuItem>
            <div className='flex items-center gap-2 px-2 py-1'>
              <EnhancedThemeToggle variant='compact' />
              <FeedbackButton collapsed={isCollapsed} />
            </div>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton size='lg' asChild>
              <div>
                <UserButton showUserInfo />
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
