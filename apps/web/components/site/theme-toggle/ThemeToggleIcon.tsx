'use client';

/**
 * ThemeToggleIcon Component
 *
 * Renders the appropriate icon based on current theme state
 */

import { MoonIcon, SunIcon, SystemIcon } from './ThemeIcons';

interface ThemeToggleIconProps
  extends Readonly<{
    readonly theme?: string;
    readonly resolvedTheme?: string;
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
