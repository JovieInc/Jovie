'use client';

import { SettingsSection } from '@/features/dashboard/organisms/SettingsSection';
import { SettingsUsageStatsSection } from '@/features/dashboard/organisms/SettingsUsageStatsSection';

export default function SettingsUsagePage() {
  return (
    <SettingsSection
      id='usage'
      title='Usage Stats'
      description='Plan limits, messages used, remaining quota, and upgrade options.'
    >
      <SettingsUsageStatsSection />
    </SettingsSection>
  );
}
