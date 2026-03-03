/**
 * Base Extraction Constants
 *
 * Shared constants for ingestion strategies.
 */

export const DEFAULT_TIMEOUT_MS = 10000;
export const DEFAULT_MAX_RETRIES = 2;
export const RETRY_DELAY_MS = 1000;
export const DEFAULT_USER_AGENT = 'jovie-link-ingestion/1.0 (+https://jov.ie)';
export const DEFAULT_MAX_RESPONSE_BYTES = 2_000_000;
export const MAX_REDIRECTS = 3;

// Common href extraction regex - matches href="..." with various quote styles
export const HREF_REGEX = /href\s*=\s*["']([^"'#]+)["']/gi;

// Common tracking parameters to strip
export const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  'igshid',
  '_ga',
  'ref',
  'source',
  'si', // Spotify tracking
  'nd', // Various tracking
]);

// Hosts that are primarily tracking/shorteners and should be skipped.
export const TRACKING_HOSTS = new Set<string>([
  'bit.ly',
  't.co',
  'lnkd.in',
  'rb.gy',
]);

// Unsupported URL schemes
export const UNSUPPORTED_SCHEMES = /^(javascript|data|vbscript|file|ftp):/i;
