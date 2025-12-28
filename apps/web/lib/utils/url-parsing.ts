/**
 * URL Parsing and Validation Utilities
 * Includes SSRF protection for external URL validation
 */

/**
 * Check if a hostname is a private/internal IP or localhost
 * Protects against SSRF attacks
 */
function isPrivateOrLocalhost(hostname: string): boolean {
  // Normalize hostname
  const normalizedHost = hostname.toLowerCase();

  // Block localhost variants
  if (
    normalizedHost === 'localhost' ||
    normalizedHost === '127.0.0.1' ||
    normalizedHost === '[::1]' ||
    normalizedHost === '::1' ||
    normalizedHost.endsWith('.localhost') ||
    normalizedHost.endsWith('.local')
  ) {
    return true;
  }

  // Block private IPv4 ranges (RFC 1918)
  // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
  const ipv4Match = normalizedHost.match(
    /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
  );
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    // 10.x.x.x
    if (a === 10) return true;
    // 172.16.x.x - 172.31.x.x
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.168.x.x
    if (a === 192 && b === 168) return true;
    // 127.x.x.x (loopback)
    if (a === 127) return true;
    // 169.254.x.x (link-local)
    if (a === 169 && b === 254) return true;
    // 0.0.0.0
    if (a === 0) return true;
  }

  // Block IPv6 loopback and link-local
  if (
    normalizedHost.startsWith('[fe80:') ||
    normalizedHost.startsWith('[fc') ||
    normalizedHost.startsWith('[fd') ||
    normalizedHost === '[::1]'
  ) {
    return true;
  }

  // Block common internal hostnames
  const internalPatterns = [
    /^metadata\./i,
    /^169\.254\.169\.254$/, // AWS/GCP metadata
    /^metadata\.google\.internal$/i,
    /^kubernetes\.default/i,
  ];

  return internalPatterns.some(pattern => pattern.test(normalizedHost));
}

/**
 * Validates a URL for safe external use
 * Blocks SSRF attacks by rejecting internal/private URLs
 */
export function isValidUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);

    // Only allow http and https
    if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
      return false;
    }

    // Block private/internal addresses (SSRF protection)
    if (isPrivateOrLocalhost(urlObj.hostname)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Basic URL validation without SSRF checks
 * Use isValidUrl() for external URLs that need SSRF protection
 */
export function isValidUrlBasic(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
}

export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

export function sanitizeUrlForLogging(url: string): string {
  try {
    const urlObj = new URL(url);

    urlObj.searchParams.delete('token');
    urlObj.searchParams.delete('key');
    urlObj.searchParams.delete('auth');
    urlObj.searchParams.delete('password');
    urlObj.searchParams.delete('secret');

    return urlObj.toString();
  } catch {
    return '[Invalid URL]';
  }
}
