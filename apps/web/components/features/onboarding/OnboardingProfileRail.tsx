'use client';

import { SocialIcon } from '@/components/atoms/SocialIcon';
import { PhoneFrame } from '@/components/molecules/PhoneFrame';
import { ProfileCompactSurface } from '@/features/profile/templates/ProfileCompactSurface';
import { cn } from '@/lib/utils';
import type { Artist, LegacySocialLink } from '@/types/db';
import {
  formatCompactCount,
  formatGenreLabel,
  getSafeSpotifyArtistUrl,
  type OnboardingDspMatch,
} from './OnboardingToolArtifacts';

export interface OnboardingProfileArtist {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly imageUrl?: string | null;
  readonly followers?: number | null;
  readonly popularity?: number | null;
  readonly genres?: readonly string[];
  readonly dspMatches?: readonly OnboardingDspMatch[];
}

export interface OnboardingProfileBuilderState {
  readonly artist: OnboardingProfileArtist | null;
  readonly artistConfirmed: boolean;
  readonly handle: string | null;
  readonly socialLinks: readonly string[];
}

export const EMPTY_ONBOARDING_PROFILE_BUILDER_STATE: OnboardingProfileBuilderState =
  {
    artist: null,
    artistConfirmed: false,
    handle: null,
    socialLinks: [],
  };

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
  const followerLabel = formatCompactCount(artist.followers);

  return {
    id: `onboarding-preview-${artist.id}`,
    owner_user_id: 'onboarding-preview',
    handle: handle ?? 'your-handle',
    spotify_id: artist.id,
    name: artist.name,
    image_url: artist.imageUrl ?? undefined,
    tagline: followerLabel
      ? `${followerLabel} Spotify followers`
      : (firstGenre ?? undefined),
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
    published: true,
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
      className='absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-white/15 bg-black/28 px-2 py-1.5 text-white shadow-[0_14px_30px_rgba(0,0,0,0.22)] backdrop-blur-xl'
      data-testid='onboarding-dsp-match-strip'
      aria-label='Matched music services'
    >
      {visible.map(match => (
        <span
          key={match.id}
          className='inline-flex h-7 w-7 items-center justify-center rounded-full bg-white text-black shadow-[0_6px_16px_rgba(0,0,0,0.18)]'
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
        <span className='inline-flex h-7 items-center rounded-full bg-white px-2 text-[11.5px] font-semibold text-black'>
          +{overflow} others
        </span>
      ) : null}
    </fieldset>
  );
}

export function OnboardingProfileRail({
  placement = 'side',
  state,
}: {
  readonly placement?: 'inline' | 'side';
  readonly state: OnboardingProfileBuilderState;
}) {
  const artist = state.artist;
  const isInline = placement === 'inline';

  if (!artist) return null;

  const dspMatches = uniqueDspMatches(artist);
  const previewArtist = buildPreviewArtist(artist, state.handle, dspMatches);
  const previewLinks = buildPreviewLinks({
    artist,
    dspMatches,
    socialLinks: state.socialLinks,
  });
  const profileHref = `/${previewArtist.handle}`;

  return (
    <aside
      className={cn(
        'overflow-hidden bg-(--linear-app-content-surface) text-primary-token transition-[opacity,transform,width,border-color] duration-cinematic ease-out',
        isInline
          ? 'relative z-0 w-full rounded-[22px] lg:hidden'
          : 'z-30 max-lg:hidden lg:relative lg:h-full lg:w-[380px] lg:border-l lg:border-(--linear-app-shell-border)'
      )}
      data-testid={
        isInline ? 'onboarding-profile-rail-inline' : 'onboarding-profile-rail'
      }
      data-visible='true'
      data-placement={placement}
    >
      <div
        className={cn(
          'flex h-full min-h-0 items-center justify-center',
          isInline ? 'px-0 py-2' : 'lg:w-[380px] lg:px-4 lg:py-4'
        )}
      >
        <div
          className={cn(
            'relative flex w-full items-center justify-center overflow-hidden rounded-[28px] bg-[linear-gradient(145deg,#0A2A88_0%,#0B6CFF_52%,#7AC7FF_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.26),0_30px_80px_rgba(0,48,160,0.34)]',
            isInline
              ? 'min-h-[456px] max-w-[342px] p-4'
              : 'h-full min-h-[620px] max-h-[680px] max-w-[348px] p-5'
          )}
          data-testid='onboarding-profile-bento'
        >
          <div className='pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.20)_0%,rgba(255,255,255,0.04)_42%,rgba(0,0,0,0.20)_100%)]' />
          <PhoneFrame
            className={cn(
              'relative z-10',
              isInline
                ? 'h-[420px] w-[200px] sm:h-[480px] sm:w-[228px]'
                : 'h-[592px] w-[282px]'
            )}
          >
            <div
              className='h-full w-full [--cover-height:45%] [--page-pad:18px]'
              data-testid='onboarding-phone-preview'
            >
              <ProfileCompactSurface
                renderMode='preview'
                presentation='embedded'
                artist={previewArtist}
                socialLinks={previewLinks}
                contacts={[]}
                showPayButton={false}
                genres={previewArtist.genres}
                drawerOpen={false}
                drawerView='menu'
                activeMode='profile'
                onDrawerOpenChange={() => {}}
                onDrawerViewChange={() => {}}
                onBack={() => {}}
                onOpenMenu={() => {}}
                onPlayClick={() => {}}
                onShare={() => {}}
                onModeSelect={() => {}}
                profileHref={profileHref}
                dataTestId='onboarding-profile-compact-surface'
                isSubscribed
                hideBackButton
                hideJovieBranding
                hideMoreMenu
                renderInteractiveOverlays={false}
                renderSemanticHeading={false}
                headerSocialLinksOverride={[]}
                resolveNearbyTour={false}
              />
            </div>
          </PhoneFrame>
          <DspMatchStrip matches={dspMatches} />
        </div>
      </div>
    </aside>
  );
}
