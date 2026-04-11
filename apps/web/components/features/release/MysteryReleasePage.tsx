'use client';

/**
 * MysteryReleasePage Component
 *
 * Displayed when a release's reveal date is still in the future.
 * Shows artist identity and a countdown to the reveal date,
 * but hides all release details (title, artwork, credits).
 */

import Link from 'next/link';
import { ProfileInlineNotificationsCTA } from '@/features/profile/artist-notifications-cta';
import {
  SmartLinkArtworkCard,
  SmartLinkPageFrame,
} from '@/features/release/SmartLinkPagePrimitives';
import type { Artist } from '@/types/db';
import { ReleaseCountdown } from './ReleaseCountdown';
import { ReleaseNotificationsProvider } from './ReleaseNotificationsProvider';

interface MysteryReleasePageProps {
  readonly revealDate: Date;
  readonly artist: {
    readonly id: string;
    readonly name: string;
    readonly handle: string;
    readonly avatarUrl: string | null;
  };
  /** When true, shows a minimal version without countdown or CTA (free plan) */
  readonly minimal?: boolean;
}

function mapToArtistType(artist: MysteryReleasePageProps['artist']): Artist {
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

export function MysteryReleasePage({
  revealDate,
  artist,
  minimal = false,
}: MysteryReleasePageProps) {
  const artistData = mapToArtistType(artist);

  return (
    <ReleaseNotificationsProvider artist={artistData}>
      <SmartLinkPageFrame centered glowClassName='size-[30rem]'>
        <SmartLinkArtworkCard
          title='Upcoming release'
          artworkUrl={null}
          className='shadow-black/40'
        />

        {/* Artist name */}
        <div className='mt-4 text-center'>
          <Link
            href={`/${artist.handle}`}
            className='text-lg font-semibold leading-snug tracking-tight text-foreground hover:text-foreground/80 transition-colors'
          >
            {artist.name}
          </Link>
        </div>

        {/* Countdown + CTA */}
        {!minimal && (
          <div className='mt-5 space-y-4'>
            <ReleaseCountdown releaseDate={revealDate} label='Reveals in' />

            <ProfileInlineNotificationsCTA artist={artistData} />
          </div>
        )}

        {minimal && (
          <div className='mt-5 rounded-2xl bg-surface-1/50 p-4 text-center ring-1 ring-inset ring-white/[0.08]'>
            <p className='text-muted-foreground text-sm font-medium'>
              Something new coming soon
            </p>
          </div>
        )}
      </SmartLinkPageFrame>
    </ReleaseNotificationsProvider>
  );
}
