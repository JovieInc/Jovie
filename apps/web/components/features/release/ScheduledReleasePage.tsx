'use client';

/**
 * ScheduledReleasePage Component
 *
 * "Coming Soon" page for unreleased content from free-plan creators.
 * Includes countdown timer, email notification signup (same OTP flow
 * as artist profiles), and share button. Spotify/Apple pre-save stays
 * flagged off — this is the email capture MVP.
 */

import { Share2 } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { ProfileInlineNotificationsCTA } from '@/features/profile/artist-notifications-cta';
import type { Artist } from '@/types/db';
import { ReleaseCountdown } from './ReleaseCountdown';
import { ReleaseNotificationsProvider } from './ReleaseNotificationsProvider';
import {
  SmartLinkArtworkCard,
  SmartLinkPageFrame,
} from './SmartLinkPagePrimitives';
import { useSmartLinkShare } from './SmartLinkShell';

interface ScheduledReleasePageProps {
  readonly release: {
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
  const handleShare = useSmartLinkShare(release.title, artist.name);

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
        <button
          type='button'
          onClick={() => handleShare()}
          className='text-muted-foreground hover:text-foreground mt-4 inline-flex items-center gap-1.5 text-xs transition-colors'
        >
          <Share2 className='h-4 w-4' />
          Share
        </button>
      </SmartLinkPageFrame>
    </ReleaseNotificationsProvider>
  );
}
