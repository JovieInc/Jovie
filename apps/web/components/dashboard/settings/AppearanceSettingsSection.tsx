'use client';

import { useTheme } from 'next-themes';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { cn } from '@/lib/utils';

const THEME_OPTIONS = [
  {
    value: 'light' as const,
    label: 'Light',
    description: 'Bright and clean.',
  },
  {
    value: 'dark' as const,
    label: 'Dark',
    description: 'Bold and focused.',
  },
  {
    value: 'system' as const,
    label: 'System',
    description: 'Match device settings.',
  },
];

type ThemeValue = 'light' | 'dark' | 'system';

function ThemePreview({ themeValue }: { themeValue: ThemeValue }) {
  if (themeValue === 'system') {
    return (
      <div className='flex w-full h-full'>
        <div className='relative flex-1 bg-surface-1'>
          <div className='absolute left-0 top-0 w-3.5 h-full bg-surface-2 rounded-r' />
          <div className='absolute left-5 top-2 right-2 bottom-2 space-y-1'>
            <div className='h-2 bg-surface-3 rounded w-1/3' />
            <div className='h-1.5 bg-surface-3 rounded w-1/2 opacity-60' />
            <div className='h-1.5 bg-surface-3 rounded w-2/3 opacity-40' />
          </div>
        </div>
        <div className='dark relative flex-1 bg-surface-1'>
          <div className='absolute left-0 top-0 w-3.5 h-full bg-surface-2 rounded-r' />
          <div className='absolute left-5 top-2 right-2 bottom-2 space-y-1'>
            <div className='h-2 bg-surface-3 rounded w-1/3' />
            <div className='h-1.5 bg-surface-3 rounded w-1/2 opacity-60' />
            <div className='h-1.5 bg-surface-3 rounded w-2/3 opacity-40' />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'relative w-full h-full bg-surface-1',
        themeValue === 'dark' && 'dark'
      )}
    >
      <div className='absolute left-0 top-0 w-6 h-full bg-surface-2 rounded-r' />
      <div className='absolute left-8 top-2 right-2 bottom-2 space-y-1'>
        <div className='h-2 bg-surface-3 rounded w-1/3' />
        <div className='h-1.5 bg-surface-3 rounded w-1/2 opacity-60' />
        <div className='h-1.5 bg-surface-3 rounded w-2/3 opacity-40' />
      </div>
    </div>
  );
}

function CheckMark() {
  return (
    <div className='absolute top-2 right-2 w-5 h-5 bg-accent-token rounded-full flex items-center justify-center animate-in zoom-in-95 fade-in duration-200'>
      <svg
        className='w-3 h-3 text-accent-foreground'
        fill='none'
        stroke='currentColor'
        viewBox='0 0 24 24'
      >
        <path
          strokeLinecap='round'
          strokeLinejoin='round'
          strokeWidth={3}
          d='M5 13l4 4L19 7'
        />
      </svg>
    </div>
  );
}

export function AppearanceSettingsSection() {
  const { theme, setTheme } = useTheme();

  const handleThemeChange = async (newTheme: ThemeValue) => {
    setTheme(newTheme);

    try {
      const response = await fetch('/api/dashboard/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: { theme: { preference: newTheme } },
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
    <div>
      <DashboardCard variant='settings' className='space-y-4'>
        <h3 className='text-lg font-medium text-primary mb-6'>
          Interface Theme
        </h3>

        <div className='grid grid-cols-3 gap-4'>
          {THEME_OPTIONS.map(option => (
            <button
              key={option.value}
              onClick={() => void handleThemeChange(option.value)}
              className={cn(
                'group relative flex flex-col p-4 rounded-xl border-2 transition-all duration-300 ease-in-out',
                'hover:translate-y-[-2px] hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive focus-visible:ring-offset-1 focus-visible:ring-offset-bg-base',
                theme === option.value
                  ? 'border-accent/70 bg-surface-2'
                  : 'border-subtle hover:border-accent/50'
              )}
            >
              <div className='relative w-full h-20 rounded-lg overflow-hidden mb-3'>
                <ThemePreview themeValue={option.value} />
              </div>

              <div className='text-left'>
                <h4 className='font-medium text-primary text-sm mb-1'>
                  {option.label}
                </h4>
                <p className='text-xs text-secondary mt-1'>
                  {option.description}
                </p>
              </div>

              {theme === option.value && <CheckMark />}
            </button>
          ))}
        </div>

        <p className='text-xs text-secondary mt-4'>
          Choose how the interface appears. System automatically matches your
          device settings.
        </p>
      </DashboardCard>
    </div>
  );
}
