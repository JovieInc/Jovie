/**
 * Provider Domain Configuration
 *
 * Centralized domain configuration for provider URL validation.
 * Used by release provider management features.
 */

import type { DspProviderId } from '@/lib/dsp-enrichment/types';
import type { ProviderKey, VideoProviderKey } from './types';

/**
 * Known provider domains for validation.
 * Maps each provider to valid domains for URL validation.
 */
export const PROVIDER_DOMAINS: Record<ProviderKey, string[]> = {
  spotify: ['open.spotify.com', 'spotify.com', 'spotify.link'],
  apple_music: [
    'music.apple.com',
    'itunes.apple.com',
    'geo.music.apple.com',
    'apple.co',
  ],
  youtube: [
    'youtube.com',
    'www.youtube.com',
    'm.youtube.com',
    'youtu.be',
    'music.youtube.com',
  ],
  soundcloud: ['soundcloud.com', 'on.soundcloud.com', 'm.soundcloud.com'],
  deezer: ['deezer.com', 'www.deezer.com', 'deezer.page.link'],
  tidal: ['tidal.com', 'listen.tidal.com'],
  amazon_music: ['music.amazon.com', 'amazon.com'],
  bandcamp: ['bandcamp.com'],
  beatport: ['beatport.com'],
};

/**
 * Maps ProviderKey to DspProviderId for icon rendering.
 * Some providers don't have matching DSP icons.
 */
export const PROVIDER_TO_DSP: Record<ProviderKey, DspProviderId | null> = {
  spotify: 'spotify',
  apple_music: 'apple_music',
  youtube: 'youtube_music',
  soundcloud: 'soundcloud',
  deezer: 'deezer',
  tidal: 'tidal',
  amazon_music: 'amazon_music',
  bandcamp: null,
  beatport: null,
};

/**
 * Known domains for video providers (short-form "Use this sound" links).
 */
export const VIDEO_PROVIDER_DOMAINS: Record<VideoProviderKey, string[]> = {
  tiktok_sound: ['tiktok.com', 'www.tiktok.com', 'vm.tiktok.com'],
  instagram_reels: ['instagram.com', 'www.instagram.com'],
  youtube_shorts: ['youtube.com', 'www.youtube.com', 'youtu.be'],
};

/**
 * Validation result for provider URLs.
 */
export interface UrlValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate URL format and optionally check provider domain.
 *
 * @param url - The URL to validate
 * @param provider - Optional provider to validate domain against
 * @param providerLabel - Label for error messages (defaults to provider key)
 * @returns Validation result with error message if invalid
 */
export function validateProviderUrl(
  url: string,
  provider?: ProviderKey,
  providerLabel?: string
): UrlValidationResult {
  try {
    const parsed = new URL(url);

    // Check protocol
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, error: 'URL must use http:// or https://' };
    }

    // Check provider domain if specified
    if (provider && PROVIDER_DOMAINS[provider]) {
      const domains = PROVIDER_DOMAINS[provider];
      const hostname = parsed.hostname.toLowerCase();

      const isValidDomain = domains.some(
        domain => hostname === domain || hostname.endsWith(`.${domain}`)
      );

      if (!isValidDomain) {
        const expectedDomains = domains.join(', ');
        const label = providerLabel ?? provider;
        return {
          valid: false,
          error: `URL must be from ${label} (${expectedDomains})`,
        };
      }
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}

/**
 * Check if a URL matches a provider's expected domains.
 * Simple boolean check without detailed error info.
 */
export function isValidProviderUrl(
  url: string,
  provider: ProviderKey
): boolean {
  return validateProviderUrl(url, provider).valid;
}
