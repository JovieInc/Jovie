'use client';

import { StaticArtistPage } from '@/features/profile/StaticArtistPage';
import {
  MOCK_ARTIST,
  MOCK_CONTACTS,
  MOCK_SOCIAL_LINKS,
} from '../mock-data/artist-profile-data';

export function SceneArtistProfile() {
  return (
    <StaticArtistPage
      mode='profile'
      artist={MOCK_ARTIST}
      socialLinks={MOCK_SOCIAL_LINKS}
      contacts={MOCK_CONTACTS}
      subtitle='Artist'
      showTipButton={false}
      showBackButton={false}
      showFooter={false}
      genres={['Electronic', 'Dance']}
    />
  );
}
