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
import { usePathname } from 'next/navigation';
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

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  user?: {
    name?: string | null;
    email?: string | null;
    avatar?: string | null;
  };
}

export function AppSidebar({ user, ...props }: AppSidebarProps) {
  const pathname = usePathname();

  // Build navigation items with active state
  const navMain = React.useMemo(
    () => [
      {
        title: 'Overview',
        url: '/dashboard/overview',
        icon: HomeIcon,
        isActive:
          pathname === '/dashboard/overview' || pathname === '/dashboard',
      },
      {
        title: 'Links',
        url: '/dashboard/links',
        icon: LinkIcon,
        isActive: pathname === '/dashboard/links',
      },
      {
        title: 'Analytics',
        url: '/dashboard/analytics',
        icon: ChartPieIcon,
        isActive: pathname === '/dashboard/analytics',
      },
      {
        title: 'Audience',
        url: '/dashboard/audience',
        icon: UsersIcon,
        isActive: pathname === '/dashboard/audience',
      },
    ],
    [pathname]
  );

  const navSecondary = React.useMemo(
    () => [
      {
        title: 'Earnings',
        url: '/dashboard/tipping',
        icon: BanknotesIcon,
        isActive: pathname === '/dashboard/tipping',
      },
      {
        title: 'Settings',
        url: '/dashboard/settings',
        icon: Cog6ToothIcon,
        isActive: pathname === '/dashboard/settings',
      },
    ],
    [pathname]
  );

  // Use provided user data or defaults
  const userData = {
    name: user?.name || 'Creator',
    email: user?.email || 'creator@jovie.com',
    avatar: user?.avatar || '/avatars/default.png',
  };
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
        <NavMain items={navMain} />
        <NavSecondary items={navSecondary} className='mt-auto' />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={userData} />
      </SidebarFooter>
    </Sidebar>
  );
}
