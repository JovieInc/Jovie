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
import { useThemeMutation } from '@/lib/queries';

const THEME_OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
] as const;

export function SettingsAppearanceSection() {
  const { theme, setTheme } = useTheme();
  const { updateTheme, isPending } = useThemeMutation();

  const handleThemeChange = (newTheme: string) => {
    const validTheme = newTheme as 'light' | 'dark' | 'system';
    setTheme(validTheme);
    updateTheme(validTheme);
  };

  const currentLabel =
    THEME_OPTIONS.find(o => o.value === theme)?.label ?? 'System';

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
          <Select
            value={theme ?? 'system'}
            onValueChange={handleThemeChange}
            disabled={isPending}
          >
            <SelectTrigger className='w-[120px] h-8 text-[13px]'>
              <SelectValue>{currentLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {THEME_OPTIONS.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </DashboardCard>
  );
}
