'use client';

import { DashboardThemeToggle as DashboardThemeToggleOrganism } from '@/components/dashboard/organisms/DashboardThemeToggle';

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
    try {
      // Save theme preference to database for signed-in users
      const response = await fetch('/api/dashboard/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          updates: {
            theme: { preference: newTheme },
          },
        }),
      });

      if (!response.ok) {
        console.error('Failed to save theme preference');
      }
    } catch (error) {
      console.error('Error saving theme preference:', error);
    }
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
