'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import type { ThemeValue, UseDashboardThemeReturn } from './types';

interface UseDashboardThemeOptions {
  onThemeChange?: (theme: ThemeValue) => void;
  onThemeSave?: (theme: ThemeValue) => Promise<void>;
}

export function useDashboardTheme({
  onThemeChange,
  onThemeSave,
}: UseDashboardThemeOptions): UseDashboardThemeReturn {
  const [mounted, setMounted] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const { theme, setTheme, resolvedTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleThemeChange = async (newTheme: ThemeValue) => {
    setIsUpdating(true);
    setTheme(newTheme);

    try {
      if (onThemeSave) {
        await onThemeSave(newTheme);
      }

      onThemeChange?.(newTheme);
    } catch (error) {
      console.error('Error saving theme preference:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  return {
    mounted,
    isUpdating,
    theme,
    resolvedTheme,
    isDark: resolvedTheme === 'dark',
    handleThemeChange,
  };
}
