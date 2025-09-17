'use client';

import { useTheme } from 'next-themes';
import * as React from 'react';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { ThemeSelector } from '@/components/molecules/ThemeSelector';

interface AppearanceSettingsProps {
  className?: string;
}

export function AppearanceSettings({ className }: AppearanceSettingsProps) {
  const { theme, setTheme } = useTheme();

  const handleThemeChange = async (newTheme: 'light' | 'dark' | 'system') => {
    setTheme(newTheme);

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
    <div className={className}>
      <DashboardCard variant='settings'>
        <h3 className='text-lg font-medium text-primary mb-6'>
          Interface Theme
        </h3>

        <ThemeSelector currentTheme={theme} onThemeChange={handleThemeChange} />
      </DashboardCard>
    </div>
  );
}
