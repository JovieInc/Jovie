'use client';

import { Button } from '@jovie/ui';
import React from 'react';
import { Tooltip } from '@/components/atoms/Tooltip';
import { useArtistTheme } from './ArtistThemeProvider';

export function ArtistThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useArtistTheme();

  const handleToggle = () => {
    if (theme === 'auto') {
      // If currently auto, switch to the opposite of current resolved theme
      setTheme(resolvedTheme === 'light' ? 'dark' : 'light');
    } else {
      // If currently set to a specific theme, switch to the opposite
      setTheme(theme === 'light' ? 'dark' : 'light');
    }
  };

  return (
    <Tooltip
      content={`Switch to ${resolvedTheme === 'light' ? 'dark' : 'light'} mode`}
      placement='right'
    >
      <Button
        variant='ghost'
        size='sm'
        onClick={handleToggle}
        className='h-8 w-8 px-0 rounded-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 transition-colors'
      >
        <span className='sr-only'>Toggle theme</span>
        {resolvedTheme === 'light' ? (
          <svg
            className='h-5 w-5 text-gray-700 dark:text-gray-300'
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
        ) : (
          <svg
            className='h-5 w-5 text-gray-700 dark:text-gray-300'
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
        )}
      </Button>
    </Tooltip>
  );
}
