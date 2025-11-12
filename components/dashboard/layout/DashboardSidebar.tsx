import Image from 'next/image';
import Link from 'next/link';
import type { ComponentPropsWithoutRef } from 'react';

import { DashboardNav } from '@/components/dashboard/DashboardNav';
import { EnhancedThemeToggle } from '@/components/dashboard/molecules/EnhancedThemeToggle';
import { FeedbackButton } from '@/components/dashboard/molecules/FeedbackButton';
import { UserButton } from '@/components/molecules/UserButton';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/organisms/Sidebar';

type SidebarRootProps = ComponentPropsWithoutRef<typeof Sidebar>;

export type DashboardSidebarProps = Omit<SidebarRootProps, 'children'>;

export function DashboardSidebar({
  className,
  ...props
}: DashboardSidebarProps) {
  return (
    <Sidebar
      variant='inset'
      collapsible='icon'
      className={className}
      {...props}
    >
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size='lg'
              asChild
              className='group-data-[collapsible=icon]:justify-center'
            >
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
                <div className='grid flex-1 text-left text-sm leading-tight'>
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
        <SidebarMenu>
          <SidebarMenuItem>
            <UserButton showUserInfo />
            <SidebarMenuAction showOnHover asChild>
              <EnhancedThemeToggle variant='compact' />
            </SidebarMenuAction>
            <SidebarMenuAction showOnHover asChild>
              <FeedbackButton />
            </SidebarMenuAction>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
