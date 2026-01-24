'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useMemo } from 'react';
import { useProfileNotifications } from '@/components/organisms/profile-shell';
import { CTAButton } from '@/components/ui/CTAButton';
import { AUDIENCE_SPOTIFY_PREFERRED_COOKIE } from '@/constants/app';
import {
  type ProfileNextAction,
  resolveProfileNextAction,
} from '@/lib/profile-next-action';
import type { Artist, LegacySocialLink } from '@/types/db';

const ArtistNotificationsCTA = dynamic(
  () =>
    import('@/components/profile/artist-notifications-cta').then(mod => ({
      default: mod.ArtistNotificationsCTA,
    })),
  {
    ssr: false,
    loading: () => (
      <div className='space-y-4 py-4 sm:py-5' aria-busy='true'>
        <div className='h-12 w-full rounded-xl bg-surface-1 animate-pulse' />
      </div>
    ),
  }
);

/**
 * Read Spotify preference from client-side cookie.
 * This avoids server-side cookie access which breaks static optimization.
 */
function useSpotifyPreferred(): boolean {
  return useMemo(() => {
    if (typeof document === 'undefined') return false;
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === AUDIENCE_SPOTIFY_PREFERRED_COOKIE) {
        return value === '1';
      }
    }
    return false;
  }, []);
}

type ProfilePrimaryCTAProps = {
  artist: Artist;
  socialLinks: LegacySocialLink[];
  /** @deprecated Use client-side cookie reading instead */
  spotifyPreferred?: boolean;
  autoOpenCapture?: boolean;
  showCapture?: boolean;
};

export function ProfilePrimaryCTA({
  artist,
  socialLinks,
  spotifyPreferred: spotifyPreferredProp,
  autoOpenCapture = true,
  showCapture = true,
}: ProfilePrimaryCTAProps) {
  // Read spotify preference from client-side cookie (or use prop as fallback)
  const spotifyPreferredFromCookie = useSpotifyPreferred();
  const spotifyPreferred = spotifyPreferredProp ?? spotifyPreferredFromCookie;
  const {
    state,
    hasStoredContacts,
    hydrationStatus,
    notificationsEnabled,
    subscribedChannels,
  } = useProfileNotifications();

  const hasSubscriptions = Boolean(
    subscribedChannels.email || subscribedChannels.sms
  );
  const isSubscribed = state === 'success' && hasSubscriptions;

  const isHydratingSubscriptionStatus =
    hydrationStatus === 'checking' && hasStoredContacts;

  if (
    showCapture &&
    notificationsEnabled &&
    !isSubscribed &&
    !isHydratingSubscriptionStatus
  ) {
    return (
      <div className='space-y-4 py-4 sm:py-5'>
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
          className='inline-flex w-full items-center justify-center gap-2 rounded-xl bg-btn-primary px-8 py-4 text-lg font-semibold text-btn-primary-foreground shadow-lg transition-[transform,opacity,filter] duration-150 ease-[cubic-bezier(0.33,.01,.27,1)] hover:opacity-90 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-(--color-bg-base)'
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
          className='inline-flex w-full max-w-sm items-center justify-center gap-2 rounded-xl bg-btn-primary px-8 py-4 text-lg font-semibold text-btn-primary-foreground shadow-lg transition-[transform,opacity,filter] duration-150 ease-[cubic-bezier(0.33,.01,.27,1)] hover:opacity-90 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-(--color-bg-base)'
          aria-label='Open Listen page with music links'
        >
          Listen now
        </Link>
      </div>
    </div>
  );
}
