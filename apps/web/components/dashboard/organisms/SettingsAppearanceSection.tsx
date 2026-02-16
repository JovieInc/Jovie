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

/* Hardcoded preview colors from design-system.css — these don't use CSS variables
   so the previews render correctly regardless of the current active theme. */
const PREVIEW_COLORS = {
  light: {
    surface1: '#ffffff',
    surface2: '#ffffff',
    surface3: '#f0f0f0',
  },
  dark: {
    surface1: 'oklch(11% 0.015 272)',
    surface2: 'oklch(14.5% 0.018 272)',
    surface3: 'oklch(18% 0.02 272)',
  },
} as const;

function ThemePreview({
  colors,
  compact = false,
  className,
}: {
  colors: { surface1: string; surface2: string; surface3: string };
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn('relative w-full h-full', className)}
      style={{ backgroundColor: colors.surface1 }}
    >
      <div
        className={cn(
          'absolute left-0 top-0 h-full rounded-r',
          compact ? 'w-3.5' : 'w-6'
        )}
        style={{ backgroundColor: colors.surface2 }}
      />
      <div
        className={cn(
          'absolute top-2 right-2 bottom-2 space-y-1',
          compact ? 'left-5' : 'left-8'
        )}
      >
        <div
          className='h-2 rounded w-1/3'
          style={{ backgroundColor: colors.surface3 }}
        />
        <div
          className='h-1.5 rounded w-1/2 opacity-60'
          style={{ backgroundColor: colors.surface3 }}
        />
        <div
          className='h-1.5 rounded w-2/3 opacity-40'
          style={{ backgroundColor: colors.surface3 }}
        />
      </div>
    </div>
  );
}

export function SettingsAppearanceSection() {
  const { theme, setTheme } = useTheme();
  const { updateTheme, isPending } = useThemeMutation();

  const handleThemeChange = (newTheme: 'light' | 'dark' | 'system') => {
    setTheme(newTheme);
    updateTheme(newTheme);
  };

  return (
    <DashboardCard variant='settings' padding='none'>
      <div className='px-5 py-4 space-y-3 sm:space-y-4'>
        <div className='grid grid-cols-3 gap-2 sm:gap-4'>
          {THEME_OPTIONS.map(option => (
            <button
              type='button'
              key={option.value}
              onClick={() => handleThemeChange(option.value)}
              disabled={isPending}
              className={cn(
                'group relative flex flex-col p-2 sm:p-4 rounded-lg sm:rounded-xl border-2 transition-all duration-300 ease-in-out',
                'hover:translate-y-[-2px] hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive focus-visible:ring-offset-1 focus-visible:ring-offset-bg-base',
                'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none',
                theme === option.value
                  ? 'border-accent/70 bg-surface-2'
                  : 'border-subtle hover:border-accent/50'
              )}
            >
              {/* Miniature Dashboard Preview */}
              <div className='relative w-full h-14 sm:h-20 rounded-md sm:rounded-lg overflow-hidden mb-1.5 sm:mb-3'>
                {option.value === 'system' ? (
                  <div className='flex w-full h-full'>
                    <ThemePreview
                      colors={PREVIEW_COLORS.light}
                      compact
                      className='flex-1'
                    />
                    <ThemePreview
                      colors={PREVIEW_COLORS.dark}
                      compact
                      className='flex-1'
                    />
                  </div>
                ) : (
                  <ThemePreview
                    colors={PREVIEW_COLORS[option.value as 'light' | 'dark']}
                  />
                )}
              </div>

              <div className='text-left'>
                <h4 className='font-medium text-primary-token text-xs sm:text-sm mb-0.5 sm:mb-1'>
                  {option.label}
                </h4>
                <p className='text-[10px] sm:text-xs text-secondary-token mt-0.5 sm:mt-1 hidden sm:block'>
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

        <p className='text-xs text-secondary-token'>
          {isPending
            ? 'Saving\u2026'
            : 'System automatically matches your device settings.'}
        </p>
      </div>
    </DashboardCard>
  );
}
