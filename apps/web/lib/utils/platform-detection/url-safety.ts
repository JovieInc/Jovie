/**
 * Dangerous URL schemes that should be rejected
 */
const DANGEROUS_SCHEMES = [
  'javascript:', // NOSONAR (S5334) - Security blocklist: explicitly blocks javascript: URIs to prevent XSS
  'data:',
  'vbscript:',
  'file:',
  'mailto:',
];

/**
 * Pattern to detect encoded control characters
 */
const ENCODED_CONTROL_PATTERN = /%(0a|0d|09|00)/i;

/**
 * Check if a URL contains dangerous schemes or encoded control characters
 */
export function isUnsafeUrl(url: string): boolean {
  const lowered = url.trim().toLowerCase();

  if (DANGEROUS_SCHEMES.some(scheme => lowered.startsWith(scheme))) {
    return true;
  }

  if (ENCODED_CONTROL_PATTERN.test(lowered)) {
    return true;
  }

  return false;
}
