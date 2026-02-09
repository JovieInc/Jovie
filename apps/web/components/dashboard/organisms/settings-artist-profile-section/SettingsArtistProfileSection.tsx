'use client';

import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { SettingsProfileSection } from '@/components/dashboard/organisms/settings-profile-section';
import { SocialsForm } from '@/components/dashboard/organisms/socials-form/SocialsForm';
import { ConnectedDspList } from './ConnectedDspList';
import type { SettingsArtistProfileSectionProps } from './types';

export function SettingsArtistProfileSection({
  artist,
  onArtistUpdate,
  onRefresh,
}: SettingsArtistProfileSectionProps) {
  return (
    <div className='space-y-8'>
      {/* Profile subsection — username, display name, photo */}
      <div>
        <h3 className='text-[13px] font-medium text-primary-token mb-3'>
          Profile
        </h3>
        <SettingsProfileSection
          artist={artist}
          onArtistUpdate={onArtistUpdate}
          onRefresh={onRefresh}
        />
      </div>

      {/* Connected DSPs subsection */}
      <div>
        <h3 className='text-[13px] font-medium text-primary-token mb-3'>
          Connected Platforms
        </h3>
        <ConnectedDspList profileId={artist.id} spotifyId={artist.spotify_id} />
      </div>

      {/* Social links subsection */}
      <div>
        <h3 className='text-[13px] font-medium text-primary-token mb-3'>
          Social Links
        </h3>
        <DashboardCard variant='settings'>
          <SocialsForm artist={artist} />
        </DashboardCard>
      </div>
    </div>
  );
}
