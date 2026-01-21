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

  // Extract display name from meta tags
  let displayName =
    extractMetaContent(html, 'og:title') ??
    extractMetaContent(html, 'twitter:title') ??
    null;

  // Clean up display name (remove " | Beacons" or similar suffixes)
  if (displayName) {
    displayName = cleanBeaconsDisplayName(displayName);
  }

  // Extract avatar from meta tags
  let avatarUrl =
    extractMetaContent(html, 'og:image') ??
    extractMetaContent(html, 'twitter:image') ??
    null;

  // Beacons sometimes uses a default OG image, try to detect and skip it
  if (avatarUrl && isDefaultBeaconsImage(avatarUrl)) {
    avatarUrl = null;
  }

  // Try to extract from JSON-LD if meta tags are missing
  if (!displayName || !avatarUrl) {
    const jsonLdData = extractJsonLd(html);
    if (jsonLdData) {
      if (!displayName && jsonLdData.name) {
        displayName = jsonLdData.name;
      }
      if (
        !avatarUrl &&
        jsonLdData.image &&
        !isDefaultBeaconsImage(jsonLdData.image)
      ) {
        avatarUrl = jsonLdData.image;
      }
    }
  }

  // Try Beacons-specific extraction methods
  if (!displayName || !avatarUrl) {
    const beaconsData = extractBeaconsSpecificData(html);
    if (!displayName && beaconsData.displayName) {
      displayName = beaconsData.displayName;
    }
    if (!avatarUrl && beaconsData.avatarUrl) {
      avatarUrl = beaconsData.avatarUrl;
    }
  }

  // Detect paid tier by checking for branding
  const hasPaidTier = detectBeaconsPaidTier(html);

  return createExtractionResult(links, displayName, avatarUrl, hasPaidTier);
}
