/**
 * Provider Domain Configuration
 *
 * Centralized domain configuration for provider URL validation.
 * Used by release provider management features.
 */

import type { DspProviderId } from '@/lib/dsp-enrichment/types';
import { PROVIDER_DOMAINS as REGISTRY_PROVIDER_DOMAINS } from '@/lib/dsp-registry';
import type { ProviderKey, VideoProviderKey } from './types';

/**
 * Known provider domains for validation.
 * Derived from the canonical DSP registry.
 */
export const PROVIDER_DOMAINS: Record<string, string[]> =
  REGISTRY_PROVIDER_DOMAINS;

/**
 * Maps ProviderKey to DspProviderId for icon rendering.
 * Some providers don't have matching DSP icons.
 */
export const PROVIDER_TO_DSP: Record<ProviderKey, DspProviderId | null> = {
  spotify: 'spotify',
  apple_music: 'apple_music',
  youtube: null,
  youtube_music: 'youtube_music',
  soundcloud: 'soundcloud',
  deezer: 'deezer',
  tidal: 'tidal',
  amazon_music: 'amazon_music',
  bandcamp: null,
  beatport: null,
  pandora: null,
  napster: null,
  audiomack: null,
  qobuz: null,
  anghami: null,
  boomplay: null,
  iheartradio: null,
  tiktok: null,
  amazon: null,
  awa: null,
  audius: null,
  flo: null,
  gaana: null,
  jio_saavn: null,
  joox: null,
  kkbox: null,
  line_music: null,
  netease: null,
  qq_music: null,
  trebel: null,
  yandex: null,
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
