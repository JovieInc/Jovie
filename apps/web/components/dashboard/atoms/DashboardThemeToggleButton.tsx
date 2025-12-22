'use client';

import { MoonIcon, SunIcon } from '@heroicons/react/24/outline';
import { useTheme } from 'next-themes';
import { useState } from 'react';
import { DashboardHeaderActionButton } from '@/components/dashboard/atoms/DashboardHeaderActionButton';

export function DashboardThemeToggleButton() {
  const { resolvedTheme, setTheme } = useTheme();
  const [isUpdating, setIsUpdating] = useState(false);

  const isDark = resolvedTheme === 'dark';
  const nextTheme = isDark ? 'light' : 'dark';

  const handleThemeChange = async () => {
    setIsUpdating(true);

    try {
      // Save theme preference to database for signed-in users
      const response = await fetch('/api/dashboard/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          updates: {
            theme: { preference: nextTheme },
          },
        }),
      });

      if (!response.ok) {
        console.error('Failed to save theme preference');
        // Don't update local theme if API call failed
        return;
      }

      // Only update local theme after successful API call
      setTheme(nextTheme);
    } catch (error) {
      console.error('Error saving theme preference:', error);
      // Don't update local theme if API call failed
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <DashboardHeaderActionButton
      ariaLabel={`Switch to ${nextTheme} mode`}
      pressed={isDark}
      disabled={isUpdating}
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
