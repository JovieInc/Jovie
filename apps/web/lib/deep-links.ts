/**
 * Deep Link Utility for Social Networks and Music Streaming Platforms
 *
 * Provides native app deep linking with graceful fallbacks to web versions.
 * Supports iOS and Android URL schemes plus universal links.
 */

import * as Sentry from '@sentry/nextjs';
import { detectPlatformFromUA } from './utils';

export interface DeepLinkConfig {
  /** Display name of the platform */
  name: string;
  /** iOS URL scheme pattern */
  iosScheme?: string;
  /** Android URL scheme pattern */
  androidScheme?: string;
  /** Universal link pattern (iOS) */
  universalLink?: string;
  /** Web fallback URL pattern */
  webFallback: string;
  /** Function to extract identifier from web URL */
  extractId?: (url: string) => string | null;
  /** Function to extract username from web URL */
  extractUsername?: (url: string) => string | null;
}

/**
 * Creates a URL extractor function from a single regex pattern.
 * Eliminates duplication across platform extraction functions.
 */
function createUrlExtractor(pattern: RegExp): (url: string) => string | null {
  return (url: string) => {
    const match = pattern.exec(url);
    return match?.[1] ?? null;
  };
}

/**
 * Creates a URL extractor function that tries multiple regex patterns.
 * Returns the first successful match.
 */
function createMultiPatternExtractor(
  patterns: RegExp[]
): (url: string) => string | null {
  return (url: string) => {
    for (const pattern of patterns) {
      const match = pattern.exec(url);
      if (match) return match[1];
    }
    return null;
  };
}

// Social Network Deep Link Configurations
export const SOCIAL_DEEP_LINKS: Record<string, DeepLinkConfig> = {
  instagram: {
    name: 'Instagram',
    iosScheme: 'instagram://user?username={username}',
    androidScheme:
      'intent://instagram.com/_u/{username}#Intent;package=com.instagram.android;scheme=https;end',
    universalLink: 'https://instagram.com/{username}',
    webFallback: 'https://instagram.com/{username}',
    extractUsername: createUrlExtractor(/instagram\.com\/([^/?#]+)/),
  },
  tiktok: {
    name: 'TikTok',
    iosScheme: 'tiktok://user?username={username}',
    androidScheme:
      'intent://www.tiktok.com/@{username}#Intent;package=com.zhiliaoapp.musically;scheme=https;end',
    universalLink: 'https://www.tiktok.com/@{username}',
    webFallback: 'https://www.tiktok.com/@{username}',
    extractUsername: createUrlExtractor(/tiktok\.com\/@([^/?#]+)/),
  },
  twitter: {
    name: 'Twitter',
    iosScheme: 'twitter://user?screen_name={username}',
    androidScheme:
      'intent://twitter.com/{username}#Intent;package=com.twitter.android;scheme=https;end',
    universalLink: 'https://twitter.com/{username}',
    webFallback: 'https://twitter.com/{username}',
    extractUsername: createUrlExtractor(/twitter\.com\/([^/?#]+)/),
  },
  youtube: {
    name: 'YouTube',
    iosScheme: 'youtube://channel/{channelId}',
    androidScheme:
      'intent://www.youtube.com/@{username}#Intent;package=com.google.android.youtube;scheme=https;end',
    universalLink: 'https://www.youtube.com/@{username}',
    webFallback: 'https://www.youtube.com/@{username}',
    extractUsername: createMultiPatternExtractor([
      /youtube\.com\/@([^/?#]+)/,
      /youtube\.com\/user\/([^/?#]+)/,
      /youtube\.com\/channel\/([^/?#]+)/,
    ]),
    extractId: createUrlExtractor(/youtube\.com\/channel\/([^/?#]+)/),
  },
  facebook: {
    name: 'Facebook',
    iosScheme: 'fb://profile/{userId}',
    androidScheme:
      'intent://www.facebook.com/{username}#Intent;package=com.facebook.katana;scheme=https;end',
    universalLink: 'https://www.facebook.com/{username}',
    webFallback: 'https://www.facebook.com/{username}',
    extractUsername: createUrlExtractor(/facebook\.com\/([^/?#]+)/),
  },
  linkedin: {
    name: 'LinkedIn',
    iosScheme: 'linkedin://in/{username}',
    androidScheme:
      'intent://www.linkedin.com/in/{username}#Intent;package=com.linkedin.android;scheme=https;end',
    universalLink: 'https://www.linkedin.com/in/{username}',
    webFallback: 'https://www.linkedin.com/in/{username}',
    extractUsername: createUrlExtractor(/linkedin\.com\/in\/([^/?#]+)/),
  },
  snapchat: {
    name: 'Snapchat',
    iosScheme: 'snapchat://add/{username}',
    androidScheme:
      'intent://www.snapchat.com/add/{username}#Intent;package=com.snapchat.android;scheme=https;end',
    universalLink: 'https://www.snapchat.com/add/{username}',
    webFallback: 'https://www.snapchat.com/add/{username}',
    extractUsername: createMultiPatternExtractor([
      /snapchat\.com\/add\/([^/?#]+)/,
      /snapchat\.com\/u\/([^/?#]+)/,
      /snapchat\.com\/([^/?#]+)/,
    ]),
  },
  reddit: {
    name: 'Reddit',
    iosScheme: 'reddit://user/{username}',
    androidScheme:
      'intent://www.reddit.com/user/{username}#Intent;package=com.reddit.frontpage;scheme=https;end',
    universalLink: 'https://www.reddit.com/user/{username}',
    webFallback: 'https://www.reddit.com/user/{username}',
    extractUsername: createMultiPatternExtractor([
      /reddit\.com\/user\/([^/?#]+)/,
      /reddit\.com\/u\/([^/?#]+)/,
    ]),
  },
  discord: {
    name: 'Discord',
    iosScheme: 'discord://invite/{id}',
    androidScheme:
      'intent://discord.gg/{id}#Intent;package=com.discord;scheme=https;end',
    universalLink: 'https://discord.gg/{id}',
    webFallback: 'https://discord.gg/{id}',
    extractId: createMultiPatternExtractor([
      /discord\.gg\/([^/?#]+)/,
      /discord\.com\/invite\/([^/?#]+)/,
    ]),
  },
  whatsapp: {
    name: 'WhatsApp',
    iosScheme: 'whatsapp://send?phone={userId}',
    androidScheme:
      'intent://send?phone={userId}#Intent;scheme=whatsapp;package=com.whatsapp;end',
    universalLink: 'https://wa.me/{userId}',
    webFallback: 'https://wa.me/{userId}',
    extractId: createMultiPatternExtractor([
      /wa\.me\/([^/?#]+)/,
      /api\.whatsapp\.com\/send\?phone=([^&#]+)/,
    ]),
  },
  twitch: {
    name: 'Twitch',
    iosScheme: 'twitch://stream/{username}',
    androidScheme:
      'intent://www.twitch.tv/{username}#Intent;package=tv.twitch.android.app;scheme=https;end',
    universalLink: 'https://www.twitch.tv/{username}',
    webFallback: 'https://www.twitch.tv/{username}',
    extractUsername: createUrlExtractor(/twitch\.tv\/([^/?#]+)/),
  },
};

// Music Streaming Platform Deep Link Configurations
export const DSP_DEEP_LINKS: Record<string, DeepLinkConfig> = {
  spotify: {
    name: 'Spotify',
    iosScheme: 'spotify://artist/{artistId}',
    androidScheme:
      'intent://open.spotify.com/artist/{artistId}#Intent;package=com.spotify.music;scheme=https;end',
    universalLink: 'https://open.spotify.com/artist/{artistId}',
    webFallback: 'https://open.spotify.com/artist/{artistId}',
    extractId: createUrlExtractor(/spotify\.com\/artist\/([^/?#]+)/),
  },
  apple_music: {
    name: 'Apple Music',
    iosScheme: 'music://artist/{artistId}',
    androidScheme:
      'intent://music.apple.com/artist/{artistId}#Intent;package=com.apple.android.music;scheme=https;end',
    universalLink: 'https://music.apple.com/artist/{artistId}',
    webFallback: 'https://music.apple.com/artist/{artistId}',
    extractId: createUrlExtractor(
      /music\.apple\.com\/[^/]+\/artist\/[^/]+\/([^/?#]+)/
    ),
  },
  youtube: {
    name: 'YouTube Music',
    iosScheme: 'youtubemusic://browse/channel/{channelId}',
    androidScheme:
      'intent://music.youtube.com/channel/{channelId}#Intent;package=com.google.android.apps.youtube.music;scheme=https;end',
    universalLink: 'https://music.youtube.com/channel/{channelId}',
    webFallback: 'https://www.youtube.com/@{username}',
    extractUsername: createMultiPatternExtractor([
      /youtube\.com\/@([^/?#]+)/,
      /youtube\.com\/user\/([^/?#]+)/,
    ]),
    extractId: createUrlExtractor(/youtube\.com\/channel\/([^/?#]+)/),
  },
  soundcloud: {
    name: 'SoundCloud',
    iosScheme: 'soundcloud://users:{username}',
    androidScheme:
      'intent://soundcloud.com/{username}#Intent;package=com.soundcloud.android;scheme=https;end',
    universalLink: 'https://soundcloud.com/{username}',
    webFallback: 'https://soundcloud.com/{username}',
    extractUsername: createUrlExtractor(/soundcloud\.com\/([^/?#]+)/),
  },
  tidal: {
    name: 'TIDAL',
    iosScheme: 'tidal://artist/{artistId}',
    androidScheme:
      'intent://tidal.com/browse/artist/{artistId}#Intent;package=com.aspiro.tidal;scheme=https;end',
    universalLink: 'https://tidal.com/browse/artist/{artistId}',
    webFallback: 'https://tidal.com/browse/artist/{artistId}',
    extractId: createUrlExtractor(/tidal\.com\/(?:browse\/)?artist\/([^/?#]+)/),
  },
  deezer: {
    name: 'Deezer',
    iosScheme: 'deezer://artist/{artistId}',
    androidScheme:
      'intent://www.deezer.com/artist/{artistId}#Intent;package=deezer.android.app;scheme=https;end',
    universalLink: 'https://www.deezer.com/artist/{artistId}',
    webFallback: 'https://www.deezer.com/artist/{artistId}',
    extractId: createUrlExtractor(
      /deezer\.com\/(?:[a-z]{2}\/)?artist\/([^/?#]+)/i
    ),
  },
  amazon_music: {
    name: 'Amazon Music',
    iosScheme: 'amazonmusic://artists/{artistId}',
    androidScheme:
      'intent://music.amazon.com/artists/{artistId}#Intent;package=com.amazon.mp3;scheme=https;end',
    universalLink: 'https://music.amazon.com/artists/{artistId}',
    webFallback: 'https://music.amazon.com/artists/{artistId}',
    extractId: createUrlExtractor(
      /music\.amazon\.[a-z.]+\/artists\/([^/?#]+)/i
    ),
  },
  bandcamp: {
    name: 'Bandcamp',
    webFallback: 'https://{username}.bandcamp.com',
    extractUsername: createMultiPatternExtractor([
      /https?:\/\/([^./]+)\.bandcamp\.com/i,
      /bandcamp\.com\/([^/?#]+)/i,
    ]),
  },
  beatport: {
    name: 'Beatport',
    webFallback: 'https://www.beatport.com/artist/{username}',
    extractUsername: createUrlExtractor(
      /beatport\.com\/artist\/[^/]+\/([^/?#]+)/
    ),
  },
  pandora: {
    name: 'Pandora',
    webFallback: 'https://www.pandora.com/artist/{username}',
    extractUsername: createUrlExtractor(/pandora\.com\/artist\/([^/?#]+)/),
  },
  napster: {
    name: 'Napster',
    iosScheme: 'napster://artist/{artistId}',
    androidScheme:
      'intent://us.napster.com/artist/{artistId}#Intent;package=com.rhapsody;scheme=https;end',
    universalLink: 'https://us.napster.com/artist/{artistId}',
    webFallback: 'https://us.napster.com/artist/{artistId}',
    extractId: createUrlExtractor(/napster\.com\/artist\/([^/?#]+)/),
  },
  audiomack: {
    name: 'Audiomack',
    iosScheme: 'audiomack://profile/{username}',
    androidScheme:
      'intent://audiomack.com/{username}#Intent;package=com.audiomack;scheme=https;end',
    universalLink: 'https://audiomack.com/{username}',
    webFallback: 'https://audiomack.com/{username}',
    extractUsername: createUrlExtractor(/audiomack\.com\/([^/?#]+)/),
  },
  qobuz: {
    name: 'Qobuz',
    webFallback: 'https://www.qobuz.com/artist/{artistId}',
    extractId: createUrlExtractor(
      /qobuz\.com\/[a-z]{2}-[a-z]{2}\/artist\/[^/]+\/([^/?#]+)/i
    ),
  },
  anghami: {
    name: 'Anghami',
    iosScheme: 'anghami://artist/{artistId}',
    androidScheme:
      'intent://play.anghami.com/artist/{artistId}#Intent;package=com.anghami;scheme=https;end',
    universalLink: 'https://play.anghami.com/artist/{artistId}',
    webFallback: 'https://play.anghami.com/artist/{artistId}',
    extractId: createUrlExtractor(/anghami\.com\/artist\/([^/?#]+)/),
  },
  boomplay: {
    name: 'Boomplay',
    androidScheme:
      'intent://www.boomplay.com/artists/{artistId}#Intent;package=com.afmobi.boomplayer;scheme=https;end',
    universalLink: 'https://www.boomplay.com/artists/{artistId}',
    webFallback: 'https://www.boomplay.com/artists/{artistId}',
    extractId: createUrlExtractor(/boomplay\.com\/artists\/([^/?#]+)/),
  },
  iheartradio: {
    name: 'iHeartRadio',
    iosScheme: 'iheartradio://artist/{username}',
    androidScheme:
      'intent://www.iheart.com/artist/{username}#Intent;package=com.clearchannel.iheartradio.controller;scheme=https;end',
    universalLink: 'https://www.iheart.com/artist/{username}',
    webFallback: 'https://www.iheart.com/artist/{username}',
    extractUsername: createUrlExtractor(/iheart\.com\/artist\/([^/?#]+)/),
  },
  tiktok: {
    name: 'TikTok Music',
    iosScheme: 'tiktok://music/{artistId}',
    androidScheme:
      'intent://www.tiktok.com/music/{artistId}#Intent;package=com.zhiliaoapp.musically;scheme=https;end',
    universalLink: 'https://www.tiktok.com/music/{artistId}',
    webFallback: 'https://www.tiktok.com/music/{artistId}',
    extractId: createUrlExtractor(/tiktok\.com\/music\/([^/?#]+)/),
  },
};

/**
 * Platform detection result
 */
export interface PlatformInfo {
  platform: 'ios' | 'android' | 'desktop';
  userAgent?: string;
}

/**
 * Deep link result
 */
export interface DeepLinkResult {
  /** Native app URL to try first */
  nativeUrl: string | null;
  /** Web fallback URL */
  fallbackUrl: string;
  /** Platform information */
  platform: PlatformInfo;
  /** Whether to attempt native app opening */
  shouldTryNative: boolean;
}

/**
 * Map of detected platform strings to PlatformInfo platform values.
 */
const PLATFORM_MAP: Record<string, PlatformInfo['platform']> = {
  ios: 'ios',
  android: 'android',
};

/**
 * Detects the current platform
 */
export function detectPlatform(userAgent?: string): PlatformInfo {
  const ua =
    userAgent ||
    (typeof window === 'undefined' ? '' : globalThis.navigator.userAgent);
  const detectedPlatform = detectPlatformFromUA(ua);

  return {
    platform:
      detectedPlatform == null
        ? 'desktop'
        : (PLATFORM_MAP[detectedPlatform] ?? 'desktop'),
    userAgent: ua,
  };
}

/**
 * Replaces placeholder tokens in a URL template with actual values.
 */
function applyPlaceholders(
  template: string,
  username: string | null | undefined,
  id: string | null | undefined
): string {
  return template
    .replace('{username}', username ?? '')
    .replace('{userId}', id ?? '')
    .replace('{artistId}', id ?? '')
    .replace('{channelId}', id ?? '');
}

/**
 * Gets the native scheme for a platform from the config.
 */
function getNativeScheme(
  config: DeepLinkConfig,
  platform: PlatformInfo['platform']
): string | undefined {
  if (platform === 'ios') return config.iosScheme;
  if (platform === 'android') return config.androidScheme;
  return undefined;
}

/**
 * Creates a deep link configuration for a given URL and platform
 */
export function createDeepLink(
  originalUrl: string,
  config: DeepLinkConfig,
  platform?: PlatformInfo
): DeepLinkResult {
  const platformInfo = platform || detectPlatform();

  // Extract username or ID from the original URL
  const username = config.extractUsername?.(originalUrl);
  const id = config.extractId?.(originalUrl);

  // Check if we have valid extracted data to work with
  const hasValidData =
    (config.extractId && id) || (config.extractUsername && username);

  // Construct native URL based on platform
  let nativeUrl: string | null = null;
  const nativeScheme = getNativeScheme(config, platformInfo.platform);
  if (nativeScheme && hasValidData) {
    nativeUrl = applyPlaceholders(nativeScheme, username, id);
  }

  // Construct fallback URL
  let fallbackUrl = originalUrl;
  if (config.webFallback && hasValidData) {
    fallbackUrl = applyPlaceholders(config.webFallback, username, id);
  }

  // Use universal link for iOS if available and no native scheme
  if (
    platformInfo.platform === 'ios' &&
    config.universalLink &&
    !nativeUrl &&
    hasValidData
  ) {
    nativeUrl = applyPlaceholders(config.universalLink, username, id);
  }

  return {
    nativeUrl,
    fallbackUrl,
    platform: platformInfo,
    shouldTryNative: platformInfo.platform !== 'desktop' && nativeUrl !== null,
  };
}

/**
 * Opens a deep link with fallback handling
 */
export function openDeepLink(
  originalUrl: string,
  config: DeepLinkConfig,
  options: {
    onNativeAttempt?: () => void;
    onFallback?: () => void;
    timeout?: number;
  } = {}
): Promise<boolean> {
  return new Promise(resolve => {
    const { timeout = 2000 } = options;
    const deepLink = createDeepLink(originalUrl, config);

    if (!deepLink.shouldTryNative || !deepLink.nativeUrl) {
      // Open fallback directly
      options.onFallback?.();
      globalThis.open(deepLink.fallbackUrl, '_blank', 'noopener,noreferrer');
      resolve(false);
      return;
    }

    // Track when the page loses focus (indicating app might have opened)
    let appOpened = false;
    let timeoutId: NodeJS.Timeout | null = null;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        appOpened = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        cleanup();
        resolve(true);
      }
    };

    const handlePageBlur = () => {
      appOpened = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      cleanup();
      resolve(true);
    };

    // Set up listeners
    document.addEventListener('visibilitychange', handleVisibilityChange);
    globalThis.addEventListener('blur', handlePageBlur);

    // Cleanup function
    const cleanup = () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      globalThis.removeEventListener('blur', handlePageBlur);
    };

    // Try to open native app
    options.onNativeAttempt?.();

    try {
      // For iOS, try the iframe trick for better app detection
      if (deepLink.platform.platform === 'ios') {
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = deepLink.nativeUrl;
        document.body.appendChild(iframe);
        setTimeout(() => iframe.remove(), 100);
      } else {
        // For Android and others, use globalThis.location
        globalThis.location.href = deepLink.nativeUrl;
      }
    } catch (error) {
      Sentry.addBreadcrumb({
        category: 'deep-links',
        message: 'Native app opening failed',
        level: 'debug',
        data: { error: error instanceof Error ? error.message : String(error) },
      });
    }

    // Set timeout for fallback
    timeoutId = setTimeout(() => {
      cleanup();
      if (!appOpened) {
        // App didn't open, use fallback
        options.onFallback?.();
        globalThis.open(deepLink.fallbackUrl, '_blank', 'noopener,noreferrer');
        resolve(false);
      }
    }, timeout);
  });
}

/**
 * Gets the appropriate deep link configuration for a social platform
 */
export function getSocialDeepLinkConfig(
  platform: string
): DeepLinkConfig | null {
  const normalizedPlatform = platform.toLowerCase();
  return SOCIAL_DEEP_LINKS[normalizedPlatform] || null;
}

/**
 * Gets the appropriate deep link configuration for a DSP platform
 */
export function getDSPDeepLinkConfig(platform: string): DeepLinkConfig | null {
  const normalizedPlatform = platform.toLowerCase();
  return DSP_DEEP_LINKS[normalizedPlatform] || null;
}
