'use client';

import {
  BanknotesIcon,
  ChartPieIcon,
  Cog6ToothIcon,
  HomeIcon,
  LinkIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import Image from 'next/image';
import Link from 'next/link';
import * as React from 'react';

import { NavMain } from '@/components/nav-main';
import { NavSecondary } from '@/components/nav-secondary';
import { NavUser } from '@/components/nav-user';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';

const data = {
  user: {
    name: 'Creator',
    email: 'creator@jovie.com',
    avatar: '/avatars/default.png',
  },
  navMain: [
    {
      title: 'Overview',
      url: '/dashboard/overview',
      icon: HomeIcon,
      isActive: true,
    },
    {
      title: 'Links',
      url: '/dashboard/links',
      icon: LinkIcon,
    },
    {
      title: 'Analytics',
      url: '/dashboard/analytics',
      icon: ChartPieIcon,
    },
    {
      title: 'Audience',
      url: '/dashboard/audience',
      icon: UsersIcon,
    },
  ],
  navSecondary: [
    {
      title: 'Earnings',
      url: '/dashboard/tipping',
      icon: BanknotesIcon,
    },
    {
      title: 'Settings',
      url: '/dashboard/settings',
      icon: Cog6ToothIcon,
    },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar variant='inset' {...props}>
      <SidebarHeader>
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
        <NavMain items={data.navMain} />
        <NavSecondary items={data.navSecondary} className='mt-auto' />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  );
}
