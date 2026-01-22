/**
 * Link Transformers
 *
 * Utilities for transforming links between different formats:
 * - Database format (ProfileSocialLink)
 * - UI format (LinkItem)
 * - Suggestion format (SuggestedLink)
 * - Dashboard preview format
 */

import type { ProfileSocialLink } from '@/app/app/dashboard/actions/social-links';
import type { DetectedLink } from '@/lib/utils/platform-detection';
import { getSocialPlatformLabel, type SocialPlatform } from '@/types';
import type { LinkItem, Platform, PlatformType, SuggestedLink } from '../types';
import { getPlatformCategory } from './platform-category';

/**
 * Build platform metadata from a database link
 *
 * @param link - The database link to build metadata for
 * @returns Platform metadata object
 */
export function buildPlatformMeta(link: ProfileSocialLink): Platform {
  const displayName = getSocialPlatformLabel(link.platform as SocialPlatform);
  const category: PlatformType =
    (link.platformType as PlatformType | null | undefined) ??
    getPlatformCategory(link.platform);
  return {
    id: link.platform,
    name: displayName,
    category,
    icon: link.platform,
    color: '#000000',
    placeholder: link.url,
  };
}

/**
 * Convert a database link to a DetectedLink with extended metadata
 *
 * @param link - The database link to convert
 * @returns DetectedLink with extended metadata
 */
export function convertDbLinkToDetected(
  link: ProfileSocialLink
): DetectedLink & {
  id: string;
  state?: 'active' | 'suggested' | 'rejected';
  confidence?: number | null;
  sourcePlatform?: string | null;
  sourceType?: 'manual' | 'admin' | 'ingested' | null;
  evidence?: { sources?: string[]; signals?: string[] } | null;
} {
  const platform = buildPlatformMeta(link);
  const title = link.displayText || platform.name;
  return {
    // DetectedLink fields
    platform,
    normalizedUrl: link.url,
    originalUrl: link.url,
    suggestedTitle: title,
    isValid: true,
    // Extended metadata
    id: link.id,
    state: link.state ?? 'active',
    confidence:
      typeof link.confidence === 'number'
        ? link.confidence
        : Number.parseFloat(String(link.confidence ?? '0')) || null,
    sourcePlatform: link.sourcePlatform ?? null,
    sourceType: link.sourceType ?? null,
    evidence: link.evidence ?? null,
  };
}

/**
 * Convert database links to LinkItem format
 *
 * @param dbLinks - Array of database links
 * @returns Array of LinkItems
 */
export function convertDbLinksToLinkItems(
  dbLinks: ProfileSocialLink[] = []
): LinkItem[] {
  return dbLinks.map((link, index) => {
    const detected = convertDbLinkToDetected(link);
    const platformMeta = buildPlatformMeta(link);
    const order = typeof link.sortOrder === 'number' ? link.sortOrder : index;
    const isVisible = link.isActive ?? true;
    const category = platformMeta.category;

    const item: LinkItem = {
      id: detected.id,
      title: detected.suggestedTitle,
      url: detected.normalizedUrl,
      platform: platformMeta,
      isVisible,
      order,
      category,
      normalizedUrl: detected.normalizedUrl,
      originalUrl: detected.originalUrl,
      suggestedTitle: detected.suggestedTitle,
      isValid: detected.isValid,
      state: detected.state,
      confidence: detected.confidence ?? null,
      sourcePlatform: detected.sourcePlatform ?? null,
      sourceType: detected.sourceType ?? null,
      evidence: detected.evidence ?? null,
      version: link.version ?? 1,
    };

    return item;
  });
}

/**
 * Convert database links to suggestion format
 *
 * @param dbLinks - Array of database links
 * @returns Array of SuggestedLinks
 */
export function convertDbLinksToSuggestions(
  dbLinks: ProfileSocialLink[] = []
): SuggestedLink[] {
  return dbLinks.map(link => {
    const detected = convertDbLinkToDetected(link);
    return {
      ...detected,
      suggestionId: link.id,
    };
  });
}

/**
 * Check if two LinkItems have equal key properties
 * @internal Used by areLinkItemsEqual
 */
function areSingleLinkItemsEqual(
  left: LinkItem,
  right: LinkItem | undefined
): boolean {
  if (!right) return false;
  return (
    left.id === right.id &&
    left.normalizedUrl === right.normalizedUrl &&
    left.originalUrl === right.originalUrl &&
    left.isVisible === right.isVisible &&
    left.category === right.category &&
    left.platform.id === right.platform.id
  );
}

/**
 * Check if two LinkItem arrays are equal
 *
 * Used for optimistic update comparison to avoid unnecessary re-renders.
 *
 * @param a - First array of LinkItems
 * @param b - Second array of LinkItems
 * @returns True if arrays are equal
 */
export function areLinkItemsEqual(a: LinkItem[], b: LinkItem[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((left, i) => areSingleLinkItemsEqual(left, b[i]));
}

/**
 * Check if two SuggestedLink arrays are equal
 *
 * @param a - First array of SuggestedLinks
 * @param b - Second array of SuggestedLinks
 * @returns True if arrays are equal
 */
export function areSuggestionListsEqual(
  a: SuggestedLink[],
  b: SuggestedLink[]
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;

  const serialize = (list: SuggestedLink[]) =>
    list
      .map(
        item =>
          `${item.suggestionId ?? item.normalizedUrl}:${item.platform.id}:${item.normalizedUrl}`
      )
      .sort((a, b) => a.localeCompare(b));

  const aSig = serialize(a);
  const bSig = serialize(b);
  return aSig.every((value, index) => value === bSig[index]);
}

/**
 * Map a PlatformType to dashboard preview category
 *
 * @param category - The platform type category
 * @returns Dashboard preview category or undefined
 */
export function mapCategoryForPreview(
  category: PlatformType
): 'social' | 'music' | 'commerce' | 'other' | undefined {
  switch (category) {
    case 'dsp':
      return 'music';
    case 'social':
      return 'social';
    case 'earnings':
      return 'commerce';
    case 'custom':
      return 'other';
    default:
      return undefined;
  }
}

/**
 * Convert LinkItems to dashboard preview format
 *
 * @param links - Array of LinkItems
 * @returns Array of preview-compatible link objects
 */
export function convertLinksToDashboardFormat(links: LinkItem[]) {
  return links.map(link => ({
    id: link.id,
    title: link.title,
    url: link.normalizedUrl,
    platform: link.platform.id as
      | 'instagram'
      | 'twitter'
      | 'tiktok'
      | 'youtube'
      | 'spotify'
      | 'applemusic'
      | 'custom',
    isVisible: link.isVisible,
    category: mapCategoryForPreview(link.category),
  }));
}

/**
 * Helper: Extract extended metadata from DetectedLink
 * @internal Used by convertDetectedLinksToLinkItems
 */
function extractLinkMetadata(link: DetectedLink) {
  const meta = link as unknown as {
    id?: string;
    state?: 'active' | 'suggested' | 'rejected';
    confidence?: number | null;
    sourcePlatform?: string | null;
    sourceType?: 'manual' | 'admin' | 'ingested' | null;
    evidence?: { sources?: string[]; signals?: string[] } | null;
  };
  return meta;
}

/**
 * Helper: Extract visibility from DetectedLink
 * @internal Used by convertDetectedLinksToLinkItems
 */
function extractLinkVisibility(link: DetectedLink): boolean {
  const rawVisibility = (link as unknown as { isVisible?: boolean }).isVisible;
  return rawVisibility ?? true;
}

/**
 * Helper: Extract category from DetectedLink platform
 * @internal Used by convertDetectedLinksToLinkItems
 */
function extractLinkCategory(link: DetectedLink): PlatformType {
  const rawCategory = link.platform.category as PlatformType | undefined;
  return rawCategory ?? 'custom';
}

/**
 * Helper: Generate link ID from metadata
 * @internal Used by convertDetectedLinksToLinkItems
 */
function generateLinkId(
  metaId: string | undefined,
  platformId: string,
  category: PlatformType,
  normalizedUrl: string,
  originalUrl: string
): string {
  const idBase = normalizedUrl || originalUrl;
  return metaId || `${platformId}::${category}::${idBase}`;
}

/**
 * Convert DetectedLink array to LinkItem array
 *
 * Used when receiving updates from GroupedLinksManager.
 *
 * @param updated - Array of DetectedLinks with optional metadata
 * @returns Array of LinkItems
 */
export function convertDetectedLinksToLinkItems(
  updated: DetectedLink[]
): LinkItem[] {
  return updated.map((link, index) => {
    const meta = extractLinkMetadata(link);
    const isVisible = extractLinkVisibility(link);
    const category = extractLinkCategory(link);
    const state = meta.state ?? (isVisible ? 'active' : 'suggested');

    return {
      id: generateLinkId(
        meta.id,
        link.platform.id,
        category,
        link.normalizedUrl,
        link.originalUrl
      ),
      title: link.suggestedTitle || link.platform.name,
      url: link.normalizedUrl,
      platform: {
        id: link.platform.id,
        name: link.platform.name,
        category,
        icon: link.platform.icon,
        color: `#${link.platform.color}`,
        placeholder: link.platform.placeholder,
      },
      isVisible,
      order: index,
      category,
      normalizedUrl: link.normalizedUrl,
      originalUrl: link.originalUrl,
      suggestedTitle: link.suggestedTitle,
      isValid: link.isValid,
      state,
      confidence: typeof meta.confidence === 'number' ? meta.confidence : null,
      sourcePlatform: meta.sourcePlatform ?? null,
      sourceType: meta.sourceType ?? null,
      evidence: meta.evidence ?? null,
    };
  });
}
