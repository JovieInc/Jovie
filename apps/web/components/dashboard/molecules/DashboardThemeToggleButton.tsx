'use client';

import { MoonIcon, SunIcon } from '@heroicons/react/24/outline';
import { DashboardHeaderActionButton } from '@/components/dashboard/atoms/DashboardHeaderActionButton';

export interface DashboardThemeToggleButtonProps {
  theme?: 'light' | 'dark';
  onThemeChange?: (theme: 'light' | 'dark') => void;
}

export function DashboardThemeToggleButton({
  theme,
  onThemeChange,
}: DashboardThemeToggleButtonProps) {
  const isDark = theme === 'dark';
  const nextTheme = isDark ? 'light' : 'dark';

  const handleClick = () => {
    onThemeChange?.(nextTheme);
  };

  return (
    <DashboardHeaderActionButton
      ariaLabel={`Switch to ${nextTheme} mode`}
      pressed={isDark}
      onClick={handleClick}
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
