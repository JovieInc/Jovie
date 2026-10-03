/**
 * Twitter/X Profile Ingestion Strategy
 *
 * Lightweight metadata-first extraction using OpenGraph tags.
 */

import { disabledSocialHtmlDocument } from '@/lib/ingestion/social-html-policy';
import type { ExtractionResult } from '../types';
import {
  createExtractionResult,
  ExtractionError,
  extractLinks,
  extractMetaContent,
  extractOpenGraphProfile,
  type FetchOptions,
  type StrategyConfig,
  validatePlatformUrl,
} from './base';

const TWITTER_CONFIG: StrategyConfig = {
  platformId: 'twitter',
  platformName: 'Twitter',
  canonicalHost: 'x.com',
  validHosts: new Set(['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com']),
  defaultTimeoutMs: 10000,
} as const;

const SKIP_HOSTS = new Set([
  'x.com',
  'www.x.com',
  'twitter.com',
  'www.twitter.com',
]);

export function isTwitterUrl(url: string): boolean {
  return validatePlatformUrl(url, TWITTER_CONFIG).valid;
}

export function validateTwitterUrl(url: string): string | null {
  const result = validatePlatformUrl(url, TWITTER_CONFIG);
  return result.valid && result.normalized ? result.normalized : null;
}

export function extractTwitterHandle(url: string): string | null {
  const result = validatePlatformUrl(url, TWITTER_CONFIG);
  return result.valid && result.handle ? result.handle : null;
}

export async function fetchTwitterDocument(
  sourceUrl: string,
  _options?: FetchOptions
): Promise<string> {
  const validated = validateTwitterUrl(sourceUrl);
  if (!validated) {
    throw new ExtractionError('Invalid Twitter profile URL', 'INVALID_URL');
  }

  return disabledSocialHtmlDocument();
}

export function extractTwitter(html: string): ExtractionResult {
  const ogProfile = extractOpenGraphProfile(html);
  const bio = extractMetaContent(html, 'og:description') ?? null;

  const links = extractLinks(html, {
    skipHosts: SKIP_HOSTS,
    sourcePlatform: 'twitter',
    sourceSignal: 'twitter_profile_link',
  });

  return {
    ...createExtractionResult(
      links,
      ogProfile.displayName,
      ogProfile.avatarUrl
    ),
    sourcePlatform: 'twitter',
    bio: bio?.trim() || null,
  };
}
