'use client';

import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@jovie/ui';
import { Check, Laptop, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { SettingsToggleRow } from '@/components/dashboard/molecules/SettingsToggleRow';
import { useHighContrast } from '@/lib/hooks/useHighContrast';
import { useHighContrastMutation, useThemeMutation } from '@/lib/queries';
import { cn } from '@/lib/utils';

const THEME_OPTIONS = [
  {
    value: 'light',
    label: 'Light',
    description: 'Bright surfaces for daytime editing.',
    icon: Sun,
  },
  {
    value: 'dark',
    label: 'Dark',
    description: 'Dimmed surfaces for low-light focus.',
    icon: Moon,
  },
  {
    value: 'system',
    label: 'System',
    description: 'Automatically follows your device preference.',
    icon: Laptop,
  },
] as const;

export function SettingsAppearanceSection() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { updateTheme, isPending: isThemePending } = useThemeMutation();
  const { isHighContrast, setHighContrast } = useHighContrast();
  const { setHighContrast: saveHighContrast, isPending: isContrastPending } =
    useHighContrastMutation();

  const handleThemeChange = (newTheme: string) => {
    const validTheme = newTheme as 'light' | 'dark' | 'system';
    setTheme(validTheme);
    updateTheme(validTheme, isHighContrast);
  };

  const handleHighContrastChange = (enabled: boolean) => {
    setHighContrast(enabled);
    const currentTheme = (theme ?? 'system') as 'light' | 'dark' | 'system';
    saveHighContrast(enabled, currentTheme);
  };

  const selectedTheme = (theme ?? 'system') as 'light' | 'dark' | 'system';
  const resolvedThemeLabel =
    resolvedTheme === 'light'
      ? 'Light'
      : resolvedTheme === 'dark'
        ? 'Dark'
        : '';

  return (
    <DashboardCard
      variant='settings'
      padding='none'
      className='divide-y divide-subtle'
    >
      <div className='px-4 py-3'>
        <div className='min-w-0'>
          <h3 className='text-[13px] font-[510] text-primary-token'>
            Interface theme
          </h3>
          <p className='mt-0.5 text-[13px] leading-normal text-tertiary-token'>
            Pick the appearance style that feels most comfortable.
          </p>
        </div>
        <div className='mt-3 grid gap-2 sm:grid-cols-3'>
          {THEME_OPTIONS.map(option => {
            const isSelected = selectedTheme === option.value;
            const Icon = option.icon;

            return (
              <Button
                key={option.value}
                type='button'
                variant='ghost'
                onClick={() => handleThemeChange(option.value)}
                disabled={isThemePending}
                className={cn(
                  'h-auto justify-start rounded-lg border px-3 py-2 text-left',
                  'focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-0',
                  isSelected
                    ? 'border-accent/60 bg-accent/8 text-primary-token'
                    : 'border-subtle bg-transparent text-secondary-token hover:bg-surface-2'
                )}
                aria-pressed={isSelected}
                data-testid={`theme-option-${option.value}`}
              >
                <span className='flex w-full items-start gap-2'>
                  <span className='mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center'>
                    <Icon className='h-4 w-4' aria-hidden='true' />
                  </span>
                  <span className='min-w-0 flex-1'>
                    <span className='flex items-center gap-1 text-[13px] font-[510] text-primary-token'>
                      {option.label}
                      {option.value === 'system' && resolvedThemeLabel ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className='inline-flex cursor-help rounded text-[11px] text-tertiary-token underline decoration-dotted underline-offset-2'>
                              {resolvedThemeLabel}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side='top'>
                            Your device currently resolves System to{' '}
                            {resolvedThemeLabel}.
                          </TooltipContent>
                        </Tooltip>
                      ) : null}
                    </span>
                    <span className='mt-0.5 block text-[12px] leading-normal text-tertiary-token'>
                      {option.description}
                    </span>
                  </span>
                  <span className='mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center'>
                    {isSelected ? (
                      <Check className='h-4 w-4 text-accent' />
                    ) : null}
                  </span>
                </span>
              </Button>
            );
          })}
        </div>
      </div>

      <div className='px-4 py-3'>
        <SettingsToggleRow
          title='High contrast'
          description='Increase contrast for text, borders, and surfaces'
          checked={isHighContrast}
          onCheckedChange={handleHighContrastChange}
          disabled={isContrastPending}
          ariaLabel='Toggle high contrast mode'
        />
      </div>
    </DashboardCard>
  );
}
