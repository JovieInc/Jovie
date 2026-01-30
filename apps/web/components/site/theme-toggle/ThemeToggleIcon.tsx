'use client';

/**
 * ThemeToggleIcon Component
 *
 * Renders the appropriate icon based on current theme state
 */

import { MoonIcon, SunIcon, SystemIcon } from './ThemeIcons';

interface ThemeToggleIconProps
  extends Readonly<{
    theme?: string;
    resolvedTheme?: string;
  }> {}

export function ThemeToggleIcon({
  theme,
  resolvedTheme,
}: ThemeToggleIconProps) {
  if (theme === 'system') {
    return <SystemIcon />;
  }
  if (resolvedTheme === 'light') {
    return <MoonIcon />;
  }
  return <SunIcon />;
}
