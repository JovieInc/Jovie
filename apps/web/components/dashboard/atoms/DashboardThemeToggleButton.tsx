'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { DashboardHeaderActionButton } from '@/components/dashboard/atoms/DashboardHeaderActionButton';
import { useThemeMutation } from '@/lib/queries/useSettingsMutation';

export function DashboardThemeToggleButton() {
  const { resolvedTheme, setTheme } = useTheme();
  const { updateTheme, isPending } = useThemeMutation();

  const isDark = resolvedTheme === 'dark';
  const nextTheme = isDark ? 'light' : 'dark';

  const handleThemeChange = () => {
    // Optimistically update local theme, then persist to server
    setTheme(nextTheme);
    updateTheme(nextTheme);
  };

  return (
    <DashboardHeaderActionButton
      ariaLabel={`Switch to ${nextTheme} mode`}
      pressed={isDark}
      disabled={isPending}
      onClick={handleThemeChange}
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
