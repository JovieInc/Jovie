/**
 * Instagram Profile Ingestion Strategy
 *
 * Lightweight metadata-first extraction using OpenGraph tags.
 */

import { disabledSocialHtmlDocument } from '@/lib/ingestion/social-html-policy';
import type { ExtractionResult } from '../types';
import {
  createExtractionResult,
  decodeHtmlEntities,
  ExtractionError,
  extractLinks,
  extractMetaContent,
  extractOpenGraphProfile,
  type FetchOptions,
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
  _options?: FetchOptions
): Promise<string> {
  const validated = validateInstagramUrl(sourceUrl);
  if (!validated) {
    throw new ExtractionError('Invalid Instagram profile URL', 'INVALID_URL');
  }

  return disabledSocialHtmlDocument();
}

/** og:title is "Name (@handle) • Instagram photos and videos". */
function profileName(title: string | null): string | null {
  const name = title
    ? decodeHtmlEntities(title)
        .replace(/\s*\(@[^)]*\)\s*•.*$/u, '')
        .trim()
    : null;
  return name && name !== 'Instagram' ? name : null;
}

export function extractInstagram(html: string): ExtractionResult {
  // Logged-out datacenter requests get a login page that still answers 200.
  // Its generic title and logo must never be reported as the creator.
  if (extractMetaContent(html, 'og:type') !== 'profile') {
    throw new ExtractionError(
      'Instagram returned a login page instead of the profile',
      'LOGIN_REQUIRED'
    );
  }
  const ogProfile = extractOpenGraphProfile(html);
  const description = extractMetaContent(html, 'og:description') ?? null;
  // The OpenGraph description is follower counts, not the creator's bio.
  const bio =
    description && /\bFollowers\b.*\bFollowing\b/i.test(description)
      ? null
      : description;

  const links = extractLinks(html, {
    skipHosts: SKIP_HOSTS,
    sourcePlatform: 'instagram',
    sourceSignal: 'instagram_profile_link',
  });

  return {
    ...createExtractionResult(
      links,
      profileName(ogProfile.displayName),
      ogProfile.avatarUrl
    ),
    sourcePlatform: 'instagram',
    bio: bio?.trim() || null,
  };
}
