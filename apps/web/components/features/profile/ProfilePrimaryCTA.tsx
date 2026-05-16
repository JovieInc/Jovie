'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { CTAButton } from '@/components/molecules/CTAButton';
import { useProfileNotifications } from '@/components/organisms/profile-shell/ProfileNotificationsContext';
import { AUDIENCE_SPOTIFY_PREFERRED_COOKIE } from '@/constants/app';
import { ArtistNotificationsCTA } from '@/features/profile/artist-notifications-cta/ArtistNotificationsCTA';
import { profilePrimaryPillClassName } from '@/features/profile/artist-notifications-cta/shared';
import { TwoStepNotificationsCTA } from '@/features/profile/artist-notifications-cta/TwoStepNotificationsCTA';
import { useBreakpointDown } from '@/hooks/useBreakpoint';
import type { AvailableDSP } from '@/lib/dsp';
import {
  type ProfileNextAction,
  resolveProfileNextAction,
} from '@/lib/profile-next-action';
import { cn } from '@/lib/utils';
import type { Artist, LegacySocialLink } from '@/types/db';
import { ListenDrawer } from './ListenDrawer';

// Previously these imports used `dynamic({ ssr: false })` to defer the
// notification flow modules to the client. That bailed the parent SSR tree
// to client-side rendering and emitted
// `<template data-dgst="BAILOUT_TO_CLIENT_SIDE_RENDERING">` in the streaming
// payload — shipping the animated skeleton from `loading.tsx` as the initial
// visible HTML for every cold visit (JOV-2273).
//
// Notification CTAs render trivially on the server (just markup + a Bell
// icon) and only need client JS for the subscribe interaction itself, so
// direct import is safe.
//
// `ProfilePrimaryCTA` is currently only consumed by unit tests; the change
// is preventative against future usage on the public profile RSC tree.

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
  /** Whether to show the two-step notification subscribe variant */
  readonly subscribeTwoStep?: boolean;
};

const ctaLinkClass = `${profilePrimaryPillClassName} w-full gap-2 px-8`;

export function ProfilePrimaryCTA({
  artist,
  socialLinks,
  spotifyPreferred: spotifyPreferredProp,
  autoOpenCapture = true,
  showCapture = true,
  mergedDSPs,
  enableDynamicEngagement = false,
  subscribeTwoStep = false,
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
    if (subscribeTwoStep) {
      return (
        <div className='space-y-3 py-2 sm:py-3'>
          <TwoStepNotificationsCTA artist={artist} />
        </div>
      );
    }
    return (
      <div className='space-y-3 py-2 sm:py-3'>
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
