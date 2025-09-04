'use client';

import {
  ArrowTopRightOnSquareIcon,
  DocumentDuplicateIcon,
} from '@heroicons/react/24/outline';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { Divider } from '@/components/atoms/Divider';
import { IconButton } from '@/components/atoms/IconButton';
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
            <div className='flex grow flex-col gap-y-5 overflow-y-auto overflow-x-visible bg-surface-0 backdrop-blur-sm border-r border-subtle rounded-r-2xl shadow-md lg:shadow-lg pt-2 pb-3 ring-1 ring-black/5 dark:ring-white/5'>
              {/* Header with logo and top toggle */}
              <div className='relative flex h-16 shrink-0 items-center px-4 overflow-visible'>
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
                  <button
                    id='sidebar-toggle'
                    onClick={handleToggleSidebarCollapsed}
                    className='hidden lg:flex ml-auto items-center justify-center w-8 h-8 rounded-md border border-subtle bg-surface-0 text-tertiary-token shadow hover:bg-surface-2 hover:text-secondary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1'
                    aria-label='Collapse sidebar'
                  >
                    <svg
                      className='w-3.5 h-3.5 transition-all duration-200 ease-in-out shrink-0'
                      fill='none'
                      viewBox='0 0 24 24'
                      stroke='currentColor'
                      strokeWidth={2.5}
                    >
                      <path
                        strokeLinecap='round'
                        strokeLinejoin='round'
                        d='M15 19l-7-7 7-7'
                      />
                    </svg>
                  </button>
                )}

                {/* Collapsed mode: toggle floats outside to the right */}
                {sidebarCollapsed && (
                  <button
                    id='sidebar-toggle'
                    onClick={handleToggleSidebarCollapsed}
                    className='hidden lg:flex absolute -right-3 top-1/2 -translate-y-1/2 z-50 items-center justify-center w-8 h-8 rounded-md border border-subtle bg-surface-0 text-tertiary-token shadow-lg hover:bg-surface-2 hover:text-secondary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1'
                    aria-label='Expand sidebar'
                  >
                    <svg
                      className='w-3.5 h-3.5 transition-all duration-200 ease-in-out shrink-0 rotate-180'
                      fill='none'
                      viewBox='0 0 24 24'
                      stroke='currentColor'
                      strokeWidth={2.5}
                    >
                      <path
                        strokeLinecap='round'
                        strokeLinejoin='round'
                        d='M15 19l-7-7 7-7'
                      />
                    </svg>
                  </button>
                )}
              </div>

              <nav
                className={cn(
                  'flex flex-1 flex-col transition-all duration-300 ease-in-out',
                  sidebarCollapsed ? 'px-2' : 'px-3'
                )}
              >
                <DashboardNav collapsed={sidebarCollapsed} />
              </nav>

              {/* Profile URL block above user menu (expanded only) */}
              {!sidebarCollapsed && artist?.handle && (
                <div className={cn('px-3', 'mb-2')}>
                  <div className='flex items-center justify-between rounded-md border border-subtle bg-surface-1 px-3 py-2'>
                    <div className='min-w-0'>
                      <p className='text-xs text-tertiary-token truncate'>
                        Jovie Profile
                      </p>
                      <p className='text-sm font-medium text-primary-token truncate'>{`https://jov.ie/${artist.handle}`}</p>
                    </div>
                    <div className='ml-2 flex items-center gap-1.5'>
                      <Tooltip content='Copy profile URL' placement='top'>
                        <IconButton
                          ariaLabel='Copy profile URL'
                          title='Copy profile URL'
                          onClick={() => {
                            if (artist?.handle) {
                              navigator.clipboard.writeText(
                                `https://jov.ie/${artist.handle}`
                              );
                            }
                          }}
                          size='sm'
                          variant='subtle'
                        >
                          <DocumentDuplicateIcon className='w-4 h-4' />
                        </IconButton>
                      </Tooltip>
                      <Tooltip content='Open profile' placement='top'>
                        <IconButton
                          ariaLabel='Open profile in new tab'
                          title='Open profile'
                          href={`/${artist.handle}`}
                          target='_blank'
                          rel='noopener noreferrer'
                          size='sm'
                          variant='subtle'
                        >
                          <ArrowTopRightOnSquareIcon className='w-4 h-4' />
                        </IconButton>
                      </Tooltip>
                    </div>
                  </div>
                </div>
              )}

              {/* Divider above profile block */}
              <Divider inset className='mt-1' />

              {/* Profile Block - Always show avatar + handle with quick actions */}
              <div className='flex-shrink-0 p-3'>
                <div className='relative overflow-hidden'>
                  {/* Profile section (expanded state) */}
                  <div
                    className={cn(
                      'transition-all duration-200 ease-in-out',
                      sidebarCollapsed
                        ? 'opacity-0 scale-95 pointer-events-none absolute inset-0'
                        : 'opacity-100 scale-100'
                    )}
                  >
                    <div className='space-y-3'>
                      {/* Profile info */}
                      <div className='flex items-center gap-3'>
                        <UserButton artist={artist} showUserInfo={true} />
                      </div>

                      {/* Action buttons group */}
                      <div className='flex items-center gap-1.5'>
                        <EnhancedThemeToggle variant='compact' />
                        <FeedbackButton collapsed={false} />
                      </div>
                    </div>
                  </div>

                  {/* Profile section (collapsed state) */}
                  <div
                    className={cn(
                      'flex flex-col items-center gap-2 w-full transition-all duration-200 ease-in-out',
                      sidebarCollapsed
                        ? 'opacity-100 scale-100'
                        : 'opacity-0 scale-95 pointer-events-none absolute inset-0'
                    )}
                  >
                    <Tooltip content={`Account`} shortcut='U' placement='right'>
                      <UserButton artist={artist} showUserInfo={false} />
                    </Tooltip>

                    <Tooltip content='Theme' shortcut='T' placement='right'>
                      <EnhancedThemeToggle variant='compact' />
                    </Tooltip>

                    <Tooltip content='Feedback' shortcut='F' placement='right'>
                      <FeedbackButton collapsed={true} />
                    </Tooltip>

                    {/* Spacer where the floating toggle button sits when collapsed */}
                  </div>
                </div>
              </div>

              {/* bottom toggle removed; handled in header */}
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
