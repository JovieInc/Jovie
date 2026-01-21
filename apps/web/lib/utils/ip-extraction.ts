/**
 * Client IP Extraction Utility
 *
 * Provides robust IP address extraction from HTTP headers with proper fallback chain.
 * Supports multiple proxy/CDN configurations (Cloudflare, Vercel, generic proxies).
 *
 * SECURITY CONSIDERATIONS:
 * - In Vercel deployments, x-real-ip and x-forwarded-for are set by Vercel's edge network
 * - Cloudflare deployments use cf-connecting-ip which is set by Cloudflare's edge
 * - The priority order ensures trusted proxy headers are checked first:
 *   1. cf-connecting-ip (set by Cloudflare edge, trusted when traffic routes through CF)
 *   2. x-real-ip (set by Vercel/nginx, trusted when behind reverse proxy)
 *   3. x-forwarded-for (most common, can be spoofed in direct connections)
 *
 * TRUST BOUNDARIES:
 * - These headers are ONLY trustworthy when traffic routes through the CDN/proxy
 * - Direct connections to the origin can spoof any of these headers
 * - Vercel and Cloudflare strip/override client-provided headers at the edge
 * - For security-critical decisions, ensure traffic cannot bypass the CDN
 *
 * IP Spoofing Protection:
 * - Direct connections (bypassing CDN) are rare in production deployments
 * - Rate limiting uses 'unknown' bucket for requests without valid IPs
 *
 * For maximum security in self-hosted deployments:
 * - Always deploy behind a trusted reverse proxy (nginx, Caddy)
 * - Configure proxy to override x-forwarded-for with actual client IP
 * - Block direct access to origin servers
 * - Never trust client-provided headers without proxy sanitization
 *
 * Usage:
 *   import { extractClientIP } from '@/lib/utils/ip-extraction'
 *
 *   const headers = await headers()
 *   const clientIP = extractClientIP(headers)
 */

/**
 * Validate if a string is a valid IPv4 or IPv6 address
 */
export function isValidIP(ip: string): boolean {
  // IPv4 validation
  const ipv4Regex =
    /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  if (ipv4Regex.test(ip)) {
    return true;
  }

  // IPv6 validation (simplified - covers most common formats)
  const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
  if (ipv6Regex.test(ip)) {
    return true;
  }

  // IPv6 compressed format (with ::)
  const ipv6CompressedRegex =
    /^((?:[0-9a-fA-F]{1,4}:)*)::((?:[0-9a-fA-F]{1,4}:)*)([0-9a-fA-F]{1,4})?$/;
  if (ipv6CompressedRegex.test(ip)) {
    return true;
  }

  return false;
}

/**
 * Extract client IP address from HTTP headers
 *
 * Priority order:
 * 1. cf-connecting-ip (Cloudflare)
 * 2. x-real-ip (nginx, some proxies)
 * 3. x-forwarded-for (most proxies, takes first IP)
 * 4. true-client-ip (Akamai, CloudFlare Enterprise)
 * 5. 'unknown' (if no valid IP found)
 *
 * @param headers - Next.js Headers object from headers()
 * @returns Valid IP address or 'unknown'
 */
export function extractClientIP(headers: Headers): string {
  // Priority 1: Cloudflare connecting IP (most reliable when using Cloudflare)
  const cfIP = headers.get('cf-connecting-ip');
  if (cfIP && isValidIP(cfIP)) {
    return cfIP;
  }

  // Priority 2: X-Real-IP (common with nginx reverse proxy)
  const realIP = headers.get('x-real-ip');
  if (realIP && isValidIP(realIP)) {
    return realIP;
  }

  // Priority 3: X-Forwarded-For (most common, but can be spoofed)
  // Take the first IP in the chain (original client)
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const firstIP = forwarded.split(',')[0].trim();
    if (isValidIP(firstIP)) {
      return firstIP;
    }
  }

  // Priority 4: True-Client-IP (Akamai, CloudFlare Enterprise)
  const trueClientIP = headers.get('true-client-ip');
  if (trueClientIP && isValidIP(trueClientIP)) {
    return trueClientIP;
  }

  // Fallback: No valid IP found
  // Return 'unknown' - rate limiting should still apply to this bucket
  return 'unknown';
}

/**
 * Extract client IP from request object (compatibility wrapper)
 *
 * @param request - Request object with headers property
 * @returns Valid IP address or 'unknown'
 */
export function extractClientIPFromRequest(request: {
  headers: Headers;
}): string {
  return extractClientIP(request.headers);
}
