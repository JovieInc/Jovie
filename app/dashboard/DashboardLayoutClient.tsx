'use client';

import {
  BanknotesIcon,
  ChartPieIcon,
  HomeIcon,
  LinkIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';
import { useState, useTransition } from 'react';
import { AppSidebar } from '@/components/app-sidebar';
import { PerformanceMonitor } from '@/components/atoms/PerformanceMonitor';
import { SmartBadge } from '@/components/atoms/SmartBadge';
import { PendingClaimRunner } from '@/components/bridge/PendingClaimRunner';
import {
  type DashboardBreadcrumbItem,
  DashboardTopBar,
} from '@/components/dashboard/layout/DashboardTopBar';
import { PendingClaimHandler } from '@/components/dashboard/PendingClaimHandler';
import {
  MobileNavigation,
  MobileNavTrigger,
  MobileTabNavigation,
} from '@/components/molecules/MobileNavigation';
import {
  CommandPalette,
  useCommandPalette,
} from '@/components/organisms/CommandPalette';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { useMobile } from '@/hooks/useGestures';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { cn } from '@/lib/utils';

import type { DashboardData } from './actions';

interface DashboardLayoutClientProps {
  dashboardData: DashboardData;
  persistSidebarCollapsed?: (collapsed: boolean) => Promise<void>;
  children: React.ReactNode;
}

export default function DashboardLayoutClient({
  dashboardData,
  persistSidebarCollapsed,
  children,
}: DashboardLayoutClientProps) {
  const [, startTransition] = useTransition();
  const pathname = usePathname();
  const router = useRouter();
  const { open: commandPaletteOpen, setOpen: setCommandPaletteOpen } =
    useCommandPalette();
  const { isMobile } = useMobile();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Build a simple breadcrumb from the current path
  const crumbs = (() => {
    const parts = (pathname || '/dashboard').split('/').filter(Boolean);
    const idx = parts.indexOf('dashboard');
    const subs = idx >= 0 ? parts.slice(idx + 1) : [];
    const toTitle = (s: string): string =>
      s.replace(/-/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
    const items: DashboardBreadcrumbItem[] = [
      { label: 'Dashboard', href: '/dashboard/overview' },
    ];
    if (subs.length > 0) {
      let acc = '/dashboard';
      subs.forEach((seg, i) => {
        acc += `/${seg}`;
        const isLast = i === subs.length - 1;
        items.push({ label: toTitle(seg), href: isLast ? undefined : acc });
      });
    }
    return items;
  })();

  // Simplified sidebar state - ensure sidebar is open by default unless explicitly collapsed
  const [sidebarOpen, setSidebarOpen] = useState(
    !(dashboardData.sidebarCollapsed ?? false)
  );

  // Handle persistence of sidebar state
  const handleOpenChange = (open: boolean) => {
    setSidebarOpen(open);
    if (persistSidebarCollapsed) {
      startTransition(() => {
        void persistSidebarCollapsed(!open);
      });
    }
  };

  // Keyboard shortcuts for quick navigation
  useKeyboardShortcuts([
    {
      key: '1',
      action: () => router.push('/dashboard/overview'),
      description: 'Go to Overview',
    },
    {
      key: '2',
      action: () => router.push('/dashboard/links'),
      description: 'Go to Links',
    },
    {
      key: '3',
      action: () => router.push('/dashboard/analytics'),
      description: 'Go to Analytics',
    },
    {
      key: '4',
      action: () => router.push('/dashboard/audience'),
      description: 'Go to Audience',
    },
    {
      key: '5',
      action: () => router.push('/dashboard/tipping'),
      description: 'Go to Earnings',
    },
    {
      key: '6',
      action: () => router.push('/dashboard/settings'),
      description: 'Go to Settings',
    },
    {
      key: '/',
      action: () => setCommandPaletteOpen(true),
      description: 'Open search',
    },
  ]);

  // Mobile tab navigation items
  const mobileTabItems = React.useMemo(
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
        badge: <SmartBadge variant='count' count={12} status='info' />,
      },
      {
        title: 'Analytics',
        url: '/dashboard/analytics',
        icon: ChartPieIcon,
        isActive: pathname === '/dashboard/analytics',
        badge: <SmartBadge variant='new' />,
      },
      {
        title: 'Audience',
        url: '/dashboard/audience',
        icon: UsersIcon,
        isActive: pathname === '/dashboard/audience',
        badge: <SmartBadge variant='count' count={247} status='success' />,
      },
      {
        title: 'Earnings',
        url: '/dashboard/tipping',
        icon: BanknotesIcon,
        isActive: pathname === '/dashboard/tipping',
        badge: (
          <SmartBadge variant='status' status='success'>
            $247
          </SmartBadge>
        ),
      },
    ],
    [pathname]
  );

  return (
    <>
      <PendingClaimRunner />
      <PendingClaimHandler />

      <SidebarProvider
        defaultOpen={true}
        open={sidebarOpen}
        onOpenChange={handleOpenChange}
      >
        <div className='flex min-h-screen w-full bg-base transition-colors duration-300 ease-out'>
          {/* Desktop Sidebar with enhanced transitions */}
          {!isMobile && (
            <div className='transition-all duration-300 ease-out'>
              <AppSidebar
                user={{
                  name: dashboardData.user?.name,
                  email: dashboardData.user?.email,
                  avatar: dashboardData.user?.imageUrl,
                }}
              />
            </div>
          )}

          {/* Mobile Navigation with sophisticated animations */}
          {isMobile && (
            <MobileNavigation
              isOpen={mobileNavOpen}
              onOpenChange={setMobileNavOpen}
            >
              <AppSidebar
                user={{
                  name: dashboardData.user?.name,
                  email: dashboardData.user?.email,
                  avatar: dashboardData.user?.imageUrl,
                }}
              />
            </MobileNavigation>
          )}

          <SidebarInset className='flex flex-1 flex-col transition-all duration-300 ease-out'>
            {/* Enhanced top bar with slide-in animation */}
            <div className='animate-in slide-in-from-top-2 duration-300 ease-out'>
              <DashboardTopBar
                breadcrumbs={crumbs}
                actions={
                  isMobile ? (
                    <MobileNavTrigger
                      isOpen={mobileNavOpen}
                      onOpenChange={setMobileNavOpen}
                    />
                  ) : undefined
                }
              />
            </div>

            {/* Main content with sophisticated transitions */}
            <main
              className={cn(
                'flex-1 overflow-y-auto overflow-x-hidden relative',
                'transition-all duration-300 ease-out',
                isMobile ? 'pb-20' : '' // Add bottom padding on mobile for tab nav
              )}
            >
              {/* Subtle scroll gradient */}
              <div className='absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-base/80 to-transparent pointer-events-none z-10' />
              <div className='absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-base/80 to-transparent pointer-events-none z-10' />

              <div className='w-full px-4 py-4 sm:px-6 sm:py-6 lg:px-8 transition-all duration-300 ease-out'>
                <div className='mx-auto max-w-7xl space-y-6'>
                  {/* Enhanced content wrapper with fade-in animation */}
                  <div className='animate-in fade-in-0 slide-in-from-bottom-4 duration-500 ease-out'>
                    {children}
                  </div>
                </div>
              </div>
            </main>
          </SidebarInset>
        </div>

        {/* Mobile Tab Navigation */}
        <MobileTabNavigation items={mobileTabItems} />

        <CommandPalette
          open={commandPaletteOpen}
          onOpenChange={setCommandPaletteOpen}
        />

        <PerformanceMonitor />
      </SidebarProvider>
    </>
  );
}
