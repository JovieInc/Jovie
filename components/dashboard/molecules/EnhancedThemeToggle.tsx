'use client';

import { useTheme } from 'next-themes';
import React, { useEffect, useState } from 'react';
import { controlClasses } from '@/components/atoms/ControlStyles';

interface EnhancedThemeToggleProps {
  onThemeChange?: (theme: 'light' | 'dark' | 'system') => void;
  showSystemOption?: boolean;
  variant?: 'default' | 'compact';
}

export function EnhancedThemeToggle({
  onThemeChange,
  showSystemOption = false,
  variant = 'default',
}: EnhancedThemeToggleProps) {
  const [mounted, setMounted] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const { theme, setTheme, resolvedTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return showSystemOption ? (
      <div className='space-y-3'>
        <div className='animate-pulse space-y-3'>
          <div className='h-4 bg-surface-hover-token rounded w-24'></div>
          <div className='h-8 bg-surface-hover-token rounded'></div>
        </div>
      </div>
    ) : (
      <div className='flex items-center space-x-3'>
        <span className='text-sm text-secondary-token'>Light</span>
        <div className='relative inline-flex h-6 w-11 flex-shrink-0 cursor-not-allowed rounded-full border border-border bg-surface-hover-token p-0.5 transition-colors duration-200 ease-in-out'>
          <span className='translate-x-0 inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out'></span>
        </div>
        <span className='text-sm text-secondary-token'>Dark</span>
      </div>
    );
  }

  const handleThemeChange = async (newTheme: 'light' | 'dark' | 'system') => {
    setIsUpdating(true);
    setTheme(newTheme);

    try {
      // Save theme preference to database for signed-in users
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

      onThemeChange?.(newTheme);
    } catch (error) {
      console.error('Error saving theme preference:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  if (showSystemOption) {
    // Full theme selector with system option (for settings page)
    return (
      <div className='space-y-3'>
        <label className='text-sm font-medium text-primary-token'>
          Theme Preference
        </label>
        <div className='grid grid-cols-3 gap-2'>
          {[
            { value: 'light', label: 'Light', icon: '☀️' },
            { value: 'dark', label: 'Dark', icon: '🌙' },
            { value: 'system', label: 'System', icon: '💻' },
          ].map(option => (
            <button
              key={option.value}
              onClick={() =>
                handleThemeChange(option.value as 'light' | 'dark' | 'system')
              }
              disabled={isUpdating}
              className={`
                flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all duration-200
                ${
                  theme === option.value
                    ? 'border-accent bg-accent/10 text-primary-token'
                    : 'border-border hover:bg-surface-hover-token text-secondary-token'
                }
                disabled:opacity-50 disabled:cursor-not-allowed
              `}
            >
              <span className='text-lg mb-1'>{option.icon}</span>
              <span className='text-xs font-medium'>{option.label}</span>
              {theme === option.value && option.value === 'system' && (
                <span className='text-xs text-secondary-token mt-1'>
                  ({resolvedTheme})
                </span>
              )}
            </button>
          ))}
        </div>
        <p className='text-xs text-secondary-token'>
          Choose how the interface appears. System follows your device settings.
        </p>
      </div>
    );
  }

  // Simple toggle (for sidebar)
  const isDark = resolvedTheme === 'dark';

  if (variant === 'compact') {
    return (
      <button
        type='button'
        disabled={isUpdating}
        onClick={() => handleThemeChange(isDark ? 'light' : 'dark')}
        className={`${controlClasses({ variant: 'neutral', size: 'sm' })} w-8 h-8 p-0 group items-center justify-center ${
          isUpdating ? 'animate-pulse' : 'hover:scale-105 active:scale-95'
        }`}
        title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {isDark ? (
          <svg
            className='h-4 w-4 mx-auto my-auto text-blue-400 group-hover:text-blue-300 transition-colors duration-200'
            fill='currentColor'
            viewBox='0 0 20 20'
          >
            <path
              fillRule='evenodd'
              d='M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z'
              clipRule='evenodd'
            />
          </svg>
        ) : (
          <svg
            className='h-4 w-4 mx-auto my-auto text-amber-500 group-hover:text-amber-400 transition-colors duration-200'
            fill='currentColor'
            viewBox='0 0 20 20'
          >
            <path
              fillRule='evenodd'
              d='M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z'
              clipRule='evenodd'
            />
          </svg>
        )}
      </button>
    );
  }

  return (
    <button
      type='button'
      disabled={isUpdating}
      onClick={() => handleThemeChange(isDark ? 'light' : 'dark')}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border border-border transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 disabled:cursor-not-allowed ${
        isDark ? 'bg-accent' : 'bg-surface-hover-token'
      } p-0.5`}
      role='switch'
      aria-checked={isDark}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <span className='sr-only'>
        {isUpdating
          ? 'Updating theme...'
          : `Switch to ${isDark ? 'light' : 'dark'} mode`}
      </span>
      <span
        aria-hidden='true'
        className={`flex h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out items-center justify-center ${
          isDark ? 'translate-x-5' : 'translate-x-0'
        } ${isUpdating ? 'animate-pulse' : ''}`}
      >
        {isDark ? (
          <svg
            className='h-3 w-3 text-accent-token'
            fill='currentColor'
            viewBox='0 0 20 20'
          >
            <path
              fillRule='evenodd'
              d='M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z'
              clipRule='evenodd'
            />
          </svg>
        ) : (
          <svg
            className='h-3 w-3 text-yellow-500'
            fill='currentColor'
            viewBox='0 0 20 20'
          >
            <path
              fillRule='evenodd'
              d='M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z'
              clipRule='evenodd'
            />
          </svg>
        )}
      </span>
    </button>
  );
}
