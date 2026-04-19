'use client';

/**
 * ScheduledReleasePage Component
 *
 * "Coming Soon" page for unreleased content from free-plan creators.
 * Includes countdown timer, email notification signup (same OTP flow
 * as artist profiles), and share button. Spotify/Apple pre-save stays
 * flagged off — this is the email capture MVP.
 */

import Link from 'next/link';
import { useMemo } from 'react';
import { ProfileInlineNotificationsCTA } from '@/features/profile/artist-notifications-cta';
import { PublicShareMenu } from '@/features/share/PublicShareMenu';
import { buildReleaseShareContext } from '@/lib/share/context';
import type { Artist } from '@/types/db';
import { ReleaseCountdown } from './ReleaseCountdown';
import { ReleaseNotificationsProvider } from './ReleaseNotificationsProvider';
import {
  SmartLinkArtworkCard,
  SmartLinkPageFrame,
} from './SmartLinkPagePrimitives';

interface ScheduledReleasePageProps {
  readonly release: {
    readonly slug: string;
    readonly title: string;
    readonly artworkUrl: string | null;
    readonly releaseDate: string;
  };
  readonly artist: {
    readonly id: string;
    readonly name: string;
    readonly handle: string;
    readonly avatarUrl: string | null;
  };
}

function mapToArtistType(artist: ScheduledReleasePageProps['artist']): Artist {
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

export function ScheduledReleasePage({
  release,
  artist,
}: ScheduledReleasePageProps) {
  const artistData = useMemo(() => mapToArtistType(artist), [artist]);
  const releaseDate = useMemo(
    () => new Date(release.releaseDate),
    [release.releaseDate]
  );
  const shareContext = useMemo(
    () =>
      buildReleaseShareContext({
        username: artist.handle,
        slug: release.slug,
        title: release.title,
        artistName: artist.name,
        artworkUrl: release.artworkUrl,
        pathname: `/${artist.handle}/${release.slug}`,
      }),
    [
      artist.handle,
      artist.name,
      release.artworkUrl,
      release.slug,
      release.title,
    ]
  );

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

        {/* Countdown */}
        <div className='mt-5 flex w-full items-center justify-center rounded-[14px] border border-white/[0.08] bg-white/[0.05] px-4 py-3 backdrop-blur-2xl empty:hidden'>
          <ReleaseCountdown releaseDate={releaseDate} compact />
        </div>

        {/* Notification signup — same email→OTP flow as profiles */}
        <div className='mt-3 w-full'>
          <ProfileInlineNotificationsCTA artist={artistData} />
        </div>

        {/* Share */}
        <div className='mt-4'>
          <PublicShareMenu
            context={shareContext}
            title='Share'
            align='center'
            trigger={
              <button
                type='button'
                className='text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs transition-colors'
              >
                Share
              </button>
            }
          />
        </div>
      </SmartLinkPageFrame>
    </ReleaseNotificationsProvider>
  );
}
