'use client';

import { useTheme } from 'next-themes';
import React, { useEffect, useState } from 'react';

interface DatabaseThemeToggleProps {
  onThemeChange?: (theme: 'light' | 'dark' | 'system') => void;
}

export function DatabaseThemeToggle({
  onThemeChange,
}: DatabaseThemeToggleProps) {
  const [mounted, setMounted] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const { theme, setTheme, resolvedTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Don't render anything until mounted to prevent hydration mismatch
  if (!mounted) {
    return (
      <div className='flex items-center space-x-3'>
        <span className='text-sm text-gray-500 dark:text-gray-400'>Light</span>
        <div className='relative inline-flex h-6 w-11 flex-shrink-0 cursor-not-allowed rounded-full border-2 border-transparent bg-gray-200 transition-colors duration-200 ease-in-out'>
          <span className='translate-x-0 inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out'></span>
        </div>
        <span className='text-sm text-gray-500 dark:text-gray-400'>Dark</span>
      </div>
    );
  }

  const handleThemeChange = async (newTheme: 'light' | 'dark') => {
    setIsUpdating(true);
    setTheme(newTheme);

    try {
      // Save theme preference to database
      const response = await fetch('/api/dashboard/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          updates: {
            theme: { preference: newTheme },
          },
        }),
      });

      if (!response.ok) {
        console.error('Failed to save theme preference');
      }

      // Call the callback if provided
      onThemeChange?.(newTheme);
    } catch (error) {
      console.error('Error saving theme preference:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  const isDark = resolvedTheme === 'dark';
  const currentTheme = theme === 'system' ? resolvedTheme : theme;

  return (
    <div className='flex items-center space-x-3'>
      <span
        className={`text-sm ${currentTheme === 'light' ? 'text-gray-900 font-medium' : 'text-gray-500'} dark:text-gray-400`}
      >
        Light
      </span>
      <button
        type='button'
        disabled={isUpdating}
        onClick={() => handleThemeChange(isDark ? 'light' : 'dark')}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
          isDark ? 'bg-indigo-600' : 'bg-gray-200'
        }`}
        role='switch'
        aria-checked={isDark}
      >
        <span className='sr-only'>
          {isUpdating
            ? 'Updating theme...'
            : `Switch to ${isDark ? 'light' : 'dark'} mode`}
        </span>
        <span
          aria-hidden='true'
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            isDark ? 'translate-x-5' : 'translate-x-0'
          } ${isUpdating ? 'animate-pulse' : ''}`}
        />
      </button>
      <span
        className={`text-sm ${currentTheme === 'dark' ? 'text-gray-900 font-medium' : 'text-gray-500'} dark:text-white`}
      >
        Dark
      </span>
    </div>
  );
}
