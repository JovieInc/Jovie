'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@jovie/ui';
import { useTheme } from 'next-themes';
import { SettingsToggleRow } from '@/components/dashboard/molecules/SettingsToggleRow';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { useFeatureGate } from '@/lib/feature-flags/client';
import { FEATURE_FLAG_KEYS } from '@/lib/feature-flags/shared';
import { useHighContrast } from '@/lib/hooks/useHighContrast';
import { useHighContrastMutation, useThemeMutation } from '@/lib/queries';

const THEME_OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
] as const;

export function SettingsAppearanceSection() {
  const isLightModeEnabled = useFeatureGate(
    FEATURE_FLAG_KEYS.ENABLE_LIGHT_MODE,
    false
  );
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
    <ContentSurfaceCard className='overflow-hidden divide-y divide-(--linear-border-subtle)'>
      {isLightModeEnabled && (
        <ContentSectionHeader
          title='Interface theme'
          subtitle='Select or customize your interface color scheme'
          className='min-h-0 px-4 py-3'
          actionsClassName='w-auto shrink-0'
          actions={
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
          }
        />
      )}

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
    </ContentSurfaceCard>
  );
}
