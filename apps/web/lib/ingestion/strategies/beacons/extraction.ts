/**
 * Beacons Profile Extraction
 *
 * Main extraction function for Beacons.ai profiles.
 */

import {
  canonicalIdentity,
  detectPlatform,
  normalizeUrl,
} from '@/lib/utils/platform-detection';
import type { ExtractionResult } from '../../types';
import {
  createExtractionResult,
  extractLinks,
  extractMetaContent,
} from '../base';
import { SKIP_HOSTS } from './config';
import {
  cleanBeaconsDisplayName,
  extractBeaconsSpecificData,
  extractBeaconsStructuredLinks,
  extractJsonLd,
  isDefaultBeaconsImage,
} from './helpers';
import { detectBeaconsPaidTier } from './paid-tier';

/**
 * Validates and processes a raw URL for link extraction.
 * Returns the normalized link data or null if invalid.
 */
function processLink(
  rawUrl: string | undefined | null,
  title: string | null | undefined,
  seen: Set<string>
): ExtractionResult['links'][number] | null {
  if (!rawUrl) return null;

  try {
    const normalizedUrl = normalizeUrl(rawUrl);
    const parsed = new URL(normalizedUrl);
    if (parsed.protocol !== 'https:') return null;
    if (SKIP_HOSTS.has(parsed.hostname.toLowerCase())) return null;

    const detected = detectPlatform(normalizedUrl);
    if (!detected.isValid) return null;

    const key = canonicalIdentity({
      platform: detected.platform,
      normalizedUrl: detected.normalizedUrl,
    });
    if (seen.has(key)) return null;
    seen.add(key);

    return {
      url: detected.normalizedUrl,
      platformId: detected.platform.id,
      title: detected.suggestedTitle ?? title ?? undefined,
      sourcePlatform: 'beacons',
      evidence: {
        sources: ['beacons'],
        signals: ['beacons_profile_link'],
      },
    };
  } catch {
    return null;
  }
}

/**
 * Extracts display name and avatar using fallback sources.
 */
function extractProfileMetadata(html: string): {
  displayName: string | null;
  avatarUrl: string | null;
} {
  // Try meta tags first
  let displayName =
    extractMetaContent(html, 'og:title') ??
    extractMetaContent(html, 'twitter:title') ??
    null;

  if (displayName) {
    displayName = cleanBeaconsDisplayName(displayName).trim() || null;
  }

  let avatarUrl =
    extractMetaContent(html, 'og:image') ??
    extractMetaContent(html, 'twitter:image') ??
    null;

  if (avatarUrl) {
    avatarUrl = avatarUrl.trim() || null;
  }
  if (avatarUrl && isDefaultBeaconsImage(avatarUrl)) {
    avatarUrl = null;
  }

  // Try JSON-LD fallback
  if (!displayName || !avatarUrl) {
    const jsonLdData = extractJsonLd(html);
    const jsonLdName = jsonLdData?.name?.trim() || null;
    displayName ??= jsonLdName;
    if (
      !avatarUrl &&
      jsonLdData?.image &&
      !isDefaultBeaconsImage(jsonLdData.image)
    ) {
      avatarUrl = jsonLdData.image;
    }
  }

  // Try Beacons-specific fallback
  if (!displayName || !avatarUrl) {
    const beaconsData = extractBeaconsSpecificData(html);
    const beaconsDisplayName = beaconsData.displayName?.trim() || null;
    const beaconsAvatarUrl = beaconsData.avatarUrl?.trim() || null;
    displayName ??= beaconsDisplayName;
    avatarUrl ??= beaconsAvatarUrl;
  }

  return { displayName, avatarUrl };
}

/**
 * Extracts profile data and links from Beacons.ai HTML.
 *
 * Handles multiple extraction methods:
 * 1. Open Graph / Twitter meta tags for display name and avatar
 * 2. href attributes for external links
 * 3. JSON-LD structured data (if present)
 * 4. Beacons-specific data attributes
 */
export function extractBeacons(html: string): ExtractionResult {
  const links: ExtractionResult['links'] = [];
  const seen = new Set<string>();

  // Extract structured links
  for (const link of extractBeaconsStructuredLinks(html)) {
    const processed = processLink(link.url, link.title, seen);
    if (processed) links.push(processed);
  }

  // Extract fallback links
  const fallbackLinks = extractLinks(html, {
    skipHosts: SKIP_HOSTS,
    sourcePlatform: 'beacons',
    sourceSignal: 'beacons_profile_link',
  });
  for (const link of fallbackLinks) {
    const processed = processLink(link.url, link.title, seen);
    if (processed) links.push(processed);
  }

  const { displayName, avatarUrl } = extractProfileMetadata(html);
  const hasPaidTier = detectBeaconsPaidTier(html);

  return {
    ...createExtractionResult(links, displayName, avatarUrl, hasPaidTier),
    sourcePlatform: 'beacons',
  };
}
