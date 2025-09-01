'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { Tooltip } from '@/components/atoms/Tooltip';
import { PendingClaimRunner } from '@/components/bridge/PendingClaimRunner';
import { DashboardNav } from '@/components/dashboard/DashboardNav';
import { EnhancedThemeToggle } from '@/components/dashboard/molecules/EnhancedThemeToggle';
import { FeedbackButton } from '@/components/dashboard/molecules/FeedbackButton';
import { PendingClaimHandler } from '@/components/dashboard/PendingClaimHandler';
import { UserButton } from '@/components/molecules/UserButton';
import { Logo } from '@/components/ui/Logo';
import { cn } from '@/lib/utils';
import { convertDrizzleCreatorProfileToArtist } from '@/types/db';

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

  // Convert selected profile to artist for UserButton
  const artist = dashboardData.selectedProfile
    ? convertDrizzleCreatorProfileToArtist(dashboardData.selectedProfile)
    : null;

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
              <div className='flex h-16 shrink-0 items-center justify-center px-4'>
                <Link
                  href='/dashboard/overview'
                  className={
                    'focus-visible:outline-none focus-visible:ring-2 ring-accent focus-visible:ring-offset-2 rounded-md transition-all duration-300 ease-in-out'
                  }
                >
                  <div className='relative overflow-hidden'>
                    <div
                      className={cn(
                        'transition-all duration-300 ease-in-out',
                        sidebarCollapsed
                          ? 'opacity-100 scale-100'
                          : 'opacity-0 scale-95 absolute inset-0'
                      )}
                    >
                      <Image
                        src='/Jovie-logo.png'
                        alt='App icon'
                        width={24}
                        height={24}
                        className='h-6 w-6 rounded-md'
                        priority
                      />
                    </div>
                    <div
                      className={cn(
                        'transition-all duration-300 ease-in-out',
                        sidebarCollapsed
                          ? 'opacity-0 scale-95'
                          : 'opacity-100 scale-100'
                      )}
                    >
                      <Logo size='md' />
                    </div>
                  </div>
                </Link>
              </div>

              <nav
                className={cn(
                  'flex flex-1 flex-col transition-all duration-300 ease-in-out',
                  sidebarCollapsed ? 'px-2' : 'px-3'
                )}
              >
                <DashboardNav collapsed={sidebarCollapsed} />
              </nav>

              {/* Feedback button block */}
              <div className='flex-shrink-0 p-2'>
                <FeedbackButton collapsed={sidebarCollapsed} />
              </div>

              {/* Divider and user controls block (below divider) */}
              <div className='flex-shrink-0 border-t border-subtle p-2'>
                <div className='relative overflow-hidden'>
                  {/* User button (expanded only) */}
                  <div
                    className={cn(
                      'transition-all duration-300 ease-in-out px-2',
                      sidebarCollapsed
                        ? 'opacity-0 scale-95 pointer-events-none absolute inset-0'
                        : 'opacity-100 scale-100'
                    )}
                  >
                    <div className='flex items-center gap-2'>
                      {/* Icon-only theme toggle with tooltip */}
                      <Tooltip content={'Toggle theme'} placement='top'>
                        <span>
                          <EnhancedThemeToggle variant='compact' />
                        </span>
                      </Tooltip>
                      <UserButton
                        artist={artist}
                        showUserInfo={!sidebarCollapsed}
                      />
                    </div>
                  </div>

                  {/* Centered user button when collapsed with status dot */}
                  <div
                    className={cn(
                      'flex flex-col items-center justify-center gap-2 transition-all duration-300 ease-in-out',
                      sidebarCollapsed
                        ? 'opacity-100 scale-100'
                        : 'opacity-0 scale-95 pointer-events-none absolute inset-0'
                    )}
                  >
                    {/* Icon-only theme toggle with tooltip (stacked above avatar) */}
                    <Tooltip content={'Toggle theme'} placement='top'>
                      <span aria-label='Toggle theme'>
                        <EnhancedThemeToggle variant='compact' />
                      </span>
                    </Tooltip>
                    <div className='relative'>
                      <UserButton artist={artist} showUserInfo={false} />
                      <span className='absolute bottom-0 right-0 block h-2 w-2 rounded-full bg-green-500 transition-all duration-300 ease-in-out' />
                    </div>
                  </div>
                </div>
              </div>

              {/* Collapse/Expand Section */}
              <div className='flex-shrink-0 border-t border-subtle'>
                <button
                  id='sidebar-toggle'
                  onClick={handleToggleSidebarCollapsed}
                  className='hidden lg:flex items-center justify-center w-full p-3
                             text-secondary-token hover:text-primary-token hover:bg-surface-1
                             transition-all duration-200 ease-in-out
                             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2
                             group'
                  aria-label={
                    sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'
                  }
                >
                  <div className='flex items-center gap-2'>
                    <svg
                      className={`w-4 h-4 transition-all duration-200 ease-in-out ${sidebarCollapsed ? 'rotate-180' : ''}`}
                      fill='none'
                      viewBox='0 0 24 24'
                      stroke='currentColor'
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap='round'
                        strokeLinejoin='round'
                        d='M11 19l-7-7 7-7M18 19l-7-7 7-7'
                      />
                    </svg>
                    <span
                      className={cn(
                        'text-sm font-medium transition-all duration-300 ease-in-out',
                        sidebarCollapsed
                          ? 'opacity-0 w-0 overflow-hidden'
                          : 'opacity-100 w-auto'
                      )}
                    >
                      Collapse
                    </span>
                  </div>
                </button>
              </div>
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
