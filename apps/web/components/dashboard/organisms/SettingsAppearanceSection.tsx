'use client';

import { useTheme } from 'next-themes';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { useThemeMutation } from '@/lib/queries';
import { cn } from '@/lib/utils';

const THEME_OPTIONS = [
  { value: 'light', label: 'Light', description: 'Bright and clean.' },
  { value: 'dark', label: 'Dark', description: 'Bold and focused.' },
  { value: 'system', label: 'System', description: 'Match device settings.' },
] as const;

export function SettingsAppearanceSection() {
  const { theme, setTheme } = useTheme();
  const { updateTheme, isPending } = useThemeMutation();

  const handleThemeChange = (newTheme: 'light' | 'dark' | 'system') => {
    setTheme(newTheme);
    updateTheme(newTheme);
  };

  return (
    <div>
      <DashboardCard variant='settings' className='space-y-4'>
        <h3 className='text-[14px] font-medium text-primary-token mb-4'>
          Interface Theme
        </h3>

        <div className='grid grid-cols-3 gap-4'>
          {THEME_OPTIONS.map(option => (
            <button
              type='button'
              key={option.value}
              onClick={() =>
                handleThemeChange(option.value as 'light' | 'dark' | 'system')
              }
              disabled={isPending}
              className={cn(
                'group relative flex flex-col p-4 rounded-xl border-2 transition-all duration-300 ease-in-out',
                'hover:translate-y-[-2px] hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive focus-visible:ring-offset-1 focus-visible:ring-offset-bg-base',
                'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none',
                theme === option.value
                  ? 'border-accent/70 bg-surface-2'
                  : 'border-subtle hover:border-accent/50'
              )}
            >
              {/* Miniature Dashboard Preview */}
              <div className='relative w-full h-20 rounded-lg overflow-hidden mb-3'>
                {option.value === 'system' ? (
                  <div className='flex w-full h-full'>
                    <div className='relative flex-1 bg-surface-1'>
                      {/* Sidebar */}
                      <div className='absolute left-0 top-0 w-3.5 h-full bg-surface-2 rounded-r' />
                      {/* Content area with some mock elements */}
                      <div className='absolute left-5 top-2 right-2 bottom-2 space-y-1'>
                        <div className='h-2 bg-surface-3 rounded w-1/3' />
                        <div className='h-1.5 bg-surface-3 rounded w-1/2 opacity-60' />
                        <div className='h-1.5 bg-surface-3 rounded w-2/3 opacity-40' />
                      </div>
                    </div>
                    <div className='dark relative flex-1 bg-surface-1'>
                      {/* Sidebar */}
                      <div className='absolute left-0 top-0 w-3.5 h-full bg-surface-2 rounded-r' />
                      {/* Content area with some mock elements */}
                      <div className='absolute left-5 top-2 right-2 bottom-2 space-y-1'>
                        <div className='h-2 bg-surface-3 rounded w-1/3' />
                        <div className='h-1.5 bg-surface-3 rounded w-1/2 opacity-60' />
                        <div className='h-1.5 bg-surface-3 rounded w-2/3 opacity-40' />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    className={cn(
                      'relative w-full h-full bg-surface-1',
                      option.value === 'dark' && 'dark'
                    )}
                  >
                    {/* Sidebar */}
                    <div className='absolute left-0 top-0 w-6 h-full bg-surface-2 rounded-r' />
                    {/* Content area with some mock elements */}
                    <div className='absolute left-8 top-2 right-2 bottom-2 space-y-1'>
                      <div className='h-2 bg-surface-3 rounded w-1/3' />
                      <div className='h-1.5 bg-surface-3 rounded w-1/2 opacity-60' />
                      <div className='h-1.5 bg-surface-3 rounded w-2/3 opacity-40' />
                    </div>
                  </div>
                )}
              </div>

              <div className='text-left'>
                <h4 className='font-medium text-primary-token text-sm mb-1'>
                  {option.label}
                </h4>
                <p className='text-xs text-secondary-token mt-1'>
                  {option.description}
                </p>
              </div>

              {theme === option.value && (
                <div className='absolute top-2 right-2 w-5 h-5 bg-accent-token rounded-full flex items-center justify-center animate-in zoom-in-95 fade-in duration-200'>
                  <svg
                    className='w-3 h-3 text-accent-foreground'
                    fill='none'
                    stroke='currentColor'
                    viewBox='0 0 24 24'
                    aria-hidden='true'
                  >
                    <path
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      strokeWidth={3}
                      d='M5 13l4 4L19 7'
                    />
                  </svg>
                </div>
              )}
            </button>
          ))}
        </div>

        <p className='text-xs text-secondary-token mt-4'>
          {isPending
            ? 'Saving…'
            : 'Choose how the interface appears. System automatically matches your device settings.'}
        </p>
      </DashboardCard>
    </div>
  );
}
