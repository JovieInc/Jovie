'use client';

import { SettingsAnalyticsSection } from '@/features/dashboard/organisms/SettingsAnalyticsSection';
import { SettingsSection } from '@/features/dashboard/organisms/SettingsSection';
import { useSettingsContext } from '@/features/dashboard/organisms/useSettingsContext';
import { PageErrorState } from '@/features/feedback/PageErrorState';

export default function SettingsAnalyticsPage() {
  const { artist, setArtist, isPro } = useSettingsContext();

  if (!artist) {
    return (
      <PageErrorState message='Unable to load your profile settings. Please refresh the page.' />
    );
  }

  return (
    <SettingsSection
      id='analytics'
      title='Analytics'
      description='Control how your visits appear in analytics.'
    >
      <SettingsAnalyticsSection
        artist={artist}
        onArtistUpdate={setArtist}
        isPro={isPro}
      />
    </SettingsSection>
  );
}
