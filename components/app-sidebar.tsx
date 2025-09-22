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

import { SmartBadge } from '@/components/atoms/SmartBadge';
import { SmartSection } from '@/components/molecules/ProgressiveDisclosure';
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
import { cn } from '@/lib/utils';

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  user?: {
    name?: string | null;
    email?: string | null;
    avatar?: string | null;
  };
}

export function AppSidebar({ user, ...props }: AppSidebarProps) {
  const pathname = usePathname();

  // Build navigation items with active state and smart features
  const navMain = React.useMemo(
    () => [
      {
        title: 'Overview',
        url: '/dashboard/overview',
        icon: HomeIcon,
        isActive:
          pathname === '/dashboard/overview' || pathname === '/dashboard',
        badge: {
          variant: 'status' as const,
          status: 'success' as const,
          children: 'Live',
        },
      },
      {
        title: 'Links',
        url: '/dashboard/links',
        icon: LinkIcon,
        isActive: pathname === '/dashboard/links',
        badge: {
          variant: 'count' as const,
          count: 12,
          status: 'info' as const,
        },
        quickAction: {
          icon: () => (
            <svg
              className='w-3 h-3'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M12 4v16m8-8H4'
              />
            </svg>
          ),
          label: 'Add Link',
        },
      },
      {
        title: 'Analytics',
        url: '/dashboard/analytics',
        icon: ChartPieIcon,
        isActive: pathname === '/dashboard/analytics',
        badge: { variant: 'new' as const },
      },
      {
        title: 'Audience',
        url: '/dashboard/audience',
        icon: UsersIcon,
        isActive: pathname === '/dashboard/audience',
        badge: {
          variant: 'count' as const,
          count: 247,
          status: 'success' as const,
        },
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
        badge: {
          variant: 'status' as const,
          status: 'success' as const,
          children: '$247',
        },
      },
      {
        title: 'Settings',
        url: '/dashboard/settings',
        icon: Cog6ToothIcon,
        isActive: pathname === '/dashboard/settings',
        badge: {
          variant: 'dot' as const,
          status: 'warning' as const,
          pulse: true,
        },
      },
    ],
    [pathname]
  );

  // Advanced/Pro features that are disclosed progressively
  const navAdvanced = React.useMemo(
    () => [
      {
        title: 'API Keys',
        url: '/dashboard/settings/api',
        icon: () => (
          <svg
            className='w-4 h-4'
            fill='none'
            stroke='currentColor'
            viewBox='0 0 24 24'
          >
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth={2}
              d='M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-3.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z'
            />
          </svg>
        ),
        isActive: pathname === '/dashboard/settings/api',
        badge: { variant: 'pro' as const },
      },
      {
        title: 'Webhooks',
        url: '/dashboard/settings/webhooks',
        icon: () => (
          <svg
            className='w-4 h-4'
            fill='none'
            stroke='currentColor'
            viewBox='0 0 24 24'
          >
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth={2}
              d='M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1'
            />
          </svg>
        ),
        isActive: pathname === '/dashboard/settings/webhooks',
        badge: { variant: 'new' as const },
      },
      {
        title: 'Export Data',
        url: '/dashboard/settings/export',
        icon: () => (
          <svg
            className='w-4 h-4'
            fill='none'
            stroke='currentColor'
            viewBox='0 0 24 24'
          >
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth={2}
              d='M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z'
            />
          </svg>
        ),
        isActive: pathname === '/dashboard/settings/export',
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
              <Link
                href='/dashboard/overview'
                className='group relative overflow-hidden'
              >
                {/* Subtle glow effect on hover */}
                <div className='absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300'>
                  <div className='absolute inset-0 bg-gradient-to-r from-transparent via-sidebar-primary/5 to-transparent rounded-lg' />
                </div>

                <div className='flex aspect-square size-8 items-center justify-center rounded-lg bg-gradient-to-br from-sidebar-primary to-sidebar-primary/80 text-sidebar-primary-foreground transition-all duration-300 ease-out group-hover:scale-110 group-hover:rotate-6 shadow-sm ring-1 ring-sidebar-border/50 group-hover:ring-sidebar-primary/20 group-hover:shadow-md relative z-10'>
                  <Image
                    src='/brand/Jovie-Logo-Icon.svg'
                    alt='Jovie'
                    width={16}
                    height={16}
                    className='size-4 transition-all duration-300 ease-out group-hover:scale-110'
                  />
                </div>
                <div className='grid flex-1 text-left text-sm leading-tight transition-all duration-300 ease-out group-hover:translate-x-1 relative z-10'>
                  <span className='truncate font-semibold text-sidebar-foreground transition-colors duration-200 group-hover:text-sidebar-primary'>
                    Jovie
                  </span>
                  <span className='truncate text-xs text-sidebar-muted-foreground transition-colors duration-200 group-hover:text-sidebar-foreground'>
                    Creator Dashboard
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
        <NavSecondary items={navSecondary} />

        <div className='mt-4'>
          <SmartSection
            title='Advanced'
            description='Pro features'
            importance='low'
            usageFrequency='rare'
            showHelp={true}
            helpText='Advanced features for power users including API access, webhooks, and data export capabilities.'
            className='px-2'
          >
            <div className='space-y-1'>
              {navAdvanced.map(item => {
                const isActive = item.isActive;
                return (
                  <Link
                    key={item.title}
                    href={item.url}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-all duration-300 ease-out',
                      'hover:bg-sidebar-accent hover:translate-x-1 group relative overflow-hidden',
                      'ring-1 ring-transparent hover:ring-sidebar-border/30',
                      isActive
                        ? 'bg-sidebar-accent/70 text-sidebar-primary font-medium shadow-sm ring-sidebar-border/50'
                        : 'text-sidebar-foreground hover:text-sidebar-primary'
                    )}
                  >
                    <item.icon />
                    <span className='flex-1'>{item.title}</span>
                    {item.badge && <SmartBadge {...item.badge} />}
                  </Link>
                );
              })}
            </div>
          </SmartSection>
        </div>
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={userData} />
      </SidebarFooter>
    </Sidebar>
  );
}
