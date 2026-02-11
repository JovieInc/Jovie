'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { CTAButton } from '@/components/atoms/CTAButton';
import { useProfileNotifications } from '@/components/organisms/profile-shell';
import { AUDIENCE_SPOTIFY_PREFERRED_COOKIE } from '@/constants/app';
import { useBreakpointDown } from '@/hooks/useBreakpoint';
import type { AvailableDSP } from '@/lib/dsp';
import {
  type ProfileNextAction,
  resolveProfileNextAction,
} from '@/lib/profile-next-action';
import { cn } from '@/lib/utils';
import type { Artist, LegacySocialLink } from '@/types/db';
import { ListenDrawer } from './ListenDrawer';

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
  readonly artist: Artist;
  readonly socialLinks: LegacySocialLink[];
  /** @deprecated Use client-side cookie reading instead */
  readonly spotifyPreferred?: boolean;
  readonly autoOpenCapture?: boolean;
  readonly showCapture?: boolean;
  /** Pre-computed merged DSPs for the mobile listen drawer */
  readonly mergedDSPs?: AvailableDSP[];
  readonly enableDynamicEngagement?: boolean;
};

const ctaLinkClass =
  'inline-flex w-full items-center justify-center gap-2 rounded-xl bg-btn-primary px-8 py-3.5 text-base font-semibold text-btn-primary-foreground shadow-sm transition-[transform,opacity,filter] duration-150 ease-[cubic-bezier(0.33,.01,.27,1)] hover:opacity-90 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-(--color-bg-base)';

export function ProfilePrimaryCTA({
  artist,
  socialLinks,
  spotifyPreferred: spotifyPreferredProp,
  autoOpenCapture = true,
  showCapture = true,
  mergedDSPs,
  enableDynamicEngagement = false,
}: ProfilePrimaryCTAProps) {
  const isMobile = useBreakpointDown('md');
  const [drawerOpen, setDrawerOpen] = useState(false);
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
          className={ctaLinkClass}
          aria-label='Open in Spotify'
        >
          Open in Spotify
        </a>
      </div>
    );
  }

  // Mobile: open bottom drawer instead of navigating
  if (isMobile && mergedDSPs && mergedDSPs.length > 0) {
    return (
      <div className='space-y-4'>
        <div className='flex justify-center'>
          <button
            type='button'
            onClick={() => setDrawerOpen(true)}
            className={cn(ctaLinkClass, 'max-w-sm')}
            aria-label='Open music streaming links'
          >
            Listen now
          </button>
        </div>
        <ListenDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          artist={artist}
          dsps={mergedDSPs}
          enableDynamicEngagement={enableDynamicEngagement}
        />
      </div>
    );
  }

  // Desktop: navigate to listen page
  return (
    <div className='space-y-4'>
      <div className='flex justify-center'>
        <Link
          href={`/${artist.handle}/listen`}
          prefetch={false}
          className={cn(ctaLinkClass, 'max-w-sm')}
          aria-label='Open Listen page with music links'
        >
          Listen now
        </Link>
      </div>
    </div>
  );
}
