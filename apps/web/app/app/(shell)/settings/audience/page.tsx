'use client';

import { SettingsAdPixelsSection } from '@/features/dashboard/organisms/SettingsAdPixelsSection';
import { SettingsAudienceSection } from '@/features/dashboard/organisms/SettingsAudienceSection';
import { SettingsSection } from '@/features/dashboard/organisms/SettingsSection';
import { useSettingsContext } from '@/features/dashboard/organisms/useSettingsContext';

export default function SettingsAudiencePage() {
  const { isPro } = useSettingsContext();

  return (
    <SettingsSection
      id='audience-tracking'
      title='Audience & Tracking'
      description='Fan verification, opt-ins, and tracking.'
    >
      <div className='space-y-4'>
        <SettingsAudienceSection />
        <SettingsAdPixelsSection isPro={isPro} />
      </div>
    </SettingsSection>
  );
}
