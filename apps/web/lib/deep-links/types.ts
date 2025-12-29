/**
 * Deep Link type definitions
 */

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

export interface PlatformInfo {
  platform: 'ios' | 'android' | 'desktop';
  userAgent?: string;
}

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

export interface OpenDeepLinkOptions {
  onNativeAttempt?: () => void;
  onFallback?: () => void;
  timeout?: number;
}
