'use client';

import { useTheme } from 'next-themes';
import { DashboardThemeToggleButton as DashboardThemeToggleButtonMolecule } from '@/components/dashboard/molecules/DashboardThemeToggleButton';

/**
 * @deprecated This component is a wrapper that adds business logic (theme management).
 * For new code, use the molecule version directly and handle theme in the parent component.
 * This wrapper exists for backward compatibility.
 */
export function DashboardThemeToggleButton() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <DashboardThemeToggleButtonMolecule
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      onThemeChange={setTheme}
    />
  );
}
