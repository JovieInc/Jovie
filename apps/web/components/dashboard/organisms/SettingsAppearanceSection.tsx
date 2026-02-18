'use client';

import { useTheme } from 'next-themes';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { useThemeMutation } from '@/lib/queries';
import { cn } from '@/lib/utils';

const THEME_OPTIONS = [
  { value: 'light', label: 'Aa' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
] as const;

export function SettingsAppearanceSection() {
  const { theme, setTheme } = useTheme();
  const { updateTheme, isPending } = useThemeMutation();

  const handleThemeChange = (newTheme: 'light' | 'dark' | 'system') => {
    setTheme(newTheme);
    updateTheme(newTheme);
  };

  return (
    <DashboardCard variant='settings' padding='none'>
      <div className='flex items-center justify-between px-5 py-4'>
        <div className='flex-1 min-w-0'>
          <h3 className='text-sm text-primary-token'>Interface theme</h3>
          <p className='mt-0.5 text-[13px] leading-normal text-tertiary-token'>
            Select or customize your interface color scheme
          </p>
        </div>
        <div className='shrink-0'>
          <div className='inline-flex items-center rounded-md border border-subtle bg-surface-1 p-0.5'>
            {THEME_OPTIONS.map(option => (
              <button
                type='button'
                key={option.value}
                onClick={() => handleThemeChange(option.value)}
                disabled={isPending}
                className={cn(
                  'rounded px-2.5 py-1 text-[13px] transition-colors duration-100',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  theme === option.value
                    ? 'bg-surface-3 text-primary-token'
                    : 'text-tertiary-token hover:text-secondary-token'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </DashboardCard>
  );
}
