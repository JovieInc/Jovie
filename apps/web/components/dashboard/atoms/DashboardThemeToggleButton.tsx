'use client';

import { MoonIcon, SunIcon } from '@heroicons/react/24/outline';
import { useTheme } from 'next-themes';
import { useState } from 'react';
import { DashboardHeaderActionButton } from '@/components/dashboard/atoms/DashboardHeaderActionButton';
import { setThemeSafe } from '@/lib/api-client/endpoints/dashboard/theme';

export function DashboardThemeToggleButton() {
  const { resolvedTheme, setTheme } = useTheme();
  const [isUpdating, setIsUpdating] = useState(false);

  const isDark = resolvedTheme === 'dark';
  const nextTheme = isDark ? 'light' : 'dark';

  const handleThemeChange = async () => {
    setIsUpdating(true);

    // Save theme preference to database for signed-in users
    const result = await setThemeSafe(nextTheme);

    if (result.ok) {
      // Only update local theme after successful API call
      setTheme(nextTheme);
    }

    setIsUpdating(false);
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
