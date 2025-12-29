/**
 * Music Streaming Platform (DSP) Deep Link Configurations
 */

import {
  extractAppleMusicArtistId,
  extractSpotifyArtistId,
  extractYouTubeChannelId,
  extractYouTubeUsername,
} from '../extractors';
import type { DeepLinkConfig } from '../types';

export const DSP_DEEP_LINKS: Record<string, DeepLinkConfig> = {
  spotify: {
    name: 'Spotify',
    iosScheme: 'spotify://artist/{artistId}',
    androidScheme:
      'intent://open.spotify.com/artist/{artistId}#Intent;package=com.spotify.music;scheme=https;end',
    universalLink: 'https://open.spotify.com/artist/{artistId}',
    webFallback: 'https://open.spotify.com/artist/{artistId}',
    extractId: extractSpotifyArtistId,
  },
  apple_music: {
    name: 'Apple Music',
    iosScheme: 'music://artist/{artistId}',
    androidScheme:
      'intent://music.apple.com/artist/{artistId}#Intent;package=com.apple.android.music;scheme=https;end',
    universalLink: 'https://music.apple.com/artist/{artistId}',
    webFallback: 'https://music.apple.com/artist/{artistId}',
    extractId: extractAppleMusicArtistId,
  },
  youtube: {
    name: 'YouTube Music',
    iosScheme: 'youtubemusic://browse/channel/{channelId}',
    androidScheme:
      'intent://music.youtube.com/channel/{channelId}#Intent;package=com.google.android.apps.youtube.music;scheme=https;end',
    universalLink: 'https://music.youtube.com/channel/{channelId}',
    webFallback: 'https://www.youtube.com/@{username}',
    extractUsername: extractYouTubeUsername,
    extractId: extractYouTubeChannelId,
  },
};
