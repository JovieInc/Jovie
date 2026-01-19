/**
 * Deep Link Utility for Social Networks and Music Streaming Platforms
 *
 * Provides native app deep linking with graceful fallbacks to web versions.
 * Supports iOS and Android URL schemes plus universal links.
 */

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
    const match = url.match(pattern);
    return match ? match[1] : null;
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
      const match = url.match(pattern);
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
    (typeof window !== 'undefined' ? window.navigator.userAgent : '');
  const detectedPlatform = detectPlatformFromUA(ua);

  return {
    platform:
      detectedPlatform != null
        ? (PLATFORM_MAP[detectedPlatform] ?? 'desktop')
        : 'desktop',
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
      window.open(deepLink.fallbackUrl, '_blank', 'noopener,noreferrer');
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
    window.addEventListener('blur', handlePageBlur);

    // Cleanup function
    const cleanup = () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handlePageBlur);
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
        // For Android and others, use window.location
        window.location.href = deepLink.nativeUrl;
      }
    } catch (error) {
      console.debug('Native app opening failed:', error);
    }

    // Set timeout for fallback
    timeoutId = setTimeout(() => {
      cleanup();
      if (!appOpened) {
        // App didn't open, use fallback
        options.onFallback?.();
        window.open(deepLink.fallbackUrl, '_blank', 'noopener,noreferrer');
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
