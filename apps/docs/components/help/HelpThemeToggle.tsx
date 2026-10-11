'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

const THEME_ORDER = ['system', 'light', 'dark'] as const;

const THEME_LABEL: Record<(typeof THEME_ORDER)[number], string> = {
  system: 'System theme',
  light: 'Light theme',
  dark: 'Dark theme',
};

/**
 * Working theme control for the Help Center utility bar. Cycles
 * system → light → dark so both deliberate modes and OS parity are reachable
 * from one button.
 */
export function HelpThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const current = (THEME_ORDER as readonly string[]).includes(theme ?? '')
    ? (theme as (typeof THEME_ORDER)[number])
    : 'system';
  const next =
    THEME_ORDER[(THEME_ORDER.indexOf(current) + 1) % THEME_ORDER.length];

  return (
    <button
      type='button'
      className='help-icon-button'
      onClick={() => setTheme(next)}
      aria-label={`Theme: ${THEME_LABEL[current]}. Activate for ${THEME_LABEL[next].toLowerCase()}.`}
      title={THEME_LABEL[current]}
    >
      {mounted && current === 'light' ? (
        <Sun size={16} aria-hidden='true' />
      ) : mounted && current === 'dark' ? (
        <Moon size={16} aria-hidden='true' />
      ) : (
        <Monitor size={16} aria-hidden='true' />
      )}
    </button>
  );
}
