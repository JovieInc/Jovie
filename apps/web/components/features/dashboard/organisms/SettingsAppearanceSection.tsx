'use client';

import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@jovie/ui';
import { Check, Laptop, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { SettingsPanel } from '@/components/molecules/settings/SettingsPanel';
import { SettingsToggleRow } from '@/components/molecules/settings/SettingsToggleRow';
import { useHighContrast } from '@/lib/hooks/useHighContrast';
import { useHighContrastMutation, useThemeMutation } from '@/lib/queries';
import { cn } from '@/lib/utils';

type ThemeValue = 'light' | 'dark' | 'system';

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
    const validTheme = newTheme as ThemeValue;
    setTheme(validTheme);
    updateTheme(validTheme, isHighContrast);
  };

  const handleHighContrastChange = (enabled: boolean) => {
    setHighContrast(enabled);
    const currentTheme = (theme ?? 'system') as ThemeValue;
    saveHighContrast(enabled, currentTheme);
  };

  const selectedTheme = (theme ?? 'system') as ThemeValue;
  let resolvedThemeLabel = '';
  if (resolvedTheme === 'light') resolvedThemeLabel = 'Light';
  else if (resolvedTheme === 'dark') resolvedThemeLabel = 'Dark';

  return (
    <SettingsPanel
      title='Appearance'
      description='Theme and contrast preferences for your workspace.'
    >
      <div className='space-y-4 px-4 py-4 sm:px-5'>
        <div className='grid gap-1.5 sm:grid-cols-3'>
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
                  'h-auto justify-start rounded-[10px] border px-3 py-2.5 text-left',
                  'focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-0',
                  isSelected
                    ? 'border-accent/45 bg-accent/6 text-primary-token'
                    : 'border-subtle bg-surface-0 text-secondary-token hover:bg-surface-1'
                )}
                aria-pressed={isSelected}
                data-testid={`theme-option-${option.value}`}
              >
                <span className='flex w-full items-start gap-2'>
                  <span className='mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center'>
                    <Icon className='h-4 w-4' aria-hidden='true' />
                  </span>
                  <span className='min-w-0 flex-1'>
                    <span className='flex items-center gap-1 text-app font-[510] text-primary-token'>
                      {option.label}
                      {option.value === 'system' && resolvedThemeLabel ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className='inline-flex cursor-help rounded text-2xs text-tertiary-token underline decoration-dotted underline-offset-2'>
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
                    <span className='mt-0.5 block text-2xs leading-normal text-tertiary-token'>
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

        <div className='border-t border-subtle pt-4'>
          <SettingsToggleRow
            title='High contrast'
            description='Increase contrast for text, borders, and surfaces.'
            checked={isHighContrast}
            onCheckedChange={handleHighContrastChange}
            disabled={isContrastPending}
            ariaLabel='Toggle high contrast mode'
          />
        </div>
      </div>
    </SettingsPanel>
  );
}
