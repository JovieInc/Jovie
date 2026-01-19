import type { ProviderKey } from './types';

/**
 * Normalize a base URL by removing trailing slashes.
 */
export function normalizeBaseUrl(baseUrl: string): string {
  if (!baseUrl) return '';
  return baseUrl.replace(/\/$/, '');
}

/**
 * Build the new canonical smartlink path.
 * Format: /{handle}/{slug}
 *
 * @param handle - The creator's username/handle
 * @param contentSlug - The release or track slug
 * @param provider - Optional provider to redirect directly to
 */
export function buildSmartLinkPath(
  handle: string,
  contentSlug: string,
  provider?: ProviderKey
): string {
  const basePath = `/${handle}/${contentSlug}`;
  const query = provider ? `?dsp=${encodeURIComponent(provider)}` : '';
  return `${basePath}${query}`;
}

/**
 * Build full smartlink URL.
 *
 * @param baseUrl - The base URL (e.g., https://jov.ie)
 * @param handle - The creator's username/handle
 * @param contentSlug - The release or track slug
 * @param provider - Optional provider to redirect directly to
 */
export function buildSmartLinkUrl(
  baseUrl: string,
  handle: string,
  contentSlug: string,
  provider?: ProviderKey
): string {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  return `${normalizedBase}${buildSmartLinkPath(handle, contentSlug, provider)}`;
}

/**
 * Build ISRC lookup path.
 * Format: /r/isrc/{isrc}
 *
 * This route redirects to the canonical URL for the track.
 */
export function buildIsrcLookupPath(isrc: string): string {
  // Normalize ISRC: remove dashes and uppercase
  const normalizedIsrc = isrc.replace(/-/g, '').toUpperCase();
  return `/r/isrc/${normalizedIsrc}`;
}

/**
 * Build ISRC lookup URL.
 */
export function buildIsrcLookupUrl(baseUrl: string, isrc: string): string {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  return `${normalizedBase}${buildIsrcLookupPath(isrc)}`;
}

// ============================================================================
// Legacy Functions (deprecated, kept for backwards compatibility)
// ============================================================================

/**
 * @deprecated Use buildSmartLinkPath with handle and slug instead.
 * This function is kept for backwards compatibility during migration.
 */
export function buildReleaseSlug(profileId: string, releaseId: string): string {
  return `${releaseId}--${profileId}`;
}

/**
 * @deprecated Use buildSmartLinkPath with handle and slug instead.
 * Legacy format: /r/{releaseSlug}--{profileId}
 */
export function buildLegacySmartLinkPath(
  slug: string,
  provider?: ProviderKey
): string {
  const query = provider ? `?provider=${encodeURIComponent(provider)}` : '';
  return `/r/${slug}${query}`;
}

/**
 * @deprecated Use buildSmartLinkUrl with handle and slug instead.
 */
export function buildLegacySmartLinkUrl(
  baseUrl: string,
  slug: string,
  provider?: ProviderKey
): string {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  return `${normalizedBase}${buildLegacySmartLinkPath(slug, provider)}`;
}

/**
 * Parse a legacy smart link slug to extract releaseSlug and profileId.
 * Format: {releaseSlug}--{profileId}
 */
export function parseLegacySmartLinkSlug(slug: string): {
  releaseSlug: string;
  profileId: string;
} | null {
  const separator = '--';
  const lastSeparatorIndex = slug.lastIndexOf(separator);

  if (lastSeparatorIndex === -1) {
    return null;
  }

  const releaseSlug = slug.slice(0, lastSeparatorIndex);
  const profileId = slug.slice(lastSeparatorIndex + separator.length);

  if (!releaseSlug || !profileId) {
    return null;
  }

  return { releaseSlug, profileId };
}
