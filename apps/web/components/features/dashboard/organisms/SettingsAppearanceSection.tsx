'use client';

import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@jovie/ui';
import { Check, Laptop, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useSyncExternalStore } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
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

function subscribeToNothing(): () => void {
  return () => {};
}

function getHydratedSnapshot(): boolean {
  return true;
}

function getServerSnapshot(): boolean {
  return false;
}

export function SettingsAppearanceSection() {
  const { selectedProfile } = useDashboardData();
  const selectedProfileId = selectedProfile?.id;
  const { theme, setTheme, forcedTheme, systemTheme } = useTheme();
  const { updateTheme, isPending: isThemePending } =
    useThemeMutation(selectedProfileId);
  const { isHighContrast, setHighContrast } = useHighContrast();
  const { setHighContrast: saveHighContrast, isPending: isContrastPending } =
    useHighContrastMutation(selectedProfileId);

  // When the theme policy forces a theme (CoreProviders passes forcedTheme
  // while theme switching is off), the UI is pinned to that theme regardless
  // of the stored preference. Reflect the enforced theme and refuse writes so
  // the stored preference survives policy re-enable.
  const forcedValue =
    forcedTheme === 'light' || forcedTheme === 'dark'
      ? (forcedTheme as ThemeValue)
      : null;
  const isThemeForced = forcedValue !== null;

  const handleThemeChange = (newTheme: string) => {
    if (!selectedProfileId || isThemeForced) return;

    const validTheme = newTheme as ThemeValue;
    setTheme(validTheme);
    updateTheme(validTheme, isHighContrast);
  };

  const handleHighContrastChange = (enabled: boolean) => {
    if (!selectedProfileId) return;

    setHighContrast(enabled);
    const currentTheme = (theme ?? 'system') as ThemeValue;
    saveHighContrast(enabled, currentTheme);
  };

  // next-themes only knows the stored theme on the client. Rendering the
  // selection during SSR/hydration made aria-pressed and the check icon
  // disagree with the server HTML (React hydration error on /app/settings/
  // account). Mark a theme selected only after hydration.
  const hasHydrated = useSyncExternalStore(
    subscribeToNothing,
    getHydratedSnapshot,
    getServerSnapshot
  );
  const selectedTheme = isThemeForced
    ? forcedValue
    : hasHydrated
      ? ((theme ?? 'system') as ThemeValue)
      : null;
  // systemTheme is the device-level resolution (independent of the stored
  // preference), so the System option reports what the device would pick.
  // systemTheme is client-derived — gate it on hydration like the stored
  // preference so the server HTML and the first client render agree.
  let systemThemeLabel = '';
  if (hasHydrated && systemTheme === 'light') systemThemeLabel = 'Light';
  else if (hasHydrated && systemTheme === 'dark') systemThemeLabel = 'Dark';

  return (
    <SettingsPanel
      title='Appearance'
      description='Theme and contrast preferences for your workspace.'
      bodyClassName='space-y-4 px-4 py-4 sm:px-5'
    >
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
              disabled={
                isThemePending ||
                !selectedProfileId ||
                (isThemeForced && option.value !== forcedValue)
              }
              className={cn(
                'h-auto justify-start rounded-lg border px-3 py-2.5 text-left',
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
                  <span className='flex items-center gap-1 text-app font-caption text-primary-token'>
                    {option.label}
                    {option.value === 'system' && systemThemeLabel ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className='inline-flex cursor-help rounded text-2xs text-tertiary-token underline decoration-dotted underline-offset-2'>
                            {systemThemeLabel}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side='top'>
                          {/* ui-casing-allow: System is a theme option label */}
                          Your device currently resolves System to{' '}
                          {systemThemeLabel}.
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
          title='High Contrast'
          description='Increase contrast for text, borders, and surfaces.'
          checked={isHighContrast}
          onCheckedChange={handleHighContrastChange}
          disabled={isContrastPending || !selectedProfileId}
          ariaLabel='Toggle high contrast mode'
        />
      </div>
    </SettingsPanel>
  );
}
