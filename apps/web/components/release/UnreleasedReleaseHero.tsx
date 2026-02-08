'use client';

/**
 * UnreleasedReleaseHero Component
 *
 * Displays a hero section for unreleased content with countdown timer
 * and a "Notify Me" subscription CTA. Used when releaseDate > now.
 *
 * Uses design system tokens for light/dark mode support.
 * Remains a client component due to interactive children (countdown, notifications).
 */

import { Bell } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { Icon } from '@/components/atoms/Icon';
import { ArtistNotificationsCTA } from '@/components/profile/artist-notifications-cta';
import type { Artist } from '@/types/db';
import { ReleaseCountdown } from './ReleaseCountdown';
import { ReleaseNotificationsProvider } from './ReleaseNotificationsProvider';

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
      <div className='min-h-screen bg-base text-primary-token'>
        {/* Ambient glow background */}
        <div className='pointer-events-none fixed inset-0'>
          <div className='absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/[0.04] blur-3xl dark:bg-accent/[0.06]' />
        </div>

        <main className='relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-8'>
          <div className='w-full max-w-sm space-y-6'>
            {/* Release Artwork */}
            <div className='relative aspect-square w-full overflow-hidden rounded-[20px] border border-default bg-surface-0 shadow-xl'>
              {release.artworkUrl ? (
                <Image
                  src={release.artworkUrl}
                  alt={`${release.title} artwork`}
                  fill
                  className='object-cover'
                  sizes='(max-width: 384px) 100vw, 384px'
                  priority
                />
              ) : (
                <div className='flex h-full w-full items-center justify-center'>
                  <Icon
                    name='Disc3'
                    className='h-20 w-20 text-quaternary-token'
                    aria-hidden='true'
                  />
                </div>
              )}
            </div>

            {/* Release Info */}
            <div className='text-center'>
              <h1 className='text-xl font-semibold tracking-tight sm:text-2xl'>
                {release.title}
              </h1>
              <p className='mt-1.5 text-base text-secondary-token'>
                {artist.name}
              </p>
            </div>

            {/* Countdown Timer */}
            <div className='rounded-2xl border border-subtle bg-surface-1 p-5'>
              <ReleaseCountdown releaseDate={release.releaseDate} />
            </div>

            {/* Notify Me CTA */}
            <div className='space-y-3'>
              <div className='flex items-center justify-center gap-2 text-sm text-secondary-token'>
                <Bell className='h-4 w-4' aria-hidden='true' />
                <span>Get notified when it drops</span>
              </div>
              <ArtistNotificationsCTA
                artist={artistData}
                variant='button'
                autoOpen
              />
            </div>

            {/* Jovie Branding */}
            <footer className='pt-4 text-center'>
              <Link
                href='/'
                className='inline-flex items-center gap-1.5 text-[11px] text-quaternary-token transition-colors hover:text-tertiary-token'
              >
                <span>Powered by</span>
                <span className='font-medium'>Jovie</span>
              </Link>
            </footer>
          </div>
        </main>
      </div>
    </ReleaseNotificationsProvider>
  );
}
