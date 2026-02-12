'use client';

import { SettingsProfileSection } from '@/components/dashboard/organisms/settings-profile-section';
import { SettingsContactsCard } from './SettingsContactsCard';
import { SettingsTourDatesCard } from './SettingsTourDatesCard';
import type { SettingsArtistProfileSectionProps } from './types';

export function SettingsArtistProfileSection({
  artist,
  initialContacts,
  initialTourConnectionStatus,
  onArtistUpdate,
  onRefresh,
}: SettingsArtistProfileSectionProps) {
  return (
    <div className='space-y-4 sm:space-y-6'>
      <SettingsProfileSection
        artist={artist}
        onArtistUpdate={onArtistUpdate}
        onRefresh={onRefresh}
      />
      <SettingsContactsCard
        profileId={artist.id}
        artistName={artist.name}
        artistHandle={artist.handle}
        initialContacts={initialContacts}
      />
      <SettingsTourDatesCard
        profileId={artist.id}
        initialConnectionStatus={initialTourConnectionStatus}
      />
    </div>
  );
}
