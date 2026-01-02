'use client';

import { useTheme } from 'next-themes';
import { useEffect, useId, useMemo, useState } from 'react';
import type { ThemeOption, ThemeValue } from './types';

export interface UseThemeToggleReturn {
  mounted: boolean;
  theme: string | undefined;
  setTheme: (theme: string) => void;
  resolvedTheme: string | undefined;
  cycleTheme: () => void;
  getNextTheme: () => ThemeValue;
  shortcutDisplay: string | undefined;
  shortcutDescription: string | undefined;
  shortcutDescriptionId: string;
  themes: ThemeOption[];
  currentTheme: ThemeValue;
  activeIndex: number;
  indicatorX: number;
}

const BUTTON_SIZE_PX = 28;
const GAP_PX = 0;

const THEMES: ThemeOption[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export function useThemeToggle(shortcutKey?: string): UseThemeToggleReturn {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme, resolvedTheme } = useTheme();

  const cycleTheme = () => {
    if (theme === 'light') {
      setTheme('dark');
    } else if (theme === 'dark') {
      setTheme('system');
    } else {
      setTheme('light');
    }
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  const shortcutDisplay = shortcutKey?.trim().toUpperCase();
  const shortcutDescription = shortcutDisplay
    ? `Press ${shortcutDisplay} to toggle between light and dark themes.`
    : undefined;
  const shortcutDescriptionId = useId();

  const getNextTheme = (): ThemeValue => {
    if (theme === 'light') return 'dark';
    if (theme === 'dark') return 'system';
    return 'light';
  };

  const currentTheme = (theme ?? 'system') as ThemeValue;
  const activeIndex = useMemo(
    () =>
      Math.max(
        0,
        THEMES.findIndex(t => t.value === currentTheme)
      ),
    [currentTheme]
  );
  const indicatorX = activeIndex * (BUTTON_SIZE_PX + GAP_PX);

  return {
    mounted,
    theme,
    setTheme,
    resolvedTheme,
    cycleTheme,
    getNextTheme,
    shortcutDisplay,
    shortcutDescription,
    shortcutDescriptionId,
    themes: THEMES,
    currentTheme,
    activeIndex,
    indicatorX,
  };
}
