'use client';

import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { SettingsToggleRow } from '@/components/dashboard/molecules/SettingsToggleRow';
import { useHighContrast } from '@/lib/hooks/useHighContrast';
import { useHighContrastMutation } from '@/lib/queries';

export function SettingsAppearanceSection() {
  const { isHighContrast, setHighContrast } = useHighContrast();
  const { setHighContrast: saveHighContrast, isPending: isContrastPending } =
    useHighContrastMutation();

  const handleHighContrastChange = (enabled: boolean) => {
    setHighContrast(enabled);
    saveHighContrast(enabled, 'dark');
  };

  return (
    <DashboardCard
      variant='settings'
      padding='none'
      className='divide-y divide-subtle'
    >
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
