'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@jovie/ui';
import { useTheme } from 'next-themes';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { SettingsToggleRow } from '@/components/dashboard/molecules/SettingsToggleRow';
import { useHighContrast } from '@/lib/hooks/useHighContrast';
import { useHighContrastMutation, useThemeMutation } from '@/lib/queries';

const THEME_OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
] as const;

export function SettingsAppearanceSection() {
  const { theme, setTheme } = useTheme();
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

  const currentLabel =
    THEME_OPTIONS.find(o => o.value === theme)?.label ?? 'System';

  return (
    <DashboardCard
      variant='settings'
      padding='none'
      className='divide-y divide-subtle'
    >
      <div className='px-4 py-3 flex items-center justify-between'>
        <div className='flex-1 min-w-0'>
          <h3 className='text-sm font-medium text-primary-token'>
            Interface theme
          </h3>
          <p className='mt-0.5 text-[13px] leading-normal text-tertiary-token'>
            Select or customize your interface color scheme
          </p>
        </div>
        <div className='shrink-0'>
          <Select
            value={theme ?? 'system'}
            onValueChange={handleThemeChange}
            disabled={isThemePending}
          >
            <SelectTrigger className='w-[120px] h-8 text-[13px]'>
              <SelectValue>{currentLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent position='item-aligned'>
              {THEME_OPTIONS.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
