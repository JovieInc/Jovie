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
  apple_music: {
    name: 'Apple Music',
    color: '#FA243C',
    textColor: 'white',
    logoSvg: `<svg role="img" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><title>Apple Music</title><path d="M23.997 6.124c0-.738-.065-1.47-.24-2.19-.317-1.31-1.062-2.31-2.18-3.043C21.003.517 20.373.285 19.7.164c-.517-.093-1.038-.135-1.564-.15-.04-.002-.083-.01-.124-.013H5.988c-.152.01-.303.017-.455.034C4.786.07 4.043.15 3.34.428 2.004.958 1.04 1.88.475 3.208c-.192.448-.292.925-.363 1.408-.056.392-.088.785-.097 1.18V17.22c.009.394.041.787.097 1.179.071.483.171.96.363 1.408.565 1.328 1.529 2.25 2.865 2.78.703.278 1.446.358 2.193.393.152.017.303.024.455.034h11.124c.041-.003.084-.011.124-.013.526-.015 1.047-.057 1.564-.15.673-.121 1.303-.353 1.877-.717 1.118-.733 1.863-1.733 2.18-3.043.175-.72.24-1.452.24-2.19V6.124zM9.455 15.054c-.474 0-.901-.142-1.278-.417a2.505 2.505 0 0 1-.835-1.166 2.654 2.654 0 0 1-.093-1.421c.14-.49.417-.912.83-1.267.413-.355.906-.532 1.48-.532.573 0 1.067.177 1.48.532.413.355.69.777.83 1.267.14.49.098.98-.093 1.421a2.505 2.505 0 0 1-.835 1.166c-.377.275-.804.417-1.278.417zm9.12-.139c0 .312-.102.578-.307.798-.205.22-.456.33-.752.33-.297 0-.547-.11-.752-.33-.205-.22-.307-.486-.307-.798V9.903c0-.312.102-.578.307-.798.205-.22.455-.33.752-.33.296 0 .547.11.752.33.205.22.307.486.307.798v5.012z"/></svg>`,
  },
  youtube: {
    name: 'YouTube',
    color: '#FF0000',
    textColor: 'white',
    logoSvg: `<svg role="img" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><title>YouTube</title><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
  },
};

export interface AvailableDSP {
  key: string;
  name: string;
  url: string;
  config: DSPConfig;
}

export function getAvailableDSPs(
  artist: Artist,
  releases?: Release[]
): AvailableDSP[] {
  const dsps: AvailableDSP[] = [];

  // Check Spotify
  const spotifyUrl =
    artist.spotify_url ||
    (artist.spotify_id ? buildSpotifyArtistUrl(artist.spotify_id) : null);
  if (spotifyUrl) {
    dsps.push({
      key: 'spotify',
      name: 'Spotify',
      url: spotifyUrl,
      config: DSP_CONFIGS.spotify,
    });
  }

  // Check Apple Music
  if (artist.apple_music_url) {
    dsps.push({
      key: 'apple_music',
      name: 'Apple Music',
      url: artist.apple_music_url,
      config: DSP_CONFIGS.apple_music,
    });
  }

  // Check YouTube
  if (artist.youtube_url) {
    dsps.push({
      key: 'youtube',
      name: 'YouTube',
      url: artist.youtube_url,
      config: DSP_CONFIGS.youtube,
    });
  }

  // Check for release-specific URLs if releases are provided
  if (releases) {
    const spotifyRelease = releases.find(r => r.dsp === 'spotify');
    const appleRelease = releases.find(r => r.dsp === 'apple_music');
    const youtubeRelease = releases.find(r => r.dsp === 'youtube');

    // Override with release URLs if available
    if (spotifyRelease && !dsps.find(d => d.key === 'spotify')) {
      dsps.push({
        key: 'spotify',
        name: 'Spotify',
        url: spotifyRelease.url,
        config: DSP_CONFIGS.spotify,
      });
    }
    if (appleRelease && !dsps.find(d => d.key === 'apple_music')) {
      dsps.push({
        key: 'apple_music',
        name: 'Apple Music',
        url: appleRelease.url,
        config: DSP_CONFIGS.apple_music,
      });
    }
    if (youtubeRelease && !dsps.find(d => d.key === 'youtube')) {
      dsps.push({
        key: 'youtube',
        name: 'YouTube',
        url: youtubeRelease.url,
        config: DSP_CONFIGS.youtube,
      });
    }
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
