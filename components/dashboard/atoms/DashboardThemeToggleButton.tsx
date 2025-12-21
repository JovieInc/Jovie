'use client';

import { MoonIcon, SunIcon } from '@heroicons/react/24/outline';
import { useTheme } from 'next-themes';
import { DashboardHeaderActionButton } from '@/components/dashboard/atoms/DashboardHeaderActionButton';

export function DashboardThemeToggleButton() {
  const { resolvedTheme, setTheme } = useTheme();

  const isDark = resolvedTheme === 'dark';
  const nextTheme = isDark ? 'light' : 'dark';

  const handleThemeChange = () => {
    // Update theme immediately for responsive feedback (optimistic update)
    setTheme(nextTheme);

    // Persist to API in background - don't block UI
    fetch('/api/dashboard/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        updates: {
          theme: { preference: nextTheme },
        },
      }),
    }).catch(error => {
      // Log error but don't revert - local theme change is still valid
      console.error('Failed to persist theme preference:', error);
    });
  };

  return (
    <DashboardHeaderActionButton
      ariaLabel={`Switch to ${nextTheme} mode`}
      pressed={isDark}
      onClick={handleThemeChange}
      icon={
        isDark ? (
          <MoonIcon className='h-4 w-4' aria-hidden='true' />
        ) : (
          <SunIcon className='h-4 w-4' aria-hidden='true' />
        )
      }
    />
  );
}
