'use client';

/**
 * ReleaseLandingPage Component
 *
 * Uses the same visual shell as artist profiles: full-width artwork hero,
 * menu button top-right, streaming platform buttons below.
 */

import { MoreHorizontal, Share2, Sparkles, Users } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SmartLinkCreditGroup } from '@/app/[username]/[slug]/_lib/data';
import { BrandLogo } from '@/components/atoms/BrandLogo';
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
import type {
  PreviewSource,
  PreviewVerification,
  ProviderConfidence,
  ProviderKey,
} from '@/lib/discography/types';
import { postJsonBeacon } from '@/lib/tracking/json-beacon';
import { appendUTMParamsToUrl, type PartialUTMParams } from '@/lib/utm';

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
    <div className='rounded-2xl bg-surface-1/55 p-3 text-left ring-1 ring-inset ring-white/10 backdrop-blur-sm'>
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

const menuItemClass =
  'flex w-full items-center gap-3 rounded-[14px] px-4 py-3 text-left text-[14px] font-[470] text-white/88 transition-colors duration-150 active:bg-white/[0.06]';
const menuIconClass = 'h-[16px] w-[16px] text-white/40';

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
}: Readonly<ReleaseLandingPageProps>) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const clickableProviders = providers.filter(
    (provider): provider is Provider & { url: string } => Boolean(provider.url)
  );
  // All providers rendered as a flat list — no canonical/fallback distinction for fans
  const sizes = buildArtworkSizes(artworkSizes, release.artworkUrl);
  const hasCredits = credits && credits.some(group => group.entries.length > 0);
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

  const handleShare = useCallback(async () => {
    setMenuOpen(false);
    try {
      await navigator.share?.({
        title: `${release.title} — ${artist.name}`,
        url: globalThis.location.href,
      });
    } catch {
      // User cancelled or share not available
    }
  }, [release.title, artist.name]);

  return (
    <div className='profile-viewport relative h-[100dvh] overflow-clip bg-base text-primary-token md:h-auto md:min-h-[100dvh] md:overflow-x-hidden'>
      {/* Ambient background */}
      {release.artworkUrl ? (
        <div className='absolute inset-0' aria-hidden='true'>
          <div className='absolute inset-[-10%]'>
            <Image
              src={release.artworkUrl}
              alt=''
              fill
              sizes='100vw'
              className='scale-[1.05] object-cover opacity-28 blur-[84px] saturate-[0.88]'
            />
          </div>
          <div className='absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_26%),linear-gradient(180deg,rgba(6,8,13,0.34)_0%,rgba(7,8,10,0.82)_42%,rgba(8,9,10,0.98)_100%)]' />
        </div>
      ) : null}

      {/* Card container */}
      <div className='relative mx-auto flex h-[100dvh] w-full max-w-[680px] items-stretch justify-center md:h-auto md:min-h-[100dvh] md:items-center md:px-6 md:py-8'>
        <main className='relative flex w-full items-stretch md:items-center'>
          <div className='relative flex h-full w-full max-w-[430px] flex-col overflow-clip bg-[color:var(--profile-content-bg)] md:h-auto md:mx-auto md:min-h-[min(920px,calc(100dvh-64px))] md:overflow-hidden md:rounded-[30px] md:border md:border-[color:var(--profile-panel-border)] md:shadow-[var(--profile-panel-shadow)]'>
            <div className='pointer-events-none absolute inset-0 bg-[var(--profile-panel-gradient)]' />

            {/* Hero — full-width artwork */}
            <header className='relative w-full shrink-0 aspect-[4/3] md:aspect-square'>
              <div className='absolute inset-0'>
                {allowDownloads ? (
                  <AlbumArtworkContextMenu
                    title={release.title}
                    sizes={sizes}
                    allowDownloads={allowDownloads}
                  >
                    <div className='relative h-full w-full'>
                      {release.artworkUrl ? (
                        <Image
                          src={release.artworkUrl}
                          alt={`${release.title} artwork`}
                          fill
                          priority
                          sizes='(max-width: 767px) 100vw, 430px'
                          className='object-cover object-center'
                        />
                      ) : (
                        <div className='flex h-full w-full items-center justify-center bg-surface-2'>
                          <Icon
                            name='Disc3'
                            className='text-muted-foreground h-16 w-16'
                            aria-hidden='true'
                          />
                        </div>
                      )}
                    </div>
                  </AlbumArtworkContextMenu>
                ) : release.artworkUrl ? (
                  <Image
                    src={release.artworkUrl}
                    alt={`${release.title} artwork`}
                    fill
                    priority
                    sizes='(max-width: 767px) 100vw, 430px'
                    className='object-cover object-center'
                  />
                ) : (
                  <div className='flex h-full w-full items-center justify-center bg-surface-2'>
                    <Icon
                      name='Disc3'
                      className='text-muted-foreground h-16 w-16'
                      aria-hidden='true'
                    />
                  </div>
                )}
              </div>

              {/* Top vignette */}
              <div className='pointer-events-none absolute inset-x-0 top-0 h-[36%] bg-[linear-gradient(to_bottom,rgba(0,0,0,0.45)_0%,rgba(0,0,0,0.15)_55%,transparent_100%)]' />
              {/* Bottom gradient */}
              <div className='pointer-events-none absolute inset-x-0 bottom-0 h-[55%] bg-[linear-gradient(to_top,var(--profile-stage-bg,rgba(8,9,10,1))_0%,rgba(5,6,8,0.75)_45%,transparent_100%)]' />

              {/* Top bar */}
              <div className='relative z-10 flex items-center justify-between px-5 pt-[max(env(safe-area-inset-top),20px)]'>
                <BrandLogo
                  size={22}
                  tone='white'
                  rounded={false}
                  className='opacity-45 drop-shadow-[0_1px_4px_rgba(0,0,0,0.4)]'
                />
                <button
                  type='button'
                  onClick={() => setMenuOpen(true)}
                  className='flex h-8 w-8 items-center justify-center rounded-full border-white/[0.08] bg-black/25 text-white/70 backdrop-blur-2xl transition-colors duration-150 hover:bg-black/40'
                  aria-label='More options'
                  aria-haspopup='dialog'
                >
                  <MoreHorizontal className='h-[15px] w-[15px]' />
                </button>
              </div>

              {/* Title + artist over artwork */}
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

                {/* Play button */}
                {shouldShowPreview ? (
                  <div className='mb-1 ml-3 shrink-0'>
                    <SmartLinkAudioPreview
                      contentId={tracking?.contentId ?? release.title}
                      title={release.title}
                      artistName={artist.name}
                      artworkUrl={release.artworkUrl}
                      previewUrl={release.previewUrl ?? null}
                      previewVerification={release.previewVerification}
                      previewSource={release.previewSource}
                    />
                  </div>
                ) : null}
              </div>
            </header>

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
                        href={appendUTMParamsToUrl(provider.url, utmParams)}
                        onClick={() => handleProviderClick(provider.key)}
                        label={logoConfig?.name ?? provider.label}
                        iconPath={logoConfig?.iconPath}
                      />
                    );
                  })}
                </div>

                {clickableProviders.length === 0 && (
                  <div className='rounded-2xl bg-surface-1/40 p-5 text-center ring-1 ring-inset ring-white/[0.08]'>
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
          </div>
        </main>
      </div>

      {/* Menu drawer */}
      <ProfileDrawerShell
        open={menuOpen}
        onOpenChange={setMenuOpen}
        title='Menu'
      >
        <div className='flex flex-col gap-0.5' role='menu'>
          <button
            type='button'
            role='menuitem'
            className={menuItemClass}
            onClick={() => {
              void handleShare();
            }}
          >
            <Share2 className={menuIconClass} />
            Share
          </button>
          {hasCredits ? (
            <button
              type='button'
              role='menuitem'
              className={menuItemClass}
              onClick={() => {
                setMenuOpen(false);
                setCreditsOpen(true);
              }}
            >
              <Users className={menuIconClass} />
              Credits
            </button>
          ) : null}
          {soundsUrl ? (
            <Link
              href={appendUTMParamsToUrl(soundsUrl, utmParams)}
              role='menuitem'
              className={menuItemClass}
              onClick={() => setMenuOpen(false)}
            >
              <Sparkles className={menuIconClass} />
              Use this sound
            </Link>
          ) : null}
        </div>
      </ProfileDrawerShell>

      {/* Credits drawer */}
      <ReleaseCreditsDrawer
        open={creditsOpen}
        onOpenChange={setCreditsOpen}
        credits={credits}
      />
    </div>
  );
}
