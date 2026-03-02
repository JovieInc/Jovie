'use client';

/**
 * UnreleasedReleaseHero Component
 *
 * Displays a hero section for unreleased content with countdown timer
 * and a "Notify Me" subscription CTA. Used when releaseDate > now.
 */

import { Bell } from 'lucide-react';
import Link from 'next/link';
import { ImageWithFallback } from '@/components/atoms/ImageWithFallback';
import { ArtistNotificationsCTA } from '@/components/profile/artist-notifications-cta';
import type { Artist } from '@/types/db';
import { PreSaveActions } from './PreSaveActions';
import { ReleaseCountdown } from './ReleaseCountdown';
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
      <div className='min-h-dvh bg-base text-foreground'>
        {/* Ambient glow */}
        <div className='pointer-events-none fixed inset-0'>
          <div className='bg-foreground/5 absolute left-1/2 top-1/3 size-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[120px]' />
        </div>

        <main className='relative z-10 flex min-h-dvh flex-col items-center px-6'>
          <div className='min-h-6 flex-1' />

          <div className='w-full max-w-[17rem]'>
            {/* Release Artwork */}
            <div className='bg-surface-1/30 ring-border relative aspect-square w-full overflow-hidden rounded-lg shadow-2xl shadow-black/40 ring-1'>
              <ImageWithFallback
                src={release.artworkUrl}
                alt={`${release.title} artwork`}
                fill
                className='object-cover'
                sizes='272px'
                priority
                fallbackVariant='release'
              />
            </div>

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

            {/* Countdown Timer */}
            <div className='bg-surface-1/50 ring-border mt-5 rounded-xl p-4 ring-1 ring-inset'>
              <ReleaseCountdown releaseDate={release.releaseDate} />
            </div>

            <PreSaveActions
              releaseId={release.id}
              trackId={release.trackId}
              username={artist.handle}
              slug={release.slug}
              hasSpotify={release.hasSpotify}
              hasAppleMusic={release.hasAppleMusic}
            />

            {/* Notify Me CTA */}
            <div className='mt-4 space-y-2.5'>
              <div className='text-muted-foreground flex items-center justify-center gap-1.5 text-sm'>
                <Bell className='size-3.5' aria-hidden='true' />
                <span>Get notified when it drops</span>
              </div>
              <ArtistNotificationsCTA
                artist={artistData}
                variant='button'
                autoOpen
              />
            </div>
          </div>

          <div className='min-h-6 flex-1' />

          {/* Jovie Branding */}
          <footer className='shrink-0 pb-5 text-center'>
            <Link
              href='/'
              className='text-muted-foreground/70 hover:text-foreground/90 inline-flex items-center gap-1 text-2xs uppercase tracking-widest transition-colors'
            >
              <span>Powered by</span>
              <span className='font-semibold'>Jovie</span>
            </Link>
          </footer>
        </main>
      </div>
    </ReleaseNotificationsProvider>
  );
}
