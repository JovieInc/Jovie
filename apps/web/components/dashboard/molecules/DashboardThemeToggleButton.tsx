'use client';

import { Moon, Sun } from 'lucide-react';
import { DashboardHeaderActionButton } from '@/components/dashboard/atoms/DashboardHeaderActionButton';

export interface DashboardThemeToggleButtonProps {
  readonly theme?: 'light' | 'dark';
  readonly onThemeChange?: (theme: 'light' | 'dark') => void;
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
          <Moon className='h-4 w-4' aria-hidden='true' />
        ) : (
          <Sun className='h-4 w-4' aria-hidden='true' />
        )
      }
    />
  );
}
