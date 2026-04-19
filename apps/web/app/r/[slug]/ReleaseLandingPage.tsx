'use client';

/**
 * ReleaseLandingPage Component
 *
 * Uses the same visual shell as artist profiles: full-width artwork hero,
 * menu button top-right, streaming platform buttons below.
 */

import { Share2, Sparkles, Users } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SmartLinkCreditGroup } from '@/app/[username]/[slug]/_lib/data';
import { DSP_LOGO_CONFIG } from '@/components/atoms/DspLogo';
import { Icon } from '@/components/atoms/Icon';
import { APP_ROUTES } from '@/constants/routes';
import { ProfileDrawerShell } from '@/features/profile/ProfileDrawerShell';
import {
  AlbumArtworkContextMenu,
  buildArtworkSizes,
} from '@/features/release/AlbumArtworkContextMenu';
import { ReleaseCreditsDrawer } from '@/features/release/ReleaseCreditsDrawer';
import { SmartLinkAudioPreview } from '@/features/release/SmartLinkAudioPreview';
import { SmartLinkPoweredByFooter } from '@/features/release/SmartLinkPagePrimitives';
import { SmartLinkProviderButton } from '@/features/release/SmartLinkProviderButton';
import {
  SMART_LINK_MENU_ICON_CLASS,
  SMART_LINK_MENU_ITEM_CLASS,
  SmartLinkShell,
} from '@/features/release/SmartLinkShell';
import { PublicShareActionList } from '@/features/share/PublicShareMenu';
import type {
  PreviewSource,
  PreviewVerification,
  ProviderConfidence,
  ProviderKey,
} from '@/lib/discography/types';
import { buildReleaseShareContext } from '@/lib/share/context';
import { postJsonBeacon } from '@/lib/tracking/json-beacon';
import {
  appendUTMParamsToUrl,
  extractUTMParams,
  type PartialUTMParams,
} from '@/lib/utm';

interface Provider {
  key: ProviderKey;
  label: string;
  accent: string;
  url: string | null;
  confidence?: ProviderConfidence;
}

export interface FeaturedArtist {
  readonly name: string;
  readonly handle: string | null;
}

interface ReleaseLandingPageProps
  extends Readonly<{
    readonly release: {
      readonly title: string;
      readonly artworkUrl: string | null;
      readonly releaseDate: string | null;
      readonly previewUrl?: string | null;
      readonly isrc?: string | null;
      readonly previewVerification?: PreviewVerification;
      readonly previewSource?: PreviewSource;
    };
    readonly artist: {
      readonly name: string;
      readonly handle: string | null;
      readonly avatarUrl: string | null;
    };
    readonly featuredArtists?: FeaturedArtist[];
    readonly providers: Provider[];
    readonly credits?: SmartLinkCreditGroup[];
    readonly artworkSizes?: Record<string, string> | null;
    readonly allowDownloads?: boolean;
    readonly soundsUrl?: string | null;
    readonly tracking?: {
      readonly contentType: 'release' | 'track';
      readonly contentId: string;
      readonly smartLinkSlug?: string | null;
    };
    readonly utmParams?: PartialUTMParams;
    readonly parentRelease?: {
      readonly title: string;
      readonly url: string;
    } | null;
    readonly claimBanner?: {
      readonly profileId: string;
      readonly username: string;
    } | null;
    /** URL to the promo download gate page, shown when promo files exist */
    readonly downloadUrl?: string | null;
    readonly initialMenuOpen?: boolean;
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
    <div className='rounded-2xl bg-surface-1 p-3 text-left ring-1 ring-inset ring-white/10 backdrop-blur-sm'>
      <div className='flex items-start justify-between gap-3'>
        <div>
          <p className='text-foreground text-xs font-medium'>
            Is this your music?
          </p>
          <p className='text-muted-foreground mt-1 text-2xs leading-relaxed'>
            Claim this profile to unlock analytics and manage your releases.
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

function SmartLinkArtistLine({
  artist,
  featuredArtists,
}: Readonly<{
  artist: { name: string; handle: string | null };
  featuredArtists?: FeaturedArtist[];
}>) {
  const hasFeatured = featuredArtists && featuredArtists.length > 0;
  const featuredArtistKeyCounts = new Map<string, number>();
  const getFeaturedArtistKey = (name: string, handle: string | null) => {
    const base = handle ?? name;
    const count = featuredArtistKeyCounts.get(base) ?? 0;
    featuredArtistKeyCounts.set(base, count + 1);
    return count === 0 ? base : `${base}-${count + 1}`;
  };

  const primaryName = artist.handle ? (
    <Link
      href={`/${artist.handle}`}
      className='text-white/70 transition-colors hover:text-white/90'
    >
      {artist.name}
    </Link>
  ) : (
    <span className='text-white/70'>{artist.name}</span>
  );

  if (!hasFeatured) {
    return (
      <p className='mt-1 text-[14px] font-[450] [text-shadow:0_1px_8px_rgba(0,0,0,0.3)]'>
        {primaryName}
      </p>
    );
  }

  return (
    <p className='mt-1 text-[14px] font-[450] [text-shadow:0_1px_8px_rgba(0,0,0,0.3)]'>
      {primaryName}
      <span className='text-white/40'> feat. </span>
      {featuredArtists.map((fa, i) => (
        <span key={getFeaturedArtistKey(fa.name, fa.handle)}>
          {i > 0 && (
            <span className='text-white/40'>
              {i === featuredArtists.length - 1 ? ' & ' : ', '}
            </span>
          )}
          {fa.handle ? (
            <Link
              href={`/${fa.handle}`}
              className='text-white/70 transition-colors hover:text-white/90'
            >
              {fa.name}
            </Link>
          ) : (
            <span className='text-white/70'>{fa.name}</span>
          )}
        </span>
      ))}
    </p>
  );
}

export function ReleaseLandingPage({
  release,
  artist,
  featuredArtists,
  providers,
  credits,
  artworkSizes,
  allowDownloads = false,
  soundsUrl,
  tracking,
  utmParams = {},
  parentRelease = null,
  claimBanner = null,
  downloadUrl = null,
  initialMenuOpen = false,
}: Readonly<ReleaseLandingPageProps>) {
  const [menuOpen, setMenuOpen] = useState(initialMenuOpen);
  const [shareOpen, setShareOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(initialMenuOpen);
  }, [initialMenuOpen]);

  const clickableProviders = providers.filter(
    (provider): provider is Provider & { url: string } => Boolean(provider.url)
  );
  const resolvedUtmParams = useMemo(() => {
    if (globalThis.window === undefined) {
      return utmParams;
    }

    const currentUtmParams = extractUTMParams(
      new URLSearchParams(globalThis.location.search)
    );

    return Object.keys(currentUtmParams).length > 0
      ? currentUtmParams
      : utmParams;
  }, [utmParams]);
  // All providers rendered as a flat list — no canonical/fallback distinction for fans
  const sizes = buildArtworkSizes(artworkSizes, release.artworkUrl);
  const hasCredits = credits?.some(group => group.entries.length > 0);
  const shareSlug = tracking?.smartLinkSlug ?? 'release';
  const sharePathname = artist.handle
    ? `/${artist.handle}/${shareSlug}`
    : tracking?.smartLinkSlug
      ? `/r/${tracking.smartLinkSlug}`
      : undefined;
  const shareContext = useMemo(
    () =>
      buildReleaseShareContext({
        username: artist.handle ?? 'release',
        slug: shareSlug,
        title: release.title,
        artistName: artist.name,
        artworkUrl: release.artworkUrl,
        pathname: sharePathname,
        storyQueryParams: artist.handle
          ? undefined
          : {
              slug: shareSlug,
              title: release.title,
              artistName: artist.name,
              pathname: sharePathname ?? `/r/${shareSlug}`,
              artworkUrl: release.artworkUrl,
            },
      }),
    [
      artist.handle,
      artist.name,
      release.artworkUrl,
      release.title,
      sharePathname,
      shareSlug,
    ]
  );
  const hasPreview = Boolean(release.previewUrl);
  const shouldShowPreview =
    hasPreview &&
    (release.previewVerification == null ||
      release.previewVerification === 'verified' ||
      release.previewVerification === 'fallback');

  const handleProviderClick = useCallback(
    (providerKey: ProviderKey) => {
      if (!artist.handle || !tracking?.contentId || !tracking?.contentType)
        return;
      postJsonBeacon(
        '/api/track',
        {
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
        },
        () => {}
      );
    },
    [artist.handle, tracking]
  );

  return (
    <SmartLinkShell
      artworkUrl={release.artworkUrl}
      artworkAlt={`${release.title} artwork`}
      onMenuOpen={() => setMenuOpen(true)}
      artworkWrapper={
        allowDownloads
          ? img => (
              <AlbumArtworkContextMenu
                title={release.title}
                sizes={sizes}
                allowDownloads={allowDownloads}
              >
                <div className='relative h-full w-full'>{img}</div>
              </AlbumArtworkContextMenu>
            )
          : undefined
      }
      heroOverlay={
        <div className='absolute inset-x-0 bottom-5 z-10 flex items-end justify-between px-5'>
          <div className='min-w-0 flex-1'>
            <h1 className='text-[28px] font-[590] leading-[1.06] tracking-[-0.02em] text-white [text-shadow:0_1px_12px_rgba(0,0,0,0.4)]'>
              {release.title}
            </h1>
            <SmartLinkArtistLine
              artist={artist}
              featuredArtists={featuredArtists}
            />
          </div>
          {shouldShowPreview ? (
            <div className='mb-1 ml-3 shrink-0'>
              <SmartLinkAudioPreview
                contentId={tracking?.contentId ?? release.title}
                title={release.title}
                artistName={artist.name}
                artworkUrl={release.artworkUrl}
                previewUrl={release.previewUrl ?? null}
                isrc={release.isrc}
                previewVerification={release.previewVerification}
                previewSource={release.previewSource}
              />
            </div>
          ) : null}
        </div>
      }
    >
      {/* Content — streaming buttons (scrollable) */}
      <div className='relative z-10 flex min-h-0 flex-1 flex-col px-5 pt-3'>
        <div className='min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-hide'>
          {claimBanner && (
            <SmartLinkClaimBanner
              profileId={claimBanner.profileId}
              username={claimBanner.username}
            />
          )}

          <div className='space-y-2'>
            {clickableProviders.map(provider => {
              const logoConfig = DSP_LOGO_CONFIG[provider.key];
              return (
                <SmartLinkProviderButton
                  key={provider.key}
                  href={appendUTMParamsToUrl(provider.url, resolvedUtmParams)}
                  onClick={() => handleProviderClick(provider.key)}
                  label={logoConfig?.name ?? provider.label}
                  iconPath={logoConfig?.iconPath}
                />
              );
            })}
          </div>

          {clickableProviders.length === 0 && (
            <div className='rounded-2xl bg-surface-1 p-5 text-center ring-1 ring-inset ring-white/[0.08]'>
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

        {/* Footer — always pinned at bottom */}
        <div className='shrink-0 pb-[max(env(safe-area-inset-bottom),8px)]'>
          <SmartLinkPoweredByFooter />
        </div>
      </div>

      {/* Menu drawer */}
      <ProfileDrawerShell
        open={menuOpen}
        onOpenChange={setMenuOpen}
        title='Menu'
        dataTestId='release-landing-menu-drawer'
      >
        <div className='flex flex-col gap-0.5'>
          <button
            type='button'
            className={SMART_LINK_MENU_ITEM_CLASS}
            onClick={() => {
              setMenuOpen(false);
              setShareOpen(true);
            }}
          >
            <Share2 className={SMART_LINK_MENU_ICON_CLASS} />
            Share
          </button>
          {hasCredits ? (
            <button
              type='button'
              className={SMART_LINK_MENU_ITEM_CLASS}
              onClick={() => {
                setMenuOpen(false);
                setCreditsOpen(true);
              }}
            >
              <Users className={SMART_LINK_MENU_ICON_CLASS} />
              Credits
            </button>
          ) : null}
          {soundsUrl ? (
            <Link
              href={appendUTMParamsToUrl(soundsUrl, resolvedUtmParams)}
              className={SMART_LINK_MENU_ITEM_CLASS}
              onClick={() => setMenuOpen(false)}
            >
              <Sparkles className={SMART_LINK_MENU_ICON_CLASS} />
              Use this sound
            </Link>
          ) : null}
        </div>
      </ProfileDrawerShell>

      <ProfileDrawerShell
        open={shareOpen}
        onOpenChange={setShareOpen}
        title='Share'
        subtitle='Share this release'
      >
        <PublicShareActionList
          context={shareContext}
          onActionComplete={() => setShareOpen(false)}
        />
      </ProfileDrawerShell>

      {/* Credits drawer */}
      <ReleaseCreditsDrawer
        open={creditsOpen}
        onOpenChange={setCreditsOpen}
        credits={credits}
      />
    </SmartLinkShell>
  );
}
