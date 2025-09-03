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
              </div>

              <nav
                className={cn(
                  'flex flex-1 flex-col transition-all duration-300 ease-in-out',
                  sidebarCollapsed ? 'px-2' : 'px-3'
                )}
              >
                <DashboardNav collapsed={sidebarCollapsed} />
              </nav>

              {/* Profile Block - Always show avatar + handle with quick actions */}
              <div className='flex-shrink-0 border-t border-subtle/30 p-3'>
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
                      {/* Profile info with quick actions */}
                      <div className='flex items-center gap-3'>
                        <UserButton artist={artist} showUserInfo={true} />
                        {/* Quick action buttons */}
                        <div className='flex items-center gap-1'>
                          <Tooltip content='Copy profile URL' placement='top'>
                            <button
                              onClick={() => {
                                if (artist?.handle) {
                                  navigator.clipboard.writeText(
                                    `https://jov.ie/${artist.handle}`
                                  );
                                }
                              }}
                              className='p-1.5 rounded-md hover:bg-surface-2 text-tertiary-token hover:text-secondary-token transition-colors'
                            >
                              <svg
                                className='w-3.5 h-3.5'
                                fill='none'
                                stroke='currentColor'
                                viewBox='0 0 24 24'
                              >
                                <path
                                  strokeLinecap='round'
                                  strokeLinejoin='round'
                                  strokeWidth={2}
                                  d='M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z'
                                />
                              </svg>
                            </button>
                          </Tooltip>
                          <Tooltip content='Open profile' placement='top'>
                            <Link
                              href={`/${artist?.handle || ''}`}
                              target='_blank'
                              className='p-1.5 rounded-md hover:bg-surface-2 text-tertiary-token hover:text-secondary-token transition-colors'
                            >
                              <svg
                                className='w-3.5 h-3.5'
                                fill='none'
                                stroke='currentColor'
                                viewBox='0 0 24 24'
                              >
                                <path
                                  strokeLinecap='round'
                                  strokeLinejoin='round'
                                  strokeWidth={2}
                                  d='M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14'
                                />
                              </svg>
                            </Link>
                          </Tooltip>
                        </div>
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
                    <Tooltip
                      content={`You're logged in as @${artist?.handle || 'user'}`}
                      placement='right'
                    >
                      <UserButton artist={artist} showUserInfo={false} />
                    </Tooltip>

                    <Tooltip content='Toggle theme' placement='right'>
                      <EnhancedThemeToggle variant='compact' />
                    </Tooltip>

                    <FeedbackButton collapsed={true} />

                    <Tooltip content='Expand sidebar' placement='right'>
                      <button
                        onClick={handleToggleSidebarCollapsed}
                        className='hidden lg:flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200 ease-in-out text-tertiary-token hover:text-secondary-token hover:bg-surface-2/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1'
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
                    </Tooltip>
                  </div>
                </div>
              </div>

              {/* Support & Utility Section - Only visible when expanded */}
              {!sidebarCollapsed && (
                <div className='flex-shrink-0 p-3'>
                  {/* Minimal collapse button */}
                  <button
                    id='sidebar-toggle'
                    onClick={handleToggleSidebarCollapsed}
                    className={cn(
                      'hidden lg:flex items-center w-full rounded-md transition-all duration-200 ease-in-out',
                      'text-tertiary-token hover:text-secondary-token hover:bg-surface-2/50',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1',
                      'group relative overflow-hidden',
                      'justify-start gap-2 px-3 py-2'
                    )}
                    aria-label='Collapse sidebar'
                  >
                    {/* Minimal chevron icon */}
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

                    {/* Text label */}
                    <span className='text-xs font-medium'>Collapse</span>
                  </button>
                </div>
              )}
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
