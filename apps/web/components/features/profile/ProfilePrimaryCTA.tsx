'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { DSP_LOGO_CONFIG } from '@/components/atoms/DspLogo';
import { CTAButton } from '@/components/molecules/CTAButton';
import { useProfileNotifications } from '@/components/organisms/profile-shell';
import {
  AUDIENCE_SPOTIFY_PREFERRED_COOKIE,
  LISTEN_COOKIE,
} from '@/constants/app';
import { SubscriptionFormSkeleton } from '@/features/profile/artist-notifications-cta/shared';
import { useBreakpointDown } from '@/hooks/useBreakpoint';
import { track } from '@/lib/analytics';
import type { AvailableDSP } from '@/lib/dsp';
import {
  type ProfileNextAction,
  resolveProfileNextAction,
} from '@/lib/profile-next-action';
import { cn } from '@/lib/utils';
import type { Artist, LegacySocialLink } from '@/types/db';
import { ListenDrawer } from './ListenDrawer';

const ctaLoadingFallback = (
  <div className='space-y-3 py-2 sm:py-3'>
    <div className='h-3 w-40 rounded skeleton' aria-hidden='true' />
    <SubscriptionFormSkeleton />
  </div>
);

const ArtistNotificationsCTA = dynamic(
  () =>
    import('@/features/profile/artist-notifications-cta').then(mod => ({
      default: mod.ArtistNotificationsCTA,
    })),
  { ssr: false, loading: () => ctaLoadingFallback }
);

const TwoStepNotificationsCTA = dynamic(
  () =>
    import('@/features/profile/artist-notifications-cta').then(mod => ({
      default: mod.TwoStepNotificationsCTA,
    })),
  { ssr: false, loading: () => ctaLoadingFallback }
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
  /** Whether to show the two-step notification subscribe variant */
  readonly subscribeTwoStep?: boolean;
};

const ctaLinkClass =
  'inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--profile-pearl-primary-bg)] px-8 py-3.5 text-[15px] font-semibold tracking-[-0.015em] text-[var(--profile-pearl-primary-fg)] shadow-[var(--profile-pearl-shadow)] transition-[transform,opacity,filter] duration-150 ease-[cubic-bezier(0.33,.01,.27,1)] will-change-transform hover:opacity-92 active:scale-[0.985] active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-(--color-bg-base)';

function readListenCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split(';')
    .find(c => c.trim().startsWith(`${LISTEN_COOKIE}=`));
  return match?.split('=')[1] ?? null;
}

function clearListenCookie() {
  document.cookie = `${LISTEN_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
  try {
    localStorage.removeItem(LISTEN_COOKIE);
  } catch {}
}

function DspIconPreview({ dsps }: { readonly dsps: AvailableDSP[] }) {
  const icons = dsps.slice(0, 3);
  if (icons.length < 2) return null;

  return (
    <span className='-space-x-1 flex opacity-60' aria-hidden='true'>
      {icons.map(dsp => {
        const config = DSP_LOGO_CONFIG[dsp.key as keyof typeof DSP_LOGO_CONFIG];
        if (!config) return null;
        return (
          <span
            key={dsp.key}
            className='flex h-5 w-5 items-center justify-center rounded-full'
            style={{ backgroundColor: `${config.color}33` }}
          >
            <svg
              viewBox='0 0 24 24'
              fill={config.color}
              className='h-3 w-3'
              aria-hidden='true'
            >
              <path d={config.iconPath} />
            </svg>
          </span>
        );
      })}
    </span>
  );
}

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

  const handleListenClick = useCallback(() => {
    if (!mergedDSPs || mergedDSPs.length === 0) {
      setDrawerOpen(true);
      return;
    }

    const savedKey = readListenCookie();
    if (savedKey) {
      const savedDsp = mergedDSPs.find(d => d.key === savedKey);
      if (savedDsp) {
        // Open synchronously to avoid popup blocker
        const win = globalThis.open(
          savedDsp.url,
          '_blank',
          'noopener,noreferrer'
        );
        track('listen_click', {
          handle: artist.handle,
          linkType: 'listen',
          platform: savedDsp.key,
          source: 'direct_preference',
        });
        // Attempt deep-link asynchronously
        import('@/lib/deep-links')
          .then(({ getDSPDeepLinkConfig, openDeepLink }) => {
            const config = getDSPDeepLinkConfig(savedDsp.key);
            if (config && win) {
              openDeepLink(savedDsp.url, config).catch(() => {});
            }
          })
          .catch(() => {});
        return;
      }
      // Stale cookie, DSP no longer available
      clearListenCookie();
    }

    setDrawerOpen(true);
  }, [mergedDSPs, artist.handle]);

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

  // Mobile: skip-drawer for returning users, or open drawer for first-timers
  if (isMobile && mergedDSPs && mergedDSPs.length > 0) {
    const hasSavedPreference = Boolean(readListenCookie());

    return (
      <div className='space-y-4'>
        <div className='flex flex-col items-center gap-2'>
          <button
            type='button'
            onClick={handleListenClick}
            className={cn(ctaLinkClass, 'max-w-sm')}
            aria-label='Open music streaming links'
          >
            Listen now
            <DspIconPreview dsps={mergedDSPs} />
          </button>
          {hasSavedPreference ? (
            <button
              type='button'
              onClick={() => setDrawerOpen(true)}
              className='text-[13px] text-white/40 transition-colors hover:text-white/60'
            >
              Change
            </button>
          ) : null}
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
          {mergedDSPs ? <DspIconPreview dsps={mergedDSPs} /> : null}
        </Link>
      </div>
    </div>
  );
}
