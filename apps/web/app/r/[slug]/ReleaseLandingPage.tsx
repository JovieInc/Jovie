'use client';

/**
 * ReleaseLandingPage Component
 *
 * A public-facing landing page for release smart links.
 * Shows release artwork, title, artist info, and streaming platform buttons.
 * Includes right-click context menu on artwork for downloading at multiple sizes.
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DSP_LOGO_CONFIG } from '@/components/atoms/DspLogo';
import { Icon } from '@/components/atoms/Icon';
import { APP_ROUTES } from '@/constants/routes';
import {
  AlbumArtworkContextMenu,
  buildArtworkSizes,
} from '@/features/release/AlbumArtworkContextMenu';
import {
  SmartLinkArtistName,
  SmartLinkArtworkCard,
  SmartLinkPageFrame,
} from '@/features/release/SmartLinkPagePrimitives';
import { SmartLinkProviderButton } from '@/features/release/SmartLinkProviderButton';
import type { ProviderKey } from '@/lib/discography/types';
import { postJsonBeacon } from '@/lib/tracking/json-beacon';
import { appendUTMParamsToUrl, type PartialUTMParams } from '@/lib/utm';

interface Provider {
  key: ProviderKey;
  label: string;
  accent: string;
  url: string | null;
}

interface ReleaseLandingPageProps
  extends Readonly<{
    readonly release: {
      readonly title: string;
      readonly artworkUrl: string | null;
      readonly releaseDate: string | null;
    };
    readonly artist: {
      readonly name: string;
      readonly handle: string | null;
      readonly avatarUrl: string | null;
    };
    readonly providers: Provider[];
    /** Pre-generated artwork sizes for download context menu */
    readonly artworkSizes?: Record<string, string> | null;
    /** Whether the artist allows artwork downloads on public pages */
    readonly allowDownloads?: boolean;
    /** URL to the /sounds page, shown when video provider links exist */
    readonly soundsUrl?: string | null;
    /** Optional tracking context for smartlink click analytics */
    readonly tracking?: {
      readonly contentType: 'release' | 'track';
      readonly contentId: string;
      readonly smartLinkSlug?: string | null;
    };
    /** UTM params captured from incoming request and passed to outbound links */
    readonly utmParams?: PartialUTMParams;
    /** Optional profile-claim CTA details for unclaimed creators */
    readonly claimBanner?: {
      readonly profileId: string;
      readonly username: string;
    } | null;
  }> {}

function SmartLinkClaimBanner({
  profileId,
  username,
}: Readonly<{ profileId: string; username: string }>) {
  const dismissalKey = useMemo(
    () => `smartlink:claim-banner:dismissed:${profileId}`,
    [profileId]
  );
  const [isDismissed, setIsDismissed] = useState(
    () => globalThis.localStorage?.getItem(dismissalKey) === '1'
  );

  useEffect(() => {
    setIsDismissed(globalThis.localStorage?.getItem(dismissalKey) === '1');
  }, [dismissalKey]);

  const handleDismiss = useCallback(() => {
    globalThis.localStorage?.setItem(dismissalKey, '1');
    setIsDismissed(true);
  }, [dismissalKey]);

  if (isDismissed) return null;

  const encodedRedirect = encodeURIComponent(`/${username}`);
  const signupUrl = `${APP_ROUTES.SIGNUP}?handle=${encodeURIComponent(username)}&redirect_url=${encodedRedirect}`;

  return (
    <div className='mt-4 rounded-xl bg-surface-1/55 p-3 text-left ring-1 ring-inset ring-white/10 backdrop-blur-sm'>
      <div className='flex items-start justify-between gap-3'>
        <div>
          <p className='text-foreground text-xs font-medium'>
            Is this your music?
          </p>
          <p className='text-muted-foreground mt-1 text-2xs leading-relaxed'>
            Claim this profile to unlock SmartLink analytics and manage your
            releases.
          </p>
          <Link
            href={signupUrl}
            className='text-foreground/90 hover:text-foreground mt-2 inline-flex items-center gap-1 text-2xs font-semibold transition-colors'
          >
            Claim profile
            <Icon name='ArrowRight' className='h-3 w-3' aria-hidden='true' />
          </Link>
        </div>

        <button
          type='button'
          onClick={handleDismiss}
          className='text-muted-foreground hover:text-foreground inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors'
          aria-label='Dismiss claim profile banner'
        >
          <Icon name='X' className='h-3.5 w-3.5' aria-hidden='true' />
        </button>
      </div>
    </div>
  );
}

export function ReleaseLandingPage({
  release,
  artist,
  providers,
  artworkSizes,
  allowDownloads = false,
  soundsUrl,
  tracking,
  utmParams = {},
  claimBanner = null,
}: Readonly<ReleaseLandingPageProps>) {
  const formattedDate = release.releaseDate
    ? new Date(release.releaseDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;
  const clickableProviders = providers.filter(
    (provider): provider is Provider & { url: string } => Boolean(provider.url)
  );
  const sizes = buildArtworkSizes(artworkSizes, release.artworkUrl);

  const handleProviderClick = useCallback(
    (providerKey: ProviderKey) => {
      if (!artist.handle || !tracking?.contentId || !tracking?.contentType)
        return;
      const payload = {
        handle: artist.handle,
        linkType: 'listen',
        target: providerKey,
        source: 'link',
        context: {
          contentType: tracking.contentType,
          contentId: tracking.contentId,
          provider: providerKey,
          smartLinkSlug: tracking.smartLinkSlug ?? undefined,
        },
      };

      postJsonBeacon('/api/track', payload, () => {
        // Ignore tracking errors
      });
    },
    [artist.handle, tracking]
  );

  return (
    <SmartLinkPageFrame glowClassName='size-[30rem]'>
      {/* Artwork + Info — pinned at top, never scrolls */}
      <div className='shrink-0'>
        {/* Release Artwork */}
        <AlbumArtworkContextMenu
          title={release.title}
          sizes={sizes}
          allowDownloads={allowDownloads}
        >
          <SmartLinkArtworkCard
            title={release.title}
            artworkUrl={release.artworkUrl}
            className='shadow-black/40'
          />
        </AlbumArtworkContextMenu>

        {/* Release Info */}
        <div className='mt-4 text-center'>
          <h1 className='text-lg font-semibold leading-snug tracking-tight'>
            {release.title}
          </h1>
          <SmartLinkArtistName
            name={artist.name}
            handle={artist.handle}
            className='hover:text-foreground block text-sm transition-colors'
          />
          {formattedDate && (
            <p className='text-muted-foreground/70 mt-0.5 text-2xs tracking-wide'>
              {formattedDate}
            </p>
          )}

          {claimBanner && (
            <SmartLinkClaimBanner
              profileId={claimBanner.profileId}
              username={claimBanner.username}
            />
          )}
        </div>
      </div>

      {/* Streaming Platform Buttons — scrolls independently when overflowing */}
      <div className='mt-5 min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-hide'>
        <div className='space-y-2 py-1'>
          {clickableProviders.map(provider => {
            const logoConfig = DSP_LOGO_CONFIG[provider.key];

            return (
              <SmartLinkProviderButton
                key={provider.key}
                href={appendUTMParamsToUrl(provider.url, utmParams)}
                onClick={() => handleProviderClick(provider.key)}
                label={logoConfig?.name ?? provider.label}
                iconPath={logoConfig?.iconPath}
              />
            );
          })}
        </div>

        {/* "Use this sound" CTA for short-form video platforms */}
        {soundsUrl && (
          <div className='pt-1'>
            <Link
              href={appendUTMParamsToUrl(soundsUrl, utmParams)}
              className='group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-pink-500/10 to-violet-500/10 px-4 py-3 ring-1 ring-inset ring-white/[0.08] backdrop-blur-sm transition-colors duration-100 hover:from-pink-500/20 hover:to-violet-500/20'
            >
              <Icon
                name='Sparkles'
                className='text-muted-foreground h-4 w-4 transition-colors group-hover:text-foreground/90'
                aria-hidden='true'
              />
              <span className='text-foreground/85 group-hover:text-foreground text-sm font-semibold transition-colors'>
                Use this sound
              </span>
            </Link>
          </div>
        )}

        {/* Empty state if no providers */}
        {clickableProviders.length === 0 && (
          <div className='rounded-xl bg-surface-1/40 p-5 text-center ring-1 ring-inset ring-white/[0.08]'>
            <Icon
              name='Music'
              className='text-muted-foreground mx-auto h-8 w-8'
              aria-hidden='true'
            />
            <p className='text-muted-foreground mt-2 text-sm'>
              No streaming links available yet.
            </p>
          </div>
        )}
      </div>
    </SmartLinkPageFrame>
  );
}
