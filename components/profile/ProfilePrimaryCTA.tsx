'use client';

import Link from 'next/link';
import { useProfileNotifications } from '@/components/organisms/ProfileShell';
import { ArtistNotificationsCTA } from '@/components/profile/ArtistNotificationsCTA';
import { CTAButton } from '@/components/ui/CTAButton';
import {
  type ProfileNextAction,
  resolveProfileNextAction,
} from '@/lib/profile-next-action';
import type { Artist, LegacySocialLink } from '@/types/db';

type ProfilePrimaryCTAProps = {
  artist: Artist;
  socialLinks: LegacySocialLink[];
  spotifyPreferred: boolean;
  autoOpenCapture?: boolean;
  showCapture?: boolean;
};

export function ProfilePrimaryCTA({
  artist,
  socialLinks,
  spotifyPreferred,
  autoOpenCapture = true,
  showCapture = true,
}: ProfilePrimaryCTAProps) {
  const { state, notificationsEnabled, subscribedChannels } =
    useProfileNotifications();

  const hasSubscriptions = Boolean(
    subscribedChannels.email || subscribedChannels.phone
  );
  const isSubscribed = state === 'success' && hasSubscriptions;

  if (showCapture && notificationsEnabled && !isSubscribed) {
    return (
      <div className='space-y-4'>
        <ArtistNotificationsCTA
          artist={artist}
          variant='button'
          autoOpen={autoOpenCapture}
        />
      </div>
    );
  }

  const nextAction: ProfileNextAction = resolveProfileNextAction({
    socialLinks,
    spotifyPreferred,
  });

  if (nextAction.kind === 'tickets') {
    return (
      <div className='space-y-4'>
        <CTAButton
          href={nextAction.url}
          external
          variant='primary'
          size='lg'
          className='w-full'
        >
          Find tickets
        </CTAButton>
      </div>
    );
  }

  if (nextAction.kind === 'shop') {
    return (
      <div className='space-y-4'>
        <CTAButton
          href={nextAction.url}
          external
          variant='primary'
          size='lg'
          className='w-full'
        >
          Shop merch
        </CTAButton>
      </div>
    );
  }

  if (nextAction.kind === 'spotify') {
    return (
      <div className='space-y-4'>
        <a
          href={nextAction.url}
          target='_blank'
          rel='noopener noreferrer'
          className='inline-flex w-full items-center justify-center gap-2 rounded-xl bg-black px-8 py-4 text-lg font-semibold text-white shadow-lg transition-[transform,opacity,filter] duration-150 ease-[cubic-bezier(0.33,.01,.27,1)] hover:opacity-90 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/60 focus-visible:ring-offset-2 dark:bg-white dark:text-black dark:focus-visible:ring-white/70'
          aria-label='Open in Spotify'
        >
          Open in Spotify
        </a>
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      <div className='flex justify-center'>
        <Link
          href={`/${artist.handle}/listen`}
          prefetch={false}
          className='inline-flex w-full max-w-sm items-center justify-center gap-2 rounded-xl bg-black px-8 py-4 text-lg font-semibold text-white shadow-lg transition-[transform,opacity,filter] duration-150 ease-[cubic-bezier(0.33,.01,.27,1)] hover:opacity-90 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/60 focus-visible:ring-offset-2 dark:bg-white dark:text-black dark:focus-visible:ring-white/70'
          aria-label='Open Listen page with music links'
        >
          Listen now
        </Link>
      </div>
    </div>
  );
}
