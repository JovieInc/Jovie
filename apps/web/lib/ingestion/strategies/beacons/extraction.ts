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
 * Extract display name from various sources in priority order.
 */
function extractDisplayName(html: string): string | null {
  // 1. Try meta tags first
  const metaName =
    extractMetaContent(html, 'og:title') ??
    extractMetaContent(html, 'twitter:title');

  if (metaName) return cleanBeaconsDisplayName(metaName);

  // 2. Try JSON-LD
  const jsonLdData = extractJsonLd(html);
  if (jsonLdData?.name) return jsonLdData.name;

  // 3. Try Beacons-specific extraction
  const beaconsData = extractBeaconsSpecificData(html);
  return beaconsData.displayName ?? null;
}

/**
 * Extract avatar URL from various sources in priority order.
 */
function extractAvatarUrl(html: string): string | null {
  // 1. Try meta tags first
  const metaAvatar =
    extractMetaContent(html, 'og:image') ??
    extractMetaContent(html, 'twitter:image');

  if (metaAvatar && !isDefaultBeaconsImage(metaAvatar)) return metaAvatar;

  // 2. Try JSON-LD
  const jsonLdData = extractJsonLd(html);
  if (jsonLdData?.image && !isDefaultBeaconsImage(jsonLdData.image)) {
    return jsonLdData.image;
  }

  // 3. Try Beacons-specific extraction
  const beaconsData = extractBeaconsSpecificData(html);
  return beaconsData.avatarUrl ?? null;
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

  const addLink = (
    rawUrl: string | undefined | null,
    title?: string | null
  ) => {
    if (!rawUrl) return;

    try {
      const normalizedUrl = normalizeUrl(rawUrl);
      const parsed = new URL(normalizedUrl);
      if (parsed.protocol !== 'https:') return;
      if (SKIP_HOSTS.has(parsed.hostname.toLowerCase())) return;

      const detected = detectPlatform(normalizedUrl);
      if (!detected.isValid) return;

      const key = canonicalIdentity({
        platform: detected.platform,
        normalizedUrl: detected.normalizedUrl,
      });
      if (seen.has(key)) return;
      seen.add(key);

      links.push({
        url: detected.normalizedUrl,
        platformId: detected.platform.id,
        title: detected.suggestedTitle ?? title ?? undefined,
        sourcePlatform: 'beacons',
        evidence: {
          sources: ['beacons'],
          signals: ['beacons_profile_link'],
        },
      });
    } catch {
      return;
    }
  };

  const structuredLinks = extractBeaconsStructuredLinks(html);
  for (const link of structuredLinks) {
    addLink(link.url, link.title);
  }

  const fallbackLinks = extractLinks(html, {
    skipHosts: SKIP_HOSTS,
    sourcePlatform: 'beacons',
    sourceSignal: 'beacons_profile_link',
  });

  for (const link of fallbackLinks) {
    addLink(link.url, link.title);
  }

  // Extract profile data using cascading extraction methods
  const displayName = extractDisplayName(html);
  const avatarUrl = extractAvatarUrl(html);

  // Detect paid tier by checking for branding
  const hasPaidTier = detectBeaconsPaidTier(html);

  return createExtractionResult(links, displayName, avatarUrl, hasPaidTier);
}
