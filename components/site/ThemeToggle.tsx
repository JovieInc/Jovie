'use client';

import { Button } from '@jovie/ui';
import { useTheme } from 'next-themes';
import React, { useEffect, useState } from 'react';

interface ThemeToggleProps {
  appearance?: 'icon' | 'segmented';
  className?: string;
}

export function ThemeToggle({
  appearance = 'icon',
  className = '',
}: ThemeToggleProps) {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme, resolvedTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Don't render anything until mounted to prevent hydration mismatch
  if (!mounted) {
    return appearance === 'segmented' ? (
      <div
        role='toolbar'
        aria-label='Theme'
        className={`inline-flex items-center gap-px rounded-full border border-neutral-200 bg-white p-[2px] dark:border-white/10 dark:bg-black/30 ${className}`}
      >
        <div className='h-7 w-7 rounded-full bg-gray-100 dark:bg-white/10' />
        <div className='h-7 w-7 rounded-full bg-gray-100 dark:bg-white/10' />
        <div className='h-7 w-7 rounded-full bg-gray-100 dark:bg-white/10' />
      </div>
    ) : (
      <Button variant='ghost' size='sm' className='h-8 w-8 px-0' disabled>
        <span className='sr-only'>Loading theme toggle</span>
        <div className='h-4 w-4 animate-pulse rounded-sm bg-gray-300 dark:bg-gray-600' />
      </Button>
    );
  }

  const cycleTheme = () => {
    if (theme === 'light') {
      setTheme('dark');
    } else if (theme === 'dark') {
      setTheme('system');
    } else {
      setTheme('light');
    }
  };

  const getThemeIcon = () => {
    if (theme === 'system') {
      // System theme - show a computer/auto icon
      return (
        <svg
          className='h-5 w-5'
          fill='none'
          stroke='currentColor'
          viewBox='0 0 24 24'
        >
          <path
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth={2}
            d='M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z'
          />
        </svg>
      );
    } else if (resolvedTheme === 'light') {
      // Light theme - show moon (to switch to dark)
      return (
        <svg
          className='h-5 w-5'
          fill='none'
          stroke='currentColor'
          viewBox='0 0 24 24'
        >
          <path
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth={2}
            d='M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z'
          />
        </svg>
      );
    } else {
      // Dark theme - show sun (to switch to light)
      return (
        <svg
          className='h-5 w-5'
          fill='none'
          stroke='currentColor'
          viewBox='0 0 24 24'
        >
          <path
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth={2}
            d='M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z'
          />
        </svg>
      );
    }
  };

  const getNextTheme = () => {
    if (theme === 'light') return 'dark';
    if (theme === 'dark') return 'system';
    return 'light';
  };

  if (appearance === 'segmented') {
    const baseBtn =
      'relative flex h-7 w-7 flex-none items-center justify-center rounded-full text-secondary-token outline-none transition-colors hover:bg-gray-100 hover:text-primary-token dark:hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-transparent';
    const activeBtn =
      'z-10 bg-gray-100 text-primary-token ring-1 ring-inset ring-neutral-200 dark:bg-white/10 dark:ring-white/10';

    return (
      <div
        role='toolbar'
        aria-label='Theme'
        className={`inline-flex items-center gap-px rounded-full border border-neutral-200 bg-white p-[2px] dark:border-white/10 dark:bg-black/30 ${className}`}
      >
        <button
          type='button'
          aria-label='Light'
          className={`${baseBtn} ${theme === 'light' ? activeBtn : ''}`}
          onClick={() => setTheme('light')}
        >
          <span className='absolute inset-[calc(-3/16*1rem)]' />
          <svg
            viewBox='0 0 20 20'
            fill='none'
            aria-hidden='true'
            className='h-3.5 w-3.5'
          >
            <circle
              cx='10'
              cy='10'
              r='3.25'
              stroke='currentColor'
              strokeWidth='1.5'
              fill={theme === 'light' ? 'currentColor' : 'none'}
              fillOpacity={theme === 'light' ? '0.15' : '0'}
            />
            <g
              stroke='currentColor'
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth='1.5'
            >
              <path d='M10 3.75v.5M14.42 5.58l-.354.354M16.25 10h-.5M14.42 14.42l-.354-.354M10 15.75v.5M5.934 14.065l-.354.354M4.25 10h-.5M5.934 5.935 5.58 5.58' />
            </g>
          </svg>
        </button>
        <button
          type='button'
          aria-label='Dark'
          className={`${baseBtn} ${theme === 'dark' ? activeBtn : ''}`}
          onClick={() => setTheme('dark')}
        >
          <span className='absolute inset-[calc(-3/16*1rem)]' />
          <svg
            viewBox='0 0 20 20'
            fill='none'
            aria-hidden='true'
            className='h-3.5 w-3.5'
          >
            <path
              stroke='currentColor'
              strokeWidth='1.5'
              strokeLinecap='round'
              strokeLinejoin='round'
              fill={theme === 'dark' ? 'currentColor' : 'none'}
              fillOpacity={theme === 'dark' ? '0.15' : '0'}
              d='M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z'
            />
          </svg>
        </button>
        <button
          type='button'
          aria-label='System'
          className={`${baseBtn} ${theme === 'system' ? activeBtn : ''}`}
          onClick={() => setTheme('system')}
        >
          <span className='absolute inset-[calc(-3/16*1rem)]' />
          <svg
            viewBox='0 0 20 20'
            fill='none'
            aria-hidden='true'
            className='h-3.5 w-3.5'
          >
            <path
              stroke='currentColor'
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth='1.5'
              fill={theme === 'system' ? 'currentColor' : 'none'}
              fillOpacity={theme === 'system' ? '0.15' : '0'}
              d='M10 12.5v2.75m0 0H7.75m2.25 0h2.25m-6.5-3h8.5a1 1 0 0 0 1-1v-5.5a1 1 0 0 0-1-1h-8.5a1 1 0 0 0-1 1v5.5a1 1 0 0 0 1 1Z'
            />
          </svg>
        </button>
      </div>
    );
  }

  const isDarkUi = resolvedTheme === 'dark';

  return (
    <Button
      variant='ghost'
      size='sm'
      onClick={cycleTheme}
      className={`h-8 w-8 p-0 flex items-center justify-center rounded-full shadow-sm ring-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-transparent ${
        isDarkUi
          ? 'bg-white/10 text-white ring-white/30 hover:bg-white/20'
          : 'bg-white text-black ring-black/10 hover:bg-gray-50'
      } ${className}`}
      title={`Current: ${theme === 'system' ? `auto (${resolvedTheme})` : theme}. Click to switch to ${getNextTheme()}`}
    >
      <span className='sr-only'>
        Toggle theme (current:{' '}
        {theme === 'system' ? `auto, showing ${resolvedTheme}` : theme})
      </span>
      {getThemeIcon()}
    </Button>
  );
}
