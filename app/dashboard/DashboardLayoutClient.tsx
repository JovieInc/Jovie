'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { Tooltip } from '@/components/atoms/Tooltip';
import { PendingClaimRunner } from '@/components/bridge/PendingClaimRunner';
import { DashboardNav } from '@/components/dashboard/DashboardNav';
import { EnhancedThemeToggle } from '@/components/dashboard/molecules/EnhancedThemeToggle';
import { PendingClaimHandler } from '@/components/dashboard/PendingClaimHandler';
import { UserButton } from '@/components/molecules/UserButton';
import { Logo } from '@/components/ui/Logo';

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
        startTransition(() => {
          void persistSidebarCollapsed(next);
        });
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
        {/* Subtle background pattern */}
        <div className='absolute inset-0 opacity-50 grid-bg dark:grid-bg-dark pointer-events-none' />
        {/* Gradient orbs for visual depth */}
        <div className='absolute top-0 right-1/4 w-96 h-96 bg-gradient-to-r from-purple-500/5 to-blue-500/5 rounded-full blur-3xl pointer-events-none' />
        <div className='absolute bottom-1/4 left-1/3 w-96 h-96 bg-gradient-to-r from-blue-500/5 to-cyan-500/5 rounded-full blur-3xl pointer-events-none' />

        <div className='flex h-screen overflow-hidden'>
          {/* Sidebar */}
          <div
            id='sidebar'
            className={`${
              sidebarOpen ? 'translate-x-0' : '-translate-x-full'
            } ${
              sidebarCollapsed ? 'lg:w-16' : 'lg:w-64'
            } fixed lg:relative inset-y-0 left-0 z-50 flex flex-col transition-all duration-300 ease-in-out lg:translate-x-0`}
          >
            <div className='flex grow flex-col gap-y-5 overflow-y-auto bg-surface-0 backdrop-blur-sm border-r border-subtle rounded-r-2xl shadow-md lg:shadow-lg pt-2 pb-3 ring-1 ring-black/5 dark:ring-white/5'>
              <div className='flex h-16 shrink-0 items-center px-4'>
                <Link
                  href='/dashboard/overview'
                  className={
                    'focus-visible:outline-none focus-visible:ring-2 ring-accent focus-visible:ring-offset-2 rounded-md'
                  }
                >
                  {sidebarCollapsed ? (
                    <Image
                      src='/Jovie-logo.png'
                      alt='App icon'
                      width={24}
                      height={24}
                      className='h-6 w-6 rounded-md'
                      priority
                    />
                  ) : (
                    <Logo size='md' />
                  )}
                </Link>
              </div>

              <nav
                className={`flex flex-1 flex-col ${sidebarCollapsed ? 'px-2' : 'px-3'}`}
              >
                <DashboardNav collapsed={sidebarCollapsed} />
              </nav>

              {/* Theme toggle block (above divider) */}
              <div className='flex-shrink-0 p-2'>
                {/* Moved theme toggle to utility cluster below divider */}
              </div>

              {/* Divider and user controls block (below divider) */}
              <div className='flex-shrink-0 border-t border-subtle p-2'>
                {/* User button (expanded only) */}
                <div
                  className={`${sidebarCollapsed ? 'hidden' : 'block px-2'}`}
                >
                  <div className='flex items-center gap-2'>
                    {/* Icon-only theme toggle with tooltip */}
                    <Tooltip content={'Toggle theme'} placement='top'>
                      <span>
                        <EnhancedThemeToggle variant='compact' />
                      </span>
                    </Tooltip>
                    <UserButton />
                  </div>
                </div>

                {/* Centered user button when collapsed with status dot */}
                {sidebarCollapsed && (
                  <div className='flex flex-col items-center justify-center gap-2'>
                    {/* Icon-only theme toggle with tooltip (stacked above avatar) */}
                    <Tooltip content={'Toggle theme'} placement='top'>
                      <span aria-label='Toggle theme'>
                        <EnhancedThemeToggle variant='compact' />
                      </span>
                    </Tooltip>
                    <div className='relative'>
                      <UserButton />
                      <span className='absolute bottom-0 right-0 block h-2 w-2 rounded-full bg-green-500' />
                    </div>
                  </div>
                )}
              </div>
              {/* Floating collapse/expand toggle (desktop only) */}
              <button
                id='sidebar-toggle'
                onClick={handleToggleSidebarCollapsed}
                className='hidden lg:flex items-center justify-center
                           absolute top-1/2 -translate-y-1/2 right-[-12px]
                           z-[60] h-9 w-9 rounded-full shadow-lg border border-black/10 dark:border-white/10
                           bg-surface-0/90 backdrop-blur-md hover:bg-surface-1
                           text-secondary-token hover:text-primary-token transition-colors duration-200
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1'
                aria-label={
                  sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'
                }
              >
                <svg
                  className={`w-5 h-5 transition-transform duration-200 ${sidebarCollapsed ? 'rotate-180' : ''}`}
                  fill='none'
                  viewBox='0 0 24 24'
                  stroke='currentColor'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M15 19l-7-7 7-7'
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* Mobile sidebar overlay */}
          {sidebarOpen && (
            <div className='fixed inset-0 z-40 bg-black/50 lg:hidden' />
          )}

          {/* Main content */}
          <div className='flex flex-1 flex-col overflow-hidden'>
            <main className='flex-1 overflow-y-auto'>
              <div className='mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8'>
                {children}
              </div>
            </main>
          </div>
        </div>
      </div>
    </>
  );
}
