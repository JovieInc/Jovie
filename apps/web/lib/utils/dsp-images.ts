/**
 * DSP Image Utilities
 *
 * Shared utilities for handling images from Digital Service Provider (DSP) CDNs.
 */

/**
 * Known DSP CDN domains that should bypass Next.js image optimization.
 *
 * These domains serve dynamically generated or already-optimized images
 * that don't benefit from additional optimization.
 */
const DSP_CDN_DOMAINS = [
  'i.scdn.co', // Spotify
  'mzstatic.com', // Apple Music
  'ytimg.com', // YouTube
  'dzcdn.net', // Deezer
  'sndcdn.com', // SoundCloud
  'tidal.com', // Tidal
  'images.genius.com', // Genius
] as const;

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
