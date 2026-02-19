'use client';

/**
 * UnreleasedReleaseHero Component
 *
 * Displays a hero section for unreleased content with countdown timer
 * and a "Notify Me" subscription CTA. Used when releaseDate > now.
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
      <div className='min-h-dvh bg-black text-white'>
        {/* Ambient glow */}
        <div className='pointer-events-none fixed inset-0'>
          <div className='absolute left-1/2 top-1/3 size-[480px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/[0.03] blur-[120px]' />
        </div>

        <main className='relative z-10 flex min-h-dvh flex-col items-center px-6'>
          <div className='min-h-6 flex-1' />

          <div className='w-full max-w-[272px]'>
            {/* Release Artwork */}
            <div className='relative aspect-square w-full overflow-hidden rounded-lg bg-white/[0.04] shadow-2xl shadow-black/60 ring-1 ring-white/[0.08]'>
              {release.artworkUrl ? (
                <Image
                  src={release.artworkUrl}
                  alt={`${release.title} artwork`}
                  fill
                  className='object-cover'
                  sizes='272px'
                  priority
                />
              ) : (
                <div className='flex h-full w-full items-center justify-center'>
                  <Icon
                    name='Disc3'
                    className='size-16 text-white/20'
                    aria-hidden='true'
                  />
                </div>
              )}
            </div>

            {/* Release Info */}
            <div className='mt-4 text-center'>
              <h1 className='text-[17px] font-semibold leading-snug tracking-tight'>
                {release.title}
              </h1>
              <Link
                href={`/${artist.handle}`}
                className='mt-1 block text-[13px] text-white/50 transition-colors hover:text-white/70'
              >
                {artist.name}
              </Link>
            </div>

            {/* Countdown Timer */}
            <div className='mt-5 rounded-xl bg-white/[0.05] p-4 ring-1 ring-inset ring-white/[0.06]'>
              <ReleaseCountdown releaseDate={release.releaseDate} />
            </div>

            {/* Notify Me CTA */}
            <div className='mt-4 space-y-2.5'>
              <div className='flex items-center justify-center gap-1.5 text-[13px] text-white/50'>
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
              className='inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-white/20 transition-colors hover:text-white/35'
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
