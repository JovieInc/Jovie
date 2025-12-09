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
        className={`flex gap-x-1.5 rounded-full bg-gray-600/5 p-1 ring-1 ring-gray-600/5 dark:bg-black/30 dark:ring-white/5 ${className}`}
      >
        <div className='size-5 rounded-full bg-gray-300/50 dark:bg-gray-700/50' />
        <div className='size-5 rounded-full bg-gray-300/50 dark:bg-gray-700/50' />
        <div className='size-5 rounded-full bg-gray-300/50 dark:bg-gray-700/50' />
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
      'relative size-5 flex-none rounded-full outline-none transition-colors text-gray-400 hover:text-gray-800 dark:text-gray-500 dark:hover:text-gray-300';
    const activeBtn =
      'bg-white text-gray-800 shadow-[0_1px_5px_-4px_rgba(19,19,22,0.4),0_2px_5px_rgba(34,42,53,0.06)] ring-1 ring-gray-900/10 dark:bg-gray-800 dark:text-gray-300 dark:ring-white/20';

    return (
      <div
        role='toolbar'
        aria-label='Theme'
        className={`flex gap-x-1.5 rounded-full bg-gray-600/5 p-1 ring-1 ring-gray-600/5 dark:bg-black/30 dark:ring-white/5 ${className}`}
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
            className='size-5'
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
            className='size-5'
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
            className='size-5'
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
