/**
 * Social Network Deep Link Configurations
 */

import {
  extractFacebookUsername,
  extractInstagramUsername,
  extractTikTokUsername,
  extractTwitterUsername,
  extractYouTubeChannelId,
  extractYouTubeUsername,
} from '../extractors';
import type { DeepLinkConfig } from '../types';

export const SOCIAL_DEEP_LINKS: Record<string, DeepLinkConfig> = {
  instagram: {
    name: 'Instagram',
    iosScheme: 'instagram://user?username={username}',
    androidScheme:
      'intent://instagram.com/_u/{username}#Intent;package=com.instagram.android;scheme=https;end',
    universalLink: 'https://instagram.com/{username}',
    webFallback: 'https://instagram.com/{username}',
    extractUsername: extractInstagramUsername,
  },
  tiktok: {
    name: 'TikTok',
    iosScheme: 'tiktok://user?username={username}',
    androidScheme:
      'intent://www.tiktok.com/@{username}#Intent;package=com.zhiliaoapp.musically;scheme=https;end',
    universalLink: 'https://www.tiktok.com/@{username}',
    webFallback: 'https://www.tiktok.com/@{username}',
    extractUsername: extractTikTokUsername,
  },
  twitter: {
    name: 'Twitter',
    iosScheme: 'twitter://user?screen_name={username}',
    androidScheme:
      'intent://twitter.com/{username}#Intent;package=com.twitter.android;scheme=https;end',
    universalLink: 'https://twitter.com/{username}',
    webFallback: 'https://twitter.com/{username}',
    extractUsername: extractTwitterUsername,
  },
  youtube: {
    name: 'YouTube',
    iosScheme: 'youtube://channel/{channelId}',
    androidScheme:
      'intent://www.youtube.com/@{username}#Intent;package=com.google.android.youtube;scheme=https;end',
    universalLink: 'https://www.youtube.com/@{username}',
    webFallback: 'https://www.youtube.com/@{username}',
    extractUsername: extractYouTubeUsername,
    extractId: extractYouTubeChannelId,
  },
  facebook: {
    name: 'Facebook',
    iosScheme: 'fb://profile/{userId}',
    androidScheme:
      'intent://www.facebook.com/{username}#Intent;package=com.facebook.katana;scheme=https;end',
    universalLink: 'https://www.facebook.com/{username}',
    webFallback: 'https://www.facebook.com/{username}',
    extractUsername: extractFacebookUsername,
  },
};
