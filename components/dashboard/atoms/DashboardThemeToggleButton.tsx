'use client';

import { MoonIcon, SunIcon } from '@heroicons/react/24/outline';
import { useTheme } from 'next-themes';
import { DashboardHeaderActionButton } from '@/components/dashboard/atoms/DashboardHeaderActionButton';

export function DashboardThemeToggleButton() {
  const { resolvedTheme, setTheme } = useTheme();

  const isDark = resolvedTheme === 'dark';
  const nextTheme = isDark ? 'light' : 'dark';

  return (
    <DashboardHeaderActionButton
      ariaLabel={`Switch to ${nextTheme} mode`}
      pressed={isDark}
      onClick={() => setTheme(nextTheme)}
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
