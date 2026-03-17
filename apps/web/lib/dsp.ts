import { geoAwarePopularityIndex } from '@/constants/app';
import { DSP_CONFIGS, type DSPConfig } from '@/lib/dsp-registry';
import { Artist, Release } from '@/types/db';

export type { DSPConfig } from '@/lib/dsp-registry';
export { DSP_CONFIGS } from '@/lib/dsp-registry';

export type DevicePlatform = 'ios' | 'android' | 'desktop';

function buildSpotifyArtistUrl(artistId: string): string {
  return `https://open.spotify.com/artist/${artistId}`;
}

export interface AvailableDSP {
  key: string;
  name: string;
  url: string;
  config: DSPConfig;
}

/**
 * Helper to add a DSP to the list if URL is available and not already present.
 * Eliminates duplication in DSP object construction.
 */
function addDSP(
  dsps: AvailableDSP[],
  key: string,
  url: string | null | undefined
): void {
  if (!url || dsps.some(d => d.key === key)) {
    return;
  }

  const config = DSP_CONFIGS[key];
  if (!config) {
    return;
  }

  dsps.push({
    key,
    name: config.name,
    url,
    config,
  });
}

export function sortDSPsByGeoPopularity(
  dsps: AvailableDSP[],
  countryCode?: string | null
): AvailableDSP[] {
  return dsps.sort((a, b) => {
    const rankDelta =
      geoAwarePopularityIndex(a.key, countryCode) -
      geoAwarePopularityIndex(b.key, countryCode);

    if (rankDelta !== 0) return rankDelta;
    return a.name.localeCompare(b.name);
  });
}

const IOS_APPLE_MUSIC_PRIORITY_WEIGHT = -2;

function getDevicePriorityWeight(
  dspKey: string,
  platform: DevicePlatform
): number {
  if (platform === 'ios' && dspKey === 'apple_music') {
    return IOS_APPLE_MUSIC_PRIORITY_WEIGHT;
  }

  return 0;
}

interface SortDSPsForDeviceOptions {
  countryCode?: string | null;
  platform?: DevicePlatform;
  enableDevicePriority?: boolean;
}

/**
 * Sort DSPs by geo popularity with optional device-aware weighting.
 *
 * Device weighting is intentionally small so geo ordering remains the primary
 * signal while letting us gently favor native-first UX on iOS.
 */
export function sortDSPsForDevice(
  dsps: AvailableDSP[],
  options: SortDSPsForDeviceOptions = {}
): AvailableDSP[] {
  const {
    countryCode,
    platform = 'desktop',
    enableDevicePriority = false,
  } = options;

  return dsps.sort((a, b) => {
    const baseRankDelta =
      geoAwarePopularityIndex(a.key, countryCode) -
      geoAwarePopularityIndex(b.key, countryCode);

    // Geo popularity is always the primary signal
    if (baseRankDelta !== 0) {
      return baseRankDelta;
    }

    // Device weighting is a secondary tiebreaker when geo ranks are equal
    if (enableDevicePriority) {
      const devicePriorityDelta =
        getDevicePriorityWeight(a.key, platform) -
        getDevicePriorityWeight(b.key, platform);

      if (devicePriorityDelta !== 0) {
        return devicePriorityDelta;
      }
    }

    return a.name.localeCompare(b.name);
  });
}

// ============================================================================
// DSP URL Builders (construct artist page URLs from platform IDs)
// ============================================================================

function buildDeezerArtistUrl(artistId: string): string {
  return `https://www.deezer.com/artist/${artistId}`;
}

function buildTidalArtistUrl(artistId: string): string {
  return `https://tidal.com/browse/artist/${artistId}`;
}

function buildSoundcloudArtistUrl(slug: string): string {
  return `https://soundcloud.com/${slug}`;
}

function buildYoutubeMusicChannelUrl(channelId: string): string {
  return `https://music.youtube.com/channel/${channelId}`;
}

export function getAvailableDSPs(
  artist: Artist,
  releases?: Release[],
  countryCode?: string | null
): AvailableDSP[] {
  const dsps: AvailableDSP[] = [];

  // Check artist URLs (explicit URLs take priority)
  const spotifyUrl =
    artist.spotify_url ||
    (artist.spotify_id ? buildSpotifyArtistUrl(artist.spotify_id) : null);
  addDSP(dsps, 'spotify', spotifyUrl);
  addDSP(dsps, 'apple_music', artist.apple_music_url);
  addDSP(dsps, 'youtube', artist.youtube_url);

  // Build URLs from DSP IDs when explicit URLs are not available
  addDSP(
    dsps,
    'soundcloud',
    (artist as Artist & { soundcloud_url?: string }).soundcloud_url ||
      (artist.soundcloud_id
        ? buildSoundcloudArtistUrl(artist.soundcloud_id)
        : null)
  );
  addDSP(
    dsps,
    'deezer',
    artist.deezer_id ? buildDeezerArtistUrl(artist.deezer_id) : null
  );
  addDSP(
    dsps,
    'tidal',
    artist.tidal_id ? buildTidalArtistUrl(artist.tidal_id) : null
  );
  addDSP(
    dsps,
    'youtube_music',
    artist.youtube_music_id
      ? buildYoutubeMusicChannelUrl(artist.youtube_music_id)
      : null
  );

  // Check for release-specific URLs if releases are provided
  if (releases) {
    for (const release of releases) {
      addDSP(dsps, release.dsp, release.url);
    }
  }

  return sortDSPsByGeoPopularity(dsps, countryCode);
}

export function generateDSPButtonHTML(dsp: AvailableDSP): string {
  return `
    <button
      data-dsp="${dsp.key}"
      data-url="${dsp.url}"
      aria-label="Open in ${dsp.name} app if installed, otherwise opens in web browser"
      style="
        background-color: ${dsp.config.color};
        color: ${dsp.config.textColor};
        border: none;
        border-radius: 8px;
        padding: 12px 24px;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        width: 100%;
        max-width: 320px;
        transition: all 0.2s ease;
        text-decoration: none;
        margin-bottom: 12px;
      "
      onmouseover="this.style.opacity='0.9'; this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.15)'"
      onmouseout="this.style.opacity='1'; this.style.transform='translateY(0)'; this.style.boxShadow='0 1px 3px rgba(0,0,0,0.1)'"
      onmousedown="this.style.transform='translateY(-1px)'"
      onmouseup="this.style.transform='translateY(-2px)'"
    >
      <span style="display: flex; align-items: center;">
        ${dsp.config.logoSvg}
      </span>
      Open in ${dsp.name}
    </button>
  `;
}
