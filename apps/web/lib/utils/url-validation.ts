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
  /^fc[0-9a-f]{2}:/i, // Unique local
  /^fd[0-9a-f]{2}:/i, // Unique local
  /^fe80:/i, // Link-local
  /^::ffff:(127\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.)/i, // IPv4-mapped
];

// Blocked hostnames
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'local',
  'broadcasthost',
  'ip6-localhost',
  'ip6-loopback',
]);

// Dangerous protocols that should never be allowed
const DANGEROUS_PROTOCOLS = new Set([
  'javascript:',
  'data:',
  'vbscript:',
  'file:',
  'ftp:',
  'about:',
  'blob:',
]);

/**
 * Maximum URL length to prevent DoS attacks via extremely long URLs.
 * 2048 is the practical limit for most browsers and servers.
 */
const MAX_URL_LENGTH = 2048;

export interface UrlValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Convert a decimal IP representation to dotted-quad format.
 * Example: 2130706433 -> "127.0.0.1"
 * Returns null if the input is not a valid decimal IP.
 */
function decimalToIp(decimal: string): string | null {
  const num = Number.parseInt(decimal, 10);
  if (Number.isNaN(num) || num < 0 || num > 4294967295) {
    return null;
  }
  return [
    (num >>> 24) & 255,
    (num >>> 16) & 255,
    (num >>> 8) & 255,
    num & 255,
  ].join('.');
}

/**
 * Extract IPv6 address from bracket notation.
 * Example: "[::1]" -> "::1"
 * Returns null if not bracket notation.
 */
function extractBracketedIpv6(hostname: string): string | null {
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    return hostname.slice(1, -1);
  }
  return null;
}

/**
 * Check if a hostname resolves to a private/internal IP
 */
function isPrivateHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();

  // Check blocked hostnames
  if (BLOCKED_HOSTNAMES.has(lower)) {
    return true;
  }

  // Check for IPv6 bracket notation (e.g., [::1])
  const bracketedIpv6 = extractBracketedIpv6(lower);
  if (bracketedIpv6 && isPrivateIp(bracketedIpv6)) {
    return true;
  }

  // Check if hostname is a decimal IP representation (e.g., 2130706433 = 127.0.0.1)
  if (/^\d+$/.test(lower)) {
    const dottedQuad = decimalToIp(lower);
    if (dottedQuad && isPrivateIp(dottedQuad)) {
      return true;
    }
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
 * Create validation error result.
 * Eliminates duplication in error return statements.
 */
function createValidationError(error: string): UrlValidationResult {
  return { valid: false, error };
}

/**
 * Internal domain suffixes that are not allowed.
 */
const INTERNAL_DOMAIN_SUFFIXES = [
  '.internal',
  '.local',
  '.localhost',
  '.localdomain',
];

/**
 * Cloud metadata endpoints to block (SSRF protection).
 */
const METADATA_PATTERNS = new Set([
  '169.254.169.254',
  'metadata.google.internal',
]);

/**
 * Validation rule with check function and error message.
 */
type ValidationRule = {
  check: (hostname: string, protocol: string) => boolean;
  error: string | ((protocol: string) => string);
};

/**
 * Table-driven validation rules for parsed URLs.
 * Each rule returns true if validation FAILS.
 */
const URL_VALIDATION_RULES: ValidationRule[] = [
  {
    check: (_, protocol) => DANGEROUS_PROTOCOLS.has(protocol),
    error: protocol =>
      `Invalid URL protocol: ${protocol}. Only http: and https: are allowed.`,
  },
  {
    check: (_, protocol) => protocol !== 'http:' && protocol !== 'https:',
    error: protocol =>
      `Invalid URL protocol: ${protocol}. Only http: and https: are allowed.`,
  },
  {
    check: hostname => isPrivateHostname(hostname),
    error: 'URLs pointing to internal/private addresses are not allowed',
  },
  {
    check: hostname =>
      INTERNAL_DOMAIN_SUFFIXES.some(suffix => hostname.endsWith(suffix)),
    error: 'URLs pointing to internal domains are not allowed',
  },
  {
    check: hostname => METADATA_PATTERNS.has(hostname),
    error: 'URLs pointing to cloud metadata endpoints are not allowed',
  },
];

/**
 * Validate a URL for use as a social link
 * Returns an error message if invalid, undefined if valid
 */
export function validateSocialLinkUrl(url: string): UrlValidationResult {
  // Check length
  if (url.length > MAX_URL_LENGTH) {
    return createValidationError(
      `URL exceeds maximum length of ${MAX_URL_LENGTH} characters`
    );
  }

  // Parse the URL
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return createValidationError('Invalid URL format');
  }

  const protocol = parsed.protocol.toLowerCase();
  const hostname = parsed.hostname.toLowerCase();

  // Run table-driven validation rules
  for (const rule of URL_VALIDATION_RULES) {
    if (rule.check(hostname, protocol)) {
      const errorMsg =
        typeof rule.error === 'function' ? rule.error(protocol) : rule.error;
      return createValidationError(errorMsg);
    }
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
