'use client';

import { SettingsProfileSection } from '@/components/dashboard/organisms/settings-profile-section';
import type { SettingsArtistProfileSectionProps } from './types';

export function SettingsArtistProfileSection({
  artist,
  onArtistUpdate,
  onRefresh,
}: SettingsArtistProfileSectionProps) {
  return (
    <SettingsProfileSection
      artist={artist}
      onArtistUpdate={onArtistUpdate}
      onRefresh={onRefresh}
    />
  );
}
