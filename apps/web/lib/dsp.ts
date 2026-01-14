import { Artist, Release } from '@/types/db';

export interface DSPConfig {
  name: string;
  color: string;
  textColor: string;
  logoSvg: string;
}

function buildSpotifyArtistUrl(artistId: string): string {
  return `https://open.spotify.com/artist/${artistId}`;
}

export const DSP_CONFIGS: Record<string, DSPConfig> = {
  spotify: {
    name: 'Spotify',
    color: '#1DB954',
    textColor: 'white',
    logoSvg: `<svg role="img" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><title>Spotify</title><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.48.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.32 11.28-1.08 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>`,
  },
  soundcloud: {
    name: 'SoundCloud',
    color: '#FF5500',
    textColor: 'white',
    logoSvg: `<svg role="img" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><title>SoundCloud</title><path d="M17.7 9.024a3.31 3.31 0 0 0-.515.043 5.59 5.59 0 0 0-5.47-4.498 5.52 5.52 0 0 0-3.27 1.056 4.74 4.74 0 0 0-1.868 3.373c-.037.321-.034.642.009.962a3.69 3.69 0 0 0-1.323-.24 3.65 3.65 0 1 0 0 7.3h12.437a2.69 2.69 0 0 0 0-5.381Z"/></svg>`,
  },
  apple_music: {
    name: 'Apple Music',
    color: '#FA243C',
    textColor: 'white',
    logoSvg: `<svg role="img" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><title>Apple Music</title><path d="M23.994 6.124a9.23 9.23 0 00-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043a5.022 5.022 0 00-1.877-.84 7.088 7.088 0 00-1.564-.15c-.04-.003-.083-.01-.124-.013H5.986c-.152.01-.303.017-.455.026-.747.043-1.49.123-2.193.401-1.336.53-2.3 1.452-2.865 2.78-.192.448-.292.925-.363 1.408-.056.392-.088.785-.1 1.18v11.498c.012.395.044.788.1 1.18.07.483.17.96.362 1.408.566 1.328 1.53 2.25 2.865 2.78.703.278 1.446.358 2.193.401.152.009.303.016.455.026h12.023c.04-.003.083-.01.124-.013a7.088 7.088 0 001.564-.15 5.022 5.022 0 001.877-.84c1.118-.733 1.863-1.732 2.18-3.043.176-.72.24-1.451.24-2.19V6.124zm-6.282 5.117v4.667c0 .378-.05.748-.2 1.1-.249.578-.682.96-1.296 1.127-.191.052-.39.08-.59.09-.63.03-1.18-.14-1.63-.57-.45-.43-.65-.97-.6-1.59.07-.86.57-1.47 1.37-1.79.32-.13.66-.2 1-.24.38-.04.76-.08 1.14-.15.18-.03.32-.12.38-.31.02-.06.03-.13.03-.2V9.39c0-.13-.05-.22-.18-.26-.07-.02-.15-.03-.22-.04l-4.12-.82c-.17-.03-.28.02-.33.2-.01.05-.02.1-.02.16v6.96c0 .41-.05.81-.22 1.19-.26.59-.7.98-1.33 1.14-.19.05-.39.08-.59.09-.63.03-1.18-.14-1.63-.57-.45-.43-.65-.97-.6-1.59.07-.86.57-1.47 1.37-1.79.32-.13.66-.2 1-.24.38-.04.76-.08 1.14-.15.21-.04.35-.15.39-.37.01-.05.01-.1.01-.15V6.56c0-.2.06-.35.24-.42.05-.02.1-.03.16-.04l5.69-1.13c.2-.04.39-.08.59-.09.27-.02.47.12.52.39.01.06.02.13.02.19v5.78z"/></svg>`,
  },
  youtube: {
    name: 'YouTube',
    color: '#FF0000',
    textColor: 'white',
    logoSvg: `<svg role="img" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><title>YouTube</title><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
  },
  soundcloud_release: {
    name: 'SoundCloud',
    color: '#FF5500',
    textColor: 'white',
    logoSvg: `<svg role="img" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><title>SoundCloud</title><path d="M17.7 9.024a3.31 3.31 0 0 0-.515.043 5.59 5.59 0 0 0-5.47-4.498 5.52 5.52 0 0 0-3.27 1.056 4.74 4.74 0 0 0-1.868 3.373c-.037.321-.034.642.009.962a3.69 3.69 0 0 0-1.323-.24 3.65 3.65 0 1 0 0 7.3h12.437a2.69 2.69 0 0 0 0-5.381Z"/></svg>`,
  },
};

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
  if (!url || dsps.find(d => d.key === key)) {
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

export function getAvailableDSPs(
  artist: Artist,
  releases?: Release[]
): AvailableDSP[] {
  const dsps: AvailableDSP[] = [];

  // Check artist URLs
  const spotifyUrl =
    artist.spotify_url ||
    (artist.spotify_id ? buildSpotifyArtistUrl(artist.spotify_id) : null);
  addDSP(dsps, 'spotify', spotifyUrl);
  addDSP(dsps, 'apple_music', artist.apple_music_url);
  addDSP(dsps, 'youtube', artist.youtube_url);
  addDSP(
    dsps,
    'soundcloud',
    (artist as Artist & { soundcloud_url?: string }).soundcloud_url
  );

  // Check for release-specific URLs if releases are provided
  if (releases) {
    const spotifyRelease = releases.find(r => r.dsp === 'spotify');
    const appleRelease = releases.find(r => r.dsp === 'apple_music');
    const youtubeRelease = releases.find(r => r.dsp === 'youtube');

    addDSP(dsps, 'spotify', spotifyRelease?.url);
    addDSP(dsps, 'apple_music', appleRelease?.url);
    addDSP(dsps, 'youtube', youtubeRelease?.url);
  }

  return dsps;
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
