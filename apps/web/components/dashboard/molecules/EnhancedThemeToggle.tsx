'use client';

import { DashboardThemeToggle as DashboardThemeToggleOrganism } from '@/components/dashboard/organisms/DashboardThemeToggle';
import { setThemeSafe } from '@/lib/api-client/endpoints/dashboard/theme';

interface EnhancedThemeToggleProps {
  onThemeChange?: (theme: 'light' | 'dark' | 'system') => void;
  showSystemOption?: boolean;
  variant?: 'default' | 'compact';
}

/**
 * @deprecated This component is a wrapper that adds business logic (API call to save theme).
 * For new code, use DashboardThemeToggle from organisms directly and handle theme saving in the parent component.
 * This wrapper exists for backward compatibility.
 */
export function EnhancedThemeToggle({
  onThemeChange,
  showSystemOption = false,
  variant = 'default',
}: EnhancedThemeToggleProps) {
  const handleThemeSave = async (newTheme: 'light' | 'dark' | 'system') => {
    // Save theme preference to database for signed-in users
    // Using setThemeSafe to avoid throwing errors - we silently fail on theme save errors
    await setThemeSafe(newTheme);
  };

  return (
    <DashboardThemeToggleOrganism
      onThemeChange={onThemeChange}
      onThemeSave={handleThemeSave}
      showSystemOption={showSystemOption}
      variant={variant}
    />
  );
}
