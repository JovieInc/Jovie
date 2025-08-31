/**
 * Redirect URL validation utilities for auth flows
 * Prevents open redirect vulnerabilities by only allowing internal paths
 */

/**
 * Validates that a redirect URL is safe and internal to the application
 * @param redirectUrl - The URL to validate
 * @returns The validated URL if safe, null if invalid
 */
export function validateRedirectUrl(redirectUrl: string | null): string | null {
  if (!redirectUrl) {
    return null;
  }

  try {
    // Allow relative paths that start with /
    if (redirectUrl.startsWith('/')) {
      // Ensure it's not a protocol-relative URL (e.g., //evil.com)
      if (redirectUrl.startsWith('//')) {
        return null;
      }
      return redirectUrl;
    }

    // For absolute URLs, validate they're from our domain
    const url = new URL(redirectUrl);
    const allowedHosts = [
      'localhost',
      'jov.ie',
      'jovie.vercel.app',
      'preview.jov.ie',
    ];

    // Check if hostname ends with any allowed domain (for subdomains)
    const isAllowedHost = allowedHosts.some(
      (host) =>
        url.hostname === host ||
        url.hostname.endsWith('.' + host) ||
        url.hostname.endsWith('.jovie.vercel.app') // Vercel preview domains
    );

    if (!isAllowedHost) {
      return null;
    }

    // Only allow http/https protocols
    if (!['http:', 'https:'].includes(url.protocol)) {
      return null;
    }

    return url.toString();
  } catch {
    // Invalid URL format
    return null;
  }
}

/**
 * Gets a safe redirect URL with fallbacks
 * @param redirectUrl - Primary redirect URL to validate
 * @param artistId - Optional artist ID for legacy flow
 * @param defaultUrl - Fallback URL if no valid redirect is found
 * @returns A safe redirect URL
 */
export function getSafeRedirectUrl(
  redirectUrl: string | null,
  artistId: string | null = null,
  defaultUrl: string = '/dashboard'
): string {
  // First, try to validate the redirect URL
  const validRedirectUrl = validateRedirectUrl(redirectUrl);
  if (validRedirectUrl) {
    return validRedirectUrl;
  }

  // Fallback to artistId flow if available
  if (artistId) {
    return `/dashboard?artistId=${encodeURIComponent(artistId)}`;
  }

  // Final fallback
  return defaultUrl;
}