'use client';

import { DataPrivacySection } from '@/features/dashboard/organisms/DataPrivacySection';
import { SettingsSection } from '@/features/dashboard/organisms/SettingsSection';
import { useSettingsContext } from '@/features/dashboard/organisms/useSettingsContext';

export default function SettingsDataPrivacyPage() {
  const { artist, setArtist } = useSettingsContext();
  return (
    <SettingsSection id='data-privacy' title='Data & privacy'>
      <DataPrivacySection artist={artist} onArtistUpdate={setArtist} />
    </SettingsSection>
  );
}
