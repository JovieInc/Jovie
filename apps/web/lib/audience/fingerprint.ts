/**
 * Audience fingerprinting utilities (edge-compatible).
 *
 * These helpers are used by the public profile audience block check in middleware
 * and mirror the logic in app/api/audience/lib/audience-utils.ts for consistency.
 *
 * Extracted from proxy.ts to keep the middleware file focused and to satisfy
 * separation of concerns (per CodeRabbit nits on proxy regions PR).
 */

import 'server-only';

/**
 * Mask an IP address for fingerprinting.
 * - IPv4: keep first 3 octets (e.g. 1.2.3.4 → 1.2.3.0)
 * - IPv6: keep first 4 groups
 * - Null/empty → 'unknown_ip'
 *
 * Mirrors maskIpAddress() in the audience API utils.
 * Edge-compatible (no Node.js dependencies).
 */
export function maskIpForFingerprint(ip: string | null): string {
  if (!ip) return 'unknown_ip';
  if (ip.includes(':')) {
    // IPv6: keep first 4 groups
    return ip
      .split(':')
      .slice(0, 4)
      .map(segment => segment || '0')
      .join(':');
  }
  const parts = ip.split('.');
  if (parts.length >= 3) {
    return `${parts.slice(0, 3).join('.')}.0`;
  }
  return ip;
}

/**
 * Create a visitor fingerprint using the Web Crypto API (edge runtime compatible).
 *
 * Produces a stable hex SHA-256 digest from (masked IP | truncated UA).
 * Matches the digest format of createFingerprint() in audience-utils.ts.
 *
 * @param ip - Raw IP (will be masked)
 * @param ua - User-Agent string (truncated to 128 chars for stability)
 */
export async function createFingerprintEdge(
  ip: string | null,
  ua: string | null
): Promise<string> {
  const maskedIp = maskIpForFingerprint(ip);
  const uaStr = (ua || 'unknown_ua').slice(0, 128);
  const input = `${maskedIp}|${uaStr}`;
  const encoded = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
