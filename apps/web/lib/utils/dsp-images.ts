/**
 * DSP Image Utilities
 *
 * Shared utilities for handling images from Digital Service Provider (DSP) CDNs.
 * Domain list sourced from the canonical CDN domain registry.
 *
 * @see constants/platforms/cdn-domains.ts
 */

import { getDspCdnDomains } from '@/constants/platforms/cdn-domains';

/**
 * Known DSP CDN domains that should bypass Next.js image optimization.
 *
 * These domains serve dynamically generated or already-optimized images
 * that don't benefit from additional optimization.
 *
 * Sourced from music-category platforms in PLATFORM_CDN_DOMAINS.
 */
const DSP_CDN_DOMAINS = getDspCdnDomains();

/**
 * Checks if an image URL is from a known DSP CDN.
 *
 * Images from these CDNs should be served unoptimized as they are
 * either dynamically generated or already optimized by the provider.
 *
 * @param url - The image URL to check
 * @returns true if the URL is from a known DSP CDN
 *
 * @example
 * ```ts
 * isExternalDspImage('https://i.scdn.co/image/abc123') // true
 * isExternalDspImage('https://example.com/image.jpg') // false
 * ```
 */
export function isExternalDspImage(url: string | null | undefined): boolean {
  if (!url) return false;
  return DSP_CDN_DOMAINS.some(domain => url.includes(domain));
}

/**
 * Shared image optimization bypass for sources that do not benefit from
 * Next's image proxying during QA or production.
 */
export function shouldBypassImageOptimization(
  url: string | null | undefined
): boolean {
  if (!url) return false;
  if (isExternalDspImage(url)) return true;

  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === 'blob.vercel-storage.com' ||
      parsed.hostname.endsWith('.blob.vercel-storage.com')
    );
  } catch {
    return (
      url.includes('blob.vercel-storage.com') ||
      url.startsWith('/avatars/default-user')
    );
  }
}

export function isDefaultAvatarUrl(url: string | null | undefined): boolean {
  return typeof url === 'string' && url.startsWith('/avatars/default-user');
}
