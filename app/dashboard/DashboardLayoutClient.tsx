'use client';

import { 
  ChevronLeftIcon, 
  ChevronRightIcon 
} from '@heroicons/react/24/outline';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { IconButton } from '@/components/atoms/IconButton';
import { Tooltip } from '@/components/atoms/Tooltip';
import { PendingClaimRunner } from '@/components/bridge/PendingClaimRunner';
import { DashboardNav } from '@/components/dashboard/DashboardNav';
import { EnhancedThemeToggle } from '@/components/dashboard/molecules/EnhancedThemeToggle';
import { FeedbackButton } from '@/components/dashboard/molecules/FeedbackButton';
import { PendingClaimHandler } from '@/components/dashboard/PendingClaimHandler';
import { UserButton } from '@/components/molecules/UserButton';
import { Logo } from '@/components/ui/Logo';
// Live preview is rendered only on the Links page

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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    dashboardData.sidebarCollapsed ?? false
  );
  const [, startTransition] = useTransition();

  // Live preview moved to Links page; no need to compute artist here

  // Initialize collapsed state from localStorage (client-only)
  useEffect(() => {
    const serverValue = dashboardData.sidebarCollapsed ?? false;
    try {
      const stored = localStorage.getItem('dashboard.sidebarCollapsed');
      if (stored === null) {
        // Seed localStorage from server
        localStorage.setItem(
          'dashboard.sidebarCollapsed',
          serverValue ? '1' : '0'
        );
        setSidebarCollapsed(serverValue);
      } else {
        const storedBool = stored === '1';
        if (storedBool !== serverValue) {
          // Prefer server as source of truth on load to avoid UI mismatch
          localStorage.setItem(
            'dashboard.sidebarCollapsed',
            serverValue ? '1' : '0'
          );
          setSidebarCollapsed(serverValue);
        } else {
          setSidebarCollapsed(storedBool);
        }
      }
    } catch {
      // ignore storage errors (Safari private mode, etc.)
    }
    // We intentionally only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Toggle handler that also persists to localStorage and DB
  const handleToggleSidebarCollapsed = () => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('dashboard.sidebarCollapsed', next ? '1' : '0');
      } catch {
        // ignore storage errors
      }
      // Fire-and-forget persist to DB
      if (persistSidebarCollapsed) {
        // Use a timeout to avoid calling startTransition during render
        setTimeout(() => {
          startTransition(() => {
            void persistSidebarCollapsed(next);
          });
        }, 0);
      }
      return next;
    });
  };

  // Close sidebar on mobile when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const sidebar = document.getElementById('sidebar');
      const toggleButton = document.getElementById('sidebar-toggle');
      if (
        sidebar &&
        !sidebar.contains(event.target as Node) &&
        toggleButton &&
        !toggleButton.contains(event.target as Node)
      ) {
        setSidebarOpen(false);
      }
    };

    if (sidebarOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [sidebarOpen]);

  return (
    <>
      <PendingClaimRunner />
      <PendingClaimHandler />

      <div className='min-h-screen bg-base transition-colors relative'>
        {/* Subtle background pattern (no global opacity to avoid light-mode washout) */}
        <div className='absolute inset-0 grid-bg dark:grid-bg-dark pointer-events-none' />
        {/* Gradient orbs for visual depth (dark mode only) */}
        <div className='hidden dark:block absolute top-0 right-1/4 w-96 h-96 bg-gradient-to-r from-purple-500/10 to-blue-500/10 rounded-full blur-3xl pointer-events-none' />
        <div className='hidden dark:block absolute bottom-1/4 left-1/3 w-96 h-96 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 rounded-full blur-3xl pointer-events-none' />

        <div className='flex h-screen overflow-y-hidden overflow-x-visible'>
          {/* Sidebar */}
          <div
            id='sidebar'
            className={`${
              sidebarOpen ? 'translate-x-0' : '-translate-x-full'
            } ${
              sidebarCollapsed ? 'lg:w-16' : 'lg:w-64'
            } fixed lg:relative inset-y-0 left-0 z-50 flex flex-col transition-all duration-300 ease-in-out lg:translate-x-0`}
          >
            <div className='flex grow flex-col gap-y-5 overflow-y-auto overflow-x-visible bg-surface-0 backdrop-blur-sm border-r border-subtle rounded-r-2xl shadow-md lg:shadow-lg pt-4 pb-3 ring-1 ring-black/5 dark:ring-white/5'>
              {/* Header with logo and top toggle */}
              <div className='relative flex h-16 shrink-0 items-center px-4 overflow-visible w-full'>
                <Link
                  href='/dashboard/overview'
                  className='focus-visible:outline-none focus-visible:ring-2 ring-accent focus-visible:ring-offset-2 rounded-md'
                >
                  {sidebarCollapsed ? (
                    <Image
                      src='/brand/Jovie-Logo-Icon.svg'
                      alt='Jovie Icon'
                      width={24}
                      height={24}
                      className='h-6 w-6 transition-all duration-300 ease-in-out text-black dark:text-white'
                      priority
                    />
                  ) : (
                    <Logo
                      size='md'
                      className='transition-all duration-300 ease-in-out'
                    />
                  )}
                </Link>

                {/* Expanded mode: toggle sits inside header to the right of logo */}
                {!sidebarCollapsed && (
                  <div className='ml-auto'>
                    <Tooltip content='Collapse sidebar' placement='right'>
                      <IconButton
                        id='sidebar-toggle'
                        onClick={handleToggleSidebarCollapsed}
                        ariaLabel='Collapse sidebar'
                        className='hidden lg:flex shadow'
                        size='sm'
                      >
                        <ChevronLeftIcon className='w-3.5 h-3.5' />
                      </IconButton>
                    </Tooltip>
                  </div>
                )}

                {/* Collapsed mode: toggle floats outside to the right */}
                {sidebarCollapsed && (
                  <Tooltip content='Expand sidebar' placement='right'>
                    <div className='hidden lg:block absolute -right-4 top-6 z-50'>
                      <IconButton
                        id='sidebar-toggle'
                        onClick={handleToggleSidebarCollapsed}
                        ariaLabel='Expand sidebar'
                        className='shadow-lg'
                        size='sm'
                      >
                        <ChevronRightIcon className='w-3.5 h-3.5' />
                      </IconButton>
                    </div>
                  </Tooltip>
                )}
              </div>

              {/* Navigation */}
              <DashboardNav collapsed={sidebarCollapsed} />

              {/* Bottom utilities (theme, feedback) */}
              <div className='mt-auto px-2 space-y-3'>
                <div className='flex items-center justify-center'>
                  <Tooltip content='Theme' shortcut='T' placement='right'>
                    <div className='w-full'>
                      <EnhancedThemeToggle variant='compact' />
                    </div>
                  </Tooltip>
                </div>

                <div className='flex items-center justify-center'>
                  <Tooltip content='Feedback' shortcut='F' placement='right'>
                    <div className='w-full'>
                      <FeedbackButton collapsed={sidebarCollapsed} />
                    </div>
                  </Tooltip>
                </div>
              </div>

              {/* Persistent footer: user menu anchored at absolute bottom */}
              <div className='mt-3 px-2 pt-3 pb-4 border-t border-subtle'>
                <div className='flex items-center justify-center'>
                  <Tooltip content='Account' placement='right'>
                    <div className='w-full'>
                      <UserButton showUserInfo={!sidebarCollapsed} />
                    </div>
                  </Tooltip>
                </div>
              </div>
            </div>
          </div>

          {/* Mobile sidebar overlay */}
          {sidebarOpen && (
            <div className='fixed inset-0 z-40 bg-black/50 lg:hidden' />
          )}

          {/* Main content */}
          <div className='flex flex-1 flex-col overflow-hidden ml-0 lg:ml-0'>
            <main className='flex-1 overflow-y-auto'>
              <div className='mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-8'>
                {children}
              </div>
            </main>
          </div>

          
        </div>
      </div>
    </>
  );
}
