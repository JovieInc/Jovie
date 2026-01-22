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

type LinkCollector = {
  links: ExtractionResult['links'];
  seen: Set<string>;
};

/**
 * Validates and normalizes a URL for link extraction.
 * Returns null if the URL should be skipped.
 */
function validateAndNormalizeUrl(rawUrl: string): string | null {
  try {
    const normalizedUrl = normalizeUrl(rawUrl);
    const parsed = new URL(normalizedUrl);
    if (parsed.protocol !== 'https:') return null;
    if (SKIP_HOSTS.has(parsed.hostname.toLowerCase())) return null;
    return normalizedUrl;
  } catch {
    return null;
  }
}

/**
 * Adds a validated link to the collector if not already seen.
 */
function addLinkToCollector(
  collector: LinkCollector,
  rawUrl: string | undefined | null,
  title?: string | null
): void {
  if (!rawUrl) return;

  const normalizedUrl = validateAndNormalizeUrl(rawUrl);
  if (!normalizedUrl) return;

  const detected = detectPlatform(normalizedUrl);
  if (!detected.isValid) return;

  const key = canonicalIdentity({
    platform: detected.platform,
    normalizedUrl: detected.normalizedUrl,
  });
  if (collector.seen.has(key)) return;
  collector.seen.add(key);

  collector.links.push({
    url: detected.normalizedUrl,
    platformId: detected.platform.id,
    title: detected.suggestedTitle ?? title ?? undefined,
    sourcePlatform: 'beacons',
    evidence: {
      sources: ['beacons'],
      signals: ['beacons_profile_link'],
    },
  });
}

/**
 * Extracts display name using fallback chain: meta tags -> JSON-LD -> Beacons-specific.
 */
function extractDisplayName(
  html: string,
  jsonLdData: { name?: string } | null,
  beaconsData: { displayName?: string }
): string | null {
  const metaName =
    extractMetaContent(html, 'og:title') ??
    extractMetaContent(html, 'twitter:title');

  if (metaName) return cleanBeaconsDisplayName(metaName);
  if (jsonLdData?.name) return cleanBeaconsDisplayName(jsonLdData.name);
  if (beaconsData.displayName)
    return cleanBeaconsDisplayName(beaconsData.displayName);
  return null;
}

/**
 * Extracts avatar URL using fallback chain: meta tags -> JSON-LD -> Beacons-specific.
 * Filters out default Beacons placeholder images.
 */
function extractAvatarUrl(
  html: string,
  jsonLdData: { image?: string } | null,
  beaconsData: { avatarUrl?: string }
): string | null {
  const metaImage =
    extractMetaContent(html, 'og:image') ??
    extractMetaContent(html, 'twitter:image');

  if (metaImage && !isDefaultBeaconsImage(metaImage)) return metaImage;
  if (jsonLdData?.image && !isDefaultBeaconsImage(jsonLdData.image)) {
    return jsonLdData.image;
  }
  if (beaconsData.avatarUrl) return beaconsData.avatarUrl;
  return null;
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
  const collector: LinkCollector = { links: [], seen: new Set<string>() };

  // Collect links from structured data
  const structuredLinks = extractBeaconsStructuredLinks(html);
  for (const link of structuredLinks) {
    addLinkToCollector(collector, link.url, link.title);
  }

  // Collect links from href attributes
  const fallbackLinks = extractLinks(html, {
    skipHosts: SKIP_HOSTS,
    sourcePlatform: 'beacons',
    sourceSignal: 'beacons_profile_link',
  });
  for (const link of fallbackLinks) {
    addLinkToCollector(collector, link.url, link.title);
  }

  // Extract profile metadata using fallback chains
  const jsonLdData = extractJsonLd(html);
  const beaconsData = extractBeaconsSpecificData(html);

  const displayName = extractDisplayName(html, jsonLdData, beaconsData);
  const avatarUrl = extractAvatarUrl(html, jsonLdData, beaconsData);
  const hasPaidTier = detectBeaconsPaidTier(html);

  return createExtractionResult(
    collector.links,
    displayName,
    avatarUrl,
    hasPaidTier
  );
}
