'use client';

import { AccountSettingsSection } from '@/features/dashboard/organisms/account-settings';
import { SettingsSection } from '@/features/dashboard/organisms/SettingsSection';
import { useSettingsContext } from '@/features/dashboard/organisms/useSettingsContext';

export default function SettingsAccountPage() {
  const { isGrowth } = useSettingsContext();

  return (
    <SettingsSection
      id='account'
      title='Account'
      description='Security, theme, and notifications.'
    >
      <AccountSettingsSection isGrowth={isGrowth} />
    </SettingsSection>
  );
}
