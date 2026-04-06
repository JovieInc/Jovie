'use client';

/**
 * UnreleasedReleaseHero Component
 *
 * Displays a hero section for unreleased content with a unified presave card
 * containing countdown timer, platform pre-save buttons, and notify-me CTA.
 */

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { ArtistNotificationsCTA } from '@/features/profile/artist-notifications-cta';
import {
  SmartLinkArtworkCard,
  SmartLinkPageFrame,
} from '@/features/release/SmartLinkPagePrimitives';
import type { Artist } from '@/types/db';
import { PreSaveActions } from './PreSaveActions';
import { ReleaseNotificationsProvider } from './ReleaseNotificationsProvider';

interface UnreleasedReleaseHeroProps {
  readonly release: {
    readonly id: string;
    readonly slug: string;
    readonly title: string;
    readonly artworkUrl: string | null;
    readonly releaseDate: Date;
    readonly trackId: string | null;
    readonly hasSpotify: boolean;
    readonly hasAppleMusic: boolean;
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
  const [showNotify, setShowNotify] = useState(false);

  const handleNotifyMe = useCallback(() => {
    setShowNotify(true);
  }, []);

  return (
    <ReleaseNotificationsProvider artist={artistData}>
      <SmartLinkPageFrame centered glowClassName='size-[30rem]'>
        <SmartLinkArtworkCard
          title={release.title}
          artworkUrl={release.artworkUrl}
          className='shadow-black/40'
        />

        {/* Release Info */}
        <div className='mt-4 text-center'>
          <h1 className='text-lg font-semibold leading-snug tracking-tight'>
            {release.title}
          </h1>
          <Link
            href={`/${artist.handle}`}
            className='text-muted-foreground hover:text-foreground mt-1 block text-sm transition-colors'
          >
            {artist.name}
          </Link>
        </div>

        {/* Unified presave card: countdown + actions */}
        <PreSaveActions
          releaseId={release.id}
          trackId={release.trackId}
          username={artist.handle}
          slug={release.slug}
          hasSpotify={release.hasSpotify}
          hasAppleMusic={release.hasAppleMusic}
          releaseDate={release.releaseDate}
          onNotifyMe={handleNotifyMe}
        />

        {/* Notification form — revealed when "Notify Me" is tapped */}
        {showNotify && (
          <div className='mt-3'>
            <ArtistNotificationsCTA
              artist={artistData}
              variant='button'
              autoOpen
            />
          </div>
        )}
      </SmartLinkPageFrame>
    </ReleaseNotificationsProvider>
  );
}
