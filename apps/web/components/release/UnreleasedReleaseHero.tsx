'use client';

/**
 * UnreleasedReleaseHero Component
 *
 * Displays a hero section for unreleased content with countdown timer
 * and a "Notify Me" subscription CTA. Used when releaseDate > now.
 */

import { Bell } from 'lucide-react';
import { ArtistNotificationsCTA } from '@/components/profile/artist-notifications-cta';
import type { Artist } from '@/types/db';
import { ReleaseCountdown } from './ReleaseCountdown';
import { ReleaseNotificationsProvider } from './ReleaseNotificationsProvider';
import { SmartLinkArtwork } from './SmartLinkArtwork';
import { SmartLinkShell } from './SmartLinkShell';

interface UnreleasedReleaseHeroProps {
  readonly release: {
    readonly title: string;
    readonly artworkUrl: string | null;
    readonly releaseDate: Date;
  };
  readonly artist: {
    readonly id: string;
    readonly name: string;
    readonly handle: string;
    readonly avatarUrl: string | null;
  };
}

/**
 * Map artist props to full Artist type required by ArtistNotificationsCTA.
 * Uses sensible defaults for fields not relevant to notifications.
 */
function mapToArtistType(artist: UnreleasedReleaseHeroProps['artist']): Artist {
  return {
    id: artist.id,
    owner_user_id: '',
    handle: artist.handle,
    spotify_id: '',
    name: artist.name,
    image_url: artist.avatarUrl ?? undefined,
    published: true,
    is_verified: false,
    is_featured: false,
    marketing_opt_out: false,
    created_at: new Date().toISOString(),
  };
}

export function UnreleasedReleaseHero({
  release,
  artist,
}: UnreleasedReleaseHeroProps) {
  const artistData = mapToArtistType(artist);

  return (
    <ReleaseNotificationsProvider artist={artistData}>
      <SmartLinkShell>
        {/* Release Artwork */}
        <SmartLinkArtwork
          src={release.artworkUrl}
          alt={`${release.title} artwork`}
        />

        {/* Release Info */}
        <div className='text-center'>
          <h1 className='text-xl font-semibold tracking-tight sm:text-2xl'>
            {release.title}
          </h1>
          <p className='mt-1.5 text-base text-white/60'>{artist.name}</p>
        </div>

        {/* Countdown Timer */}
        <div className='rounded-2xl bg-white/5 p-5 ring-1 ring-inset ring-white/10'>
          <ReleaseCountdown releaseDate={release.releaseDate} />
        </div>

        {/* Notify Me CTA */}
        <div className='space-y-3'>
          <div className='flex items-center justify-center gap-2 text-sm text-white/60'>
            <Bell className='h-4 w-4' aria-hidden='true' />
            <span>Get notified when it drops</span>
          </div>
          <ArtistNotificationsCTA
            artist={artistData}
            variant='button'
            autoOpen
          />
        </div>
      </SmartLinkShell>
    </ReleaseNotificationsProvider>
  );
}
