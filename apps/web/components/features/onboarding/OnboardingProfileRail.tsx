'use client';

import { Button } from '@jovie/ui';
import { useEffect, useRef } from 'react';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { ProfileIdentityHeader } from '@/features/profile/ProfileIdentityHeader';
import { ProfilePreviewBento } from '@/features/profile/ProfilePreviewBento';
import { getDisplaySpotifyFollowers } from '@/lib/onboarding/canonical-metrics';
import { toPreviewPublicReleases } from '@/lib/onboarding/catalog-preview';
import { cn } from '@/lib/utils';
import type { Artist, LegacySocialLink } from '@/types/db';
import {
  formatCompactCount,
  formatGenreLabel,
  getSafeSpotifyArtistUrl,
  type OnboardingDspMatch,
} from './OnboardingToolArtifacts';
import {
  type OnboardingProfileArtist,
  type OnboardingProfileBuilderState,
  resolvePreviewArtist,
} from './onboardingProfileRailState';

export {
  EMPTY_ONBOARDING_PROFILE_BUILDER_STATE,
  type OnboardingProfileArtist,
  type OnboardingProfileBuilderState,
  resolvePreviewArtist,
} from './onboardingProfileRailState';

function readSafeHttpsUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

const PLATFORM_HOST_ALLOWLIST: Record<string, readonly string[]> = {
  apple_music: ['music.apple.com'],
  deezer: ['deezer.com'],
  instagram: ['instagram.com'],
  soundcloud: ['soundcloud.com'],
  spotify: ['open.spotify.com', 'spotify.com'],
  tidal: ['tidal.com'],
  tiktok: ['tiktok.com'],
  youtube: ['youtube.com', 'youtu.be'],
  youtube_music: ['music.youtube.com'],
};

function isAllowedHostname(
  hostname: string,
  allowedHostnames: readonly string[]
): boolean {
  const normalizedHostname = hostname.replace(/^www\./, '').toLowerCase();
  return allowedHostnames.some(allowed => {
    const normalizedAllowed = allowed.toLowerCase();
    return (
      normalizedHostname === normalizedAllowed ||
      normalizedHostname.endsWith(`.${normalizedAllowed}`)
    );
  });
}

function readSafePlatformUrl(
  url: string | null | undefined,
  platform?: string
): string | null {
  const safeUrl = readSafeHttpsUrl(url);
  if (!safeUrl) return null;

  const platformKey = platform ? platformToProfileKey(platform) : null;
  const allowedHostnames = platformKey
    ? PLATFORM_HOST_ALLOWLIST[platformKey]
    : undefined;
  if (!allowedHostnames) return safeUrl;

  const hostname = new URL(safeUrl).hostname;
  return isAllowedHostname(hostname, allowedHostnames) ? safeUrl : null;
}

function platformToProfileKey(platform: string): string {
  const normalized = platform.toLowerCase().replaceAll(/[^a-z0-9]/g, '');

  if (normalized.includes('applemusic') || normalized === 'itunes') {
    return 'apple_music';
  }
  if (normalized.includes('youtubemusic')) return 'youtube_music';
  if (normalized.includes('youtube')) return 'youtube';
  if (normalized.includes('soundcloud')) return 'soundcloud';
  if (normalized.includes('deezer')) return 'deezer';
  if (normalized.includes('tidal')) return 'tidal';
  if (normalized.includes('spotify')) return 'spotify';

  return normalized || platform;
}

function inferPlatformFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    if (host.includes('instagram')) return 'instagram';
    if (host.includes('tiktok')) return 'tiktok';
    if (host.includes('youtube')) return 'youtube';
    if (host.includes('soundcloud')) return 'soundcloud';
    if (host.includes('spotify')) return 'spotify';
    if (host.includes('music.apple')) return 'apple_music';
  } catch {
    return 'website';
  }

  return 'website';
}

function uniqueDspMatches(
  artist: OnboardingProfileArtist
): readonly OnboardingDspMatch[] {
  const safeSpotifyUrl = getSafeSpotifyArtistUrl(artist.url);
  const base: OnboardingDspMatch[] = safeSpotifyUrl
    ? [
        {
          id: 'spotify',
          label: 'Spotify',
          platform: 'spotify',
          url: safeSpotifyUrl,
        },
      ]
    : [];
  const seen = new Set(base.map(match => match.id));
  const extras = (artist.dspMatches ?? []).filter(match => {
    if (!match.id || seen.has(match.id)) return false;
    if (!readSafePlatformUrl(match.url ?? null, match.platform)) return false;
    seen.add(match.id);
    return true;
  });

  return [...base, ...extras];
}

function buildPreviewArtist(
  artist: OnboardingProfileArtist,
  handle: string | null,
  dspMatches: readonly OnboardingDspMatch[]
): Artist {
  const spotifyUrl = getSafeSpotifyArtistUrl(artist.url) ?? undefined;
  const dspUrls = new Map<string, string>();

  for (const match of dspMatches) {
    const safeUrl = readSafePlatformUrl(match.url ?? null, match.platform);
    if (!safeUrl) continue;
    dspUrls.set(platformToProfileKey(match.platform), safeUrl);
  }

  const firstGenre = artist.genres?.[0]
    ? formatGenreLabel(artist.genres[0])
    : null;
  // Single source: metrics.spotifyFollowers when present, else followers mirror.
  const followerCount =
    getDisplaySpotifyFollowers(artist.metrics) ?? artist.followers ?? null;
  const followerLabel = formatCompactCount(followerCount);

  return {
    id: `onboarding-preview-${artist.id}`,
    // Preview-only — not a real owner. Manage / claim chrome must stay off.
    owner_user_id: 'onboarding-preview',
    handle: handle ?? 'your-handle',
    spotify_id: spotifyUrl ? artist.id : '',
    name: artist.name,
    image_url: artist.imageUrl ?? undefined,
    tagline:
      artist.tagline ??
      (followerLabel
        ? `${followerLabel} Spotify followers`
        : (firstGenre ?? undefined)),
    theme: undefined,
    settings: undefined,
    spotify_url: spotifyUrl,
    apple_music_url: dspUrls.get('apple_music'),
    youtube_url: dspUrls.get('youtube'),
    apple_music_id: undefined,
    youtube_music_id: undefined,
    deezer_id: undefined,
    tidal_id: undefined,
    soundcloud_id: undefined,
    venmo_handle: undefined,
    location: null,
    hometown: null,
    active_since_year: null,
    genres: artist.genres ? [...artist.genres] : null,
    career_highlights: null,
    target_playlists: null,
    // Not claimed/verified — keep published false so preview never reads as live.
    published: false,
    is_verified: false,
    is_featured: false,
    marketing_opt_out: false,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

function buildPreviewLinks({
  artist,
  dspMatches,
  socialLinks,
}: {
  readonly artist: OnboardingProfileArtist;
  readonly dspMatches: readonly OnboardingDspMatch[];
  readonly socialLinks: readonly string[];
}): LegacySocialLink[] {
  const links: LegacySocialLink[] = [];
  const seen = new Set<string>();

  const addLink = (platform: string, url: string | null | undefined) => {
    const safeUrl = readSafePlatformUrl(url, platform);
    if (!safeUrl || seen.has(safeUrl)) return;
    seen.add(safeUrl);
    links.push({
      id: `onboarding-link-${links.length + 1}`,
      artist_id: artist.id,
      platform,
      url: safeUrl,
      clicks: 0,
      created_at: '2026-01-01T00:00:00.000Z',
      is_visible: true,
    });
  };

  for (const match of dspMatches) {
    addLink(platformToProfileKey(match.platform), match.url ?? null);
  }

  for (const url of socialLinks) {
    addLink(inferPlatformFromUrl(url), url);
  }

  return links;
}

function DspMatchStrip({
  matches,
}: {
  readonly matches: readonly OnboardingDspMatch[];
}) {
  if (matches.length === 0) return null;

  const visible = matches.slice(0, 4);
  const overflow = Math.max(0, matches.length - visible.length);

  return (
    <fieldset
      className='flex items-center gap-1.5 rounded-full border border-on-media/15 bg-ink-on-media/28 px-2 py-1.5 text-on-media shadow-[0_14px_30px_rgba(0,0,0,0.22)] backdrop-blur-xl dark:text-on-media'
      data-testid='onboarding-dsp-match-strip'
      aria-label='Matched Music Services'
    >
      {visible.map(match => (
        <span
          key={match.id}
          className='inline-flex h-7 w-7 items-center justify-center rounded-full bg-on-media text-ink-on-media shadow-[0_6px_16px_rgba(0,0,0,0.18)] dark:bg-on-media dark:text-ink-on-media'
          title={match.label}
        >
          <SocialIcon
            platform={match.platform}
            className='h-3.5 w-3.5'
            aria-hidden
          />
          <span className='sr-only'>{match.label}</span>
        </span>
      ))}
      {overflow > 0 ? (
        <span className='inline-flex h-7 items-center rounded-full bg-on-media px-2 text-2xs font-semibold text-ink-on-media dark:bg-on-media dark:text-ink-on-media'>
          +{overflow} others
        </span>
      ) : null}
    </fieldset>
  );
}

/**
 * Pen R6As7U `SDt0M`: names the panel so the phone reads as the visitor's own
 * draft. No all-caps eyebrow: banned UI text (ASR-022, no-uppercase-ratchet).
 */
function OnboardingDraftProfileHeader() {
  return (
    <header
      className='system-b-onboarding-draft-header'
      data-testid='onboarding-draft-profile-header'
    >
      <h2 className='system-b-onboarding-draft-title text-balance'>
        Your Draft Profile
      </h2>
      <p className='system-b-onboarding-draft-lead'>
        A first version from your link. Shape it as we talk.
      </p>
    </header>
  );
}

export function OnboardingProfileRail({
  placement = 'side',
  state,
}: {
  readonly placement?: 'inline' | 'side';
  readonly state: OnboardingProfileBuilderState;
}) {
  const artist = resolvePreviewArtist(state);
  const isInline = placement === 'inline';
  const railRef = useRef<HTMLElement>(null);

  // JOV-8844 keyboard reachability, component-owned (JOV-7973): the side rail
  // is a focusable scroll region, so Home/End must scroll it themselves rather
  // than relying on the browser's default keyboard scrolling, which the live
  // chat's focus/keyboard layers can shadow mid-journey — the golden-path
  // reachability check intermittently found the rail still resting at its
  // bottom edge after Home, clipping the preview badge at the scrollport top.
  // Attached imperatively: this is scroll-region behavior, not element
  // interactivity, so it stays out of the JSX a11y handler surface.
  const hasArtist = artist !== null;
  useEffect(() => {
    const rail = railRef.current;
    if (isInline || !rail) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Home' && event.key !== 'End') return;
      event.preventDefault();
      rail.scrollTo({
        top: event.key === 'Home' ? 0 : rail.scrollHeight - rail.clientHeight,
        behavior: 'auto',
      });
    };
    rail.addEventListener('keydown', onKeyDown);
    return () => rail.removeEventListener('keydown', onKeyDown);
  }, [isInline, hasArtist]);

  if (!artist) return null;

  const dspMatches = uniqueDspMatches(artist);
  const previewArtist = buildPreviewArtist(artist, state.handle, dspMatches);
  const previewLinks = buildPreviewLinks({
    artist,
    dspMatches,
    socialLinks:
      state.profileDraft?.activeRole !== 'artist' &&
      state.profileDraft?.selectedSource
        ? [state.profileDraft.selectedSource.url]
        : state.socialLinks,
  });
  const profileHref = `/${previewArtist.handle}`;
  const previewReleases = toPreviewPublicReleases(artist.catalog, artist.name);
  const draft = state.profileDraft;
  const source = draft?.selectedSource;
  const sourceLabels = {
    artist: 'View music',
    author: 'View writing',
    creator: 'View channel or work',
    expert: 'View services or credentials',
    founder: 'View company or product',
  };

  return (
    <aside
      ref={railRef}
      aria-label='Profile Preview'
      tabIndex={isInline ? undefined : 0}
      className={cn(
        'overflow-x-hidden bg-(--app-shell-content-surface) text-primary-token transition-[opacity,transform,width,border-color] duration-cinematic ease-out',
        isInline
          ? 'relative z-0 w-full overflow-y-hidden rounded-3xl lg:hidden'
          : 'z-30 overflow-y-auto overscroll-contain max-lg:hidden lg:relative lg:h-full lg:w-95 lg:border-l lg:border-(--app-shell-border)'
      )}
      data-testid={
        isInline ? 'onboarding-profile-rail-inline' : 'onboarding-profile-rail'
      }
      data-visible='true'
      data-placement={placement}
      data-onboarding-stage={state.profileDraft?.awaiting}
      data-catalog-releases={previewReleases.length}
    >
      <div
        className={cn(
          'flex min-h-0 items-center justify-center',
          // JOV-12045: the side rail hands the rail's height down as a
          // definite chain (h-full) so the preview bento can flex to it and
          // its phone preview can fit the scrollport at rest instead of
          // running past the fold.
          isInline
            ? 'h-full px-0 py-2'
            : 'h-full min-h-full lg:w-95 lg:px-4 lg:pb-4'
        )}
      >
        <div className='flex h-full min-h-0 w-full flex-col items-center'>
          {isInline ? null : <OnboardingDraftProfileHeader />}
          <ProfilePreviewBento
            phoneContent={
              draft?.activeRole && draft.activeRole !== 'artist' && source ? (
                <div
                  className='h-full overflow-y-auto bg-surface-1 px-4 pb-6 pt-19'
                  data-testid='onboarding-source-preview'
                >
                  <ProfileIdentityHeader
                    name={previewArtist.name}
                    handle={previewArtist.handle}
                    imageUrl={null}
                    profileHref={source.url}
                    listenHref={source.url}
                    hasListenDestination={false}
                    headingAs='p'
                  />
                  <p className='my-4 line-clamp-4 text-app text-secondary-token'>
                    {draft.outcome ?? 'Profile draft'}
                  </p>
                  <Button asChild variant='secondary'>
                    <a
                      href={source.url}
                      target='_blank'
                      rel='noopener noreferrer'
                    >
                      {sourceLabels[draft.activeRole]}
                    </a>
                  </Button>
                </div>
              ) : undefined
            }
            artist={previewArtist}
            releases={previewReleases}
            socialLinks={previewLinks}
            genres={previewArtist.genres}
            profileHref={profileHref}
            // Onboarding previews the cold-visitor experience, never owner controls.
            isSubscribed={false}
            // Never show Live — ownership is unverified during onboarding.
            showLiveBadge={false}
            directDspImages
            dataTestId='onboarding-profile-bento'
            phonePreviewTestId='onboarding-phone-preview'
            surfaceTestId='onboarding-profile-compact-surface'
            className={cn(
              'w-full',
              // Side placement fills the rail's height around the draft
              // header and tagline (JOV-12045) so the phone preview inside
              // can size to the remaining hero box.
              isInline ? 'max-w-86' : 'min-h-0 flex-1 max-w-87'
            )}
            heroClassName={cn(
              'w-full rounded-3xl',
              isInline
                ? 'min-h-114 p-4'
                : 'system-b-onboarding-rail-hero min-h-0 max-h-170 px-5'
            )}
            // Width only: the screen keeps its 402:874 aspect, so a fixed frame
            // height let it overflow the frame (JOV-7192). JOV-12045: the side
            // width comes from .system-b-onboarding-rail-phone so the whole
            // preview fits the rail at short viewports.
            phoneFrameClassName={
              isInline
                ? 'w-50 sm:w-57'
                : 'w-auto system-b-onboarding-rail-phone'
            }
            topRight={
              <span
                className='inline-flex h-6 items-center rounded-full border border-on-media/12 bg-ink-on-media/60 px-2.5 text-2xs font-medium text-on-media backdrop-blur-md dark:text-on-media'
                data-testid='onboarding-profile-preview-badge'
              >
                Preview
              </span>
            }
            // One caption for every path: internal draft state ("Draft · artist ·
            // Review") is not visitor-facing (2026-10-31 golden-path walk).
            caption='Preview · not claimed yet'
            overlay={<DspMatchStrip matches={dspMatches} />}
          />
          {previewArtist.tagline ? (
            <p className='px-4 pt-2 text-center text-xs text-secondary-token'>
              {previewArtist.tagline}
            </p>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
