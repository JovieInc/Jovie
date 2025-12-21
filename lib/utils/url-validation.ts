/**
 * URL validation utilities for social links
 * Provides enhanced security validation beyond basic protocol checks
 */

// Private IP ranges (IANA reserved)
const PRIVATE_IP_PATTERNS = [
  // IPv4 private ranges
  /^127\./, // Loopback
  /^10\./, // Class A private
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Class B private
  /^192\.168\./, // Class C private
  /^169\.254\./, // Link-local
  /^0\./, // Current network
  // IPv6 patterns (simplified matching)
  /^::1$/, // Loopback
  /^fc[0-9a-f]{2}:/, // Unique local
  /^fd[0-9a-f]{2}:/, // Unique local
  /^fe80:/, // Link-local
  /^::ffff:(127\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.)/, // IPv4-mapped
];

// Blocked hostnames
const BLOCKED_HOSTNAMES = [
  'localhost',
  'localhost.localdomain',
  'local',
  'broadcasthost',
  'ip6-localhost',
  'ip6-loopback',
];

// Dangerous protocols that should never be allowed
const DANGEROUS_PROTOCOLS = [
  'javascript:',
  'data:',
  'vbscript:',
  'file:',
  'ftp:',
  'about:',
  'blob:',
];

// Max URL length to prevent DoS attacks
const MAX_URL_LENGTH = 2048;

export interface UrlValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Check if a hostname resolves to a private/internal IP
 */
function isPrivateHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();

  // Check blocked hostnames
  if (BLOCKED_HOSTNAMES.includes(lower)) {
    return true;
  }

  // Check if hostname looks like an IP address
  if (isPrivateIp(lower)) {
    return true;
  }

  return false;
}

/**
 * Check if a string is a private IP address
 */
function isPrivateIp(ip: string): boolean {
  return PRIVATE_IP_PATTERNS.some(pattern => pattern.test(ip));
}

/**
 * Validate a URL for use as a social link
 * Returns an error message if invalid, undefined if valid
 */
export function validateSocialLinkUrl(url: string): UrlValidationResult {
  // Check length
  if (url.length > MAX_URL_LENGTH) {
    return {
      valid: false,
      error: `URL exceeds maximum length of ${MAX_URL_LENGTH} characters`,
    };
  }

  // Parse the URL
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return {
      valid: false,
      error: 'Invalid URL format',
    };
  }

  const protocol = parsed.protocol.toLowerCase();

  // Check for dangerous protocols
  if (DANGEROUS_PROTOCOLS.includes(protocol)) {
    return {
      valid: false,
      error: `Invalid URL protocol: ${protocol}. Only http: and https: are allowed.`,
    };
  }

  // Only allow http and https
  if (protocol !== 'http:' && protocol !== 'https:') {
    return {
      valid: false,
      error: `Invalid URL protocol: ${protocol}. Only http: and https: are allowed.`,
    };
  }

  // Check for private/internal hostnames
  const hostname = parsed.hostname.toLowerCase();
  if (isPrivateHostname(hostname)) {
    return {
      valid: false,
      error: 'URLs pointing to internal/private addresses are not allowed',
    };
  }

  // Check for IP addresses that are private
  // This catches cases where someone uses an IP directly
  if (isPrivateIp(hostname)) {
    return {
      valid: false,
      error: 'URLs pointing to internal/private IP addresses are not allowed',
    };
  }

  // Check for common internal domains
  if (
    hostname.endsWith('.internal') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.localdomain')
  ) {
    return {
      valid: false,
      error: 'URLs pointing to internal domains are not allowed',
    };
  }

  // Check for metadata endpoints (cloud provider security)
  if (
    hostname === '169.254.169.254' || // AWS/GCP/Azure metadata
    hostname === 'metadata.google.internal' ||
    hostname.includes('metadata')
  ) {
    return {
      valid: false,
      error: 'URLs pointing to cloud metadata endpoints are not allowed',
    };
  }

  return { valid: true };
}

/**
 * Validate multiple URLs at once
 * Returns the first error found, or undefined if all valid
 */
export function validateSocialLinkUrls(
  urls: string[]
): UrlValidationResult & { index?: number } {
  for (let i = 0; i < urls.length; i++) {
    const result = validateSocialLinkUrl(urls[i]);
    if (!result.valid) {
      return { ...result, index: i };
    }
  }
  return { valid: true };
}
