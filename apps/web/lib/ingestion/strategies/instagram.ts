/**
 * Instagram Profile Ingestion Strategy
 *
 * Lightweight metadata-first extraction using OpenGraph tags.
 */

import type { ExtractionResult } from '../types';
import {
  createExtractionResult,
  ExtractionError,
  extractLinks,
  extractMetaContent,
  extractOpenGraphProfile,
  type FetchOptions,
  fetchDocument,
  type StrategyConfig,
  validatePlatformUrl,
} from './base';

const INSTAGRAM_CONFIG: StrategyConfig = {
  platformId: 'instagram',
  platformName: 'Instagram',
  canonicalHost: 'www.instagram.com',
  validHosts: new Set(['instagram.com', 'www.instagram.com']),
  defaultTimeoutMs: 10000,
} as const;

const SKIP_HOSTS = new Set(['instagram.com', 'www.instagram.com']);

export function isInstagramUrl(url: string): boolean {
  return validatePlatformUrl(url, INSTAGRAM_CONFIG).valid;
}

export function validateInstagramUrl(url: string): string | null {
  const result = validatePlatformUrl(url, INSTAGRAM_CONFIG);
  return result.valid && result.normalized ? result.normalized : null;
}

export function extractInstagramHandle(url: string): string | null {
  const result = validatePlatformUrl(url, INSTAGRAM_CONFIG);
  return result.valid && result.handle ? result.handle : null;
}

export async function fetchInstagramDocument(
  sourceUrl: string,
  options?: FetchOptions
): Promise<string> {
  const validated = validateInstagramUrl(sourceUrl);
  if (!validated) {
    throw new ExtractionError('Invalid Instagram profile URL', 'INVALID_URL');
  }

  const { html } = await fetchDocument(validated, {
    ...options,
    timeoutMs: INSTAGRAM_CONFIG.defaultTimeoutMs,
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      ...options?.headers,
    },
    allowedHosts: INSTAGRAM_CONFIG.validHosts,
  });

  return html;
}

export function extractInstagram(html: string): ExtractionResult {
  const ogProfile = extractOpenGraphProfile(html);
  const bio = extractMetaContent(html, 'og:description') ?? null;

  const links = extractLinks(html, {
    skipHosts: SKIP_HOSTS,
    sourcePlatform: 'instagram',
    sourceSignal: 'instagram_profile_link',
  });

  return {
    ...createExtractionResult(
      links,
      ogProfile.displayName,
      ogProfile.avatarUrl
    ),
    sourcePlatform: 'instagram',
    bio: bio?.trim() || null,
  };
}
