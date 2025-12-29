/**
 * Deep link utility functions
 */

import { detectPlatformFromUA } from '../utils';
import type {
  DeepLinkConfig,
  DeepLinkResult,
  OpenDeepLinkOptions,
  PlatformInfo,
} from './types';

/**
 * Detects the current platform from user agent
 */
export function detectPlatform(userAgent?: string): PlatformInfo {
  const ua =
    userAgent ||
    (typeof window !== 'undefined' ? window.navigator.userAgent : '');
  const detectedPlatform = detectPlatformFromUA(ua);

  return {
    platform:
      detectedPlatform === 'ios'
        ? 'ios'
        : detectedPlatform === 'android'
          ? 'android'
          : 'desktop',
    userAgent: ua,
  };
}

/**
 * Replace template placeholders in URL
 */
function replaceUrlPlaceholders(
  template: string,
  values: { username?: string | null; id?: string | null }
): string {
  return template
    .replace('{username}', values.username || '')
    .replace('{userId}', values.id || '')
    .replace('{artistId}', values.id || '')
    .replace('{channelId}', values.id || '');
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
  const hasIdentifier =
    (config.extractId && id) || (config.extractUsername && username);

  let nativeUrl: string | null = null;
  let fallbackUrl = originalUrl; // Default to original URL

  // Construct native URL based on platform
  if (platformInfo.platform === 'ios' && config.iosScheme && hasIdentifier) {
    nativeUrl = replaceUrlPlaceholders(config.iosScheme, { username, id });
  } else if (
    platformInfo.platform === 'android' &&
    config.androidScheme &&
    hasIdentifier
  ) {
    nativeUrl = replaceUrlPlaceholders(config.androidScheme, { username, id });
  }

  // Construct fallback URL
  if (config.webFallback && hasIdentifier) {
    fallbackUrl = replaceUrlPlaceholders(config.webFallback, { username, id });
  }

  // Use universal link for iOS if available and no native scheme
  if (
    platformInfo.platform === 'ios' &&
    config.universalLink &&
    !nativeUrl &&
    hasIdentifier
  ) {
    nativeUrl = replaceUrlPlaceholders(config.universalLink, { username, id });
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
  options: OpenDeepLinkOptions = {}
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
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handlePageBlur);
    };

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

    // Try to open native app
    options.onNativeAttempt?.();

    try {
      // For iOS, try the iframe trick for better app detection
      if (deepLink.platform.platform === 'ios') {
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = deepLink.nativeUrl;
        document.body.appendChild(iframe);
        setTimeout(() => document.body.removeChild(iframe), 100);
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
