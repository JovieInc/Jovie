'use client';

import Link from 'next/link';
import React from 'react';

import { JovieIcon } from '@/components/atoms/JovieIcon';
import { Tooltip } from '@/components/atoms/Tooltip';
import { DashboardNav } from '@/components/dashboard/DashboardNav';
import { EnhancedThemeToggle } from '@/components/dashboard/molecules/EnhancedThemeToggle';
import { FeedbackButton } from '@/components/dashboard/molecules/FeedbackButton';
import { UserButton } from '@/components/molecules/UserButton';
import { Logo } from '@/components/ui/Logo';
import { cn } from '@/lib/utils';
import type { Artist } from '@/types/db';

export interface SidebarProps {
  collapsed: boolean;
  artist: Artist | null;
  onToggleCollapsed?: () => void;
}

export function Sidebar({
  collapsed,
  artist,
  onToggleCollapsed,
}: SidebarProps) {
  return (
    <div
      id='sidebar'
      className={cn(
        collapsed ? 'lg:w-16' : 'lg:w-64',
        'fixed lg:relative inset-y-0 left-0 z-50 flex flex-col transition-all duration-300 ease-in-out lg:translate-x-0',
        'border-r border-border border-opacity-20 dark:border-opacity-30 rounded-r-2xl'
      )}
    >
      <div className='flex grow flex-col gap-y-5 overflow-y-auto bg-surface-0 pt-2 pb-3'>
        {/* Brand */}
        <div className='flex h-16 shrink-0 items-center justify-center px-4'>
          <Link
            href='/dashboard/overview'
            className={
              'focus-visible:outline-none focus-visible:ring-2 ring-accent focus-visible:ring-offset-2 rounded-md transition-all duration-300 ease-in-out w-full h-full flex items-center justify-center'
            }
          >
            {collapsed ? (
              <JovieIcon className='h-6 w-6' />
            ) : (
              <div className='transition-all duration-300 ease-in-out'>
                <Logo size='md' />
              </div>
            )}
          </Link>
        </div>

        {/* Nav */}
        <nav
          className={cn(
            'flex flex-1 flex-col transition-all duration-300 ease-in-out',
            collapsed ? 'px-2' : 'px-3'
          )}
        >
          <DashboardNav collapsed={collapsed} />
        </nav>

        {/* Profile block */}
        <div className='flex-shrink-0 border-t border-border border-opacity-20 dark:border-opacity-30 p-3'>
          <div className='relative overflow-visible'>
            {/* Expanded */}
            <div
              className={cn(
                'transition-all duration-200 ease-in-out',
                collapsed
                  ? 'opacity-0 scale-95 pointer-events-none absolute inset-0'
                  : 'opacity-100 scale-100'
              )}
            >
              <div className='space-y-3'>
                <div className='flex items-center gap-3'>
                  <UserButton artist={artist} showUserInfo={true} />
                  {/* Quick actions */}
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

                {/* Actions */}
                <div className='flex items-center gap-1.5'>
                  <EnhancedThemeToggle variant='compact' />
                  <FeedbackButton collapsed={false} />
                </div>
              </div>
            </div>

            {/* Collapsed */}
            <div
              className={cn(
                'flex flex-col items-center justify-center gap-3 w-full transition-all duration-200 ease-in-out',
                collapsed
                  ? 'opacity-100 scale-100'
                  : 'opacity-0 scale-95 pointer-events-none absolute inset-0'
              )}
            >
              <div className='relative flex justify-center'>
                <UserButton artist={artist} showUserInfo={false} />
                <span className='absolute bottom-0 right-0 block h-2 w-2 rounded-full bg-green-500 ring-1 ring-surface-0' />
              </div>
              <Tooltip content='Toggle theme' placement='right'>
                <EnhancedThemeToggle variant='compact' />
              </Tooltip>
              <FeedbackButton collapsed={true} />
              {onToggleCollapsed && (
                <Tooltip content='Expand sidebar' placement='right'>
                  <button
                    onClick={onToggleCollapsed}
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
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
