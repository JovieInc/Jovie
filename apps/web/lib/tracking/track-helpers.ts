/**
 * Pure helper functions shared by /api/track, /api/px, and their tests.
 */

/**
 * Anonymize an IP address for privacy:
 * - IPv4: zero last octet (e.g. "1.2.3.4" -> "1.2.3.0")
 * - IPv6: truncate last 80 bits (zero last 5 groups)
 */
export function anonymizeIp(ip: string): string {
  if (ip.includes(':')) {
    // IPv6: split on '::' once, expand the gap to fill 8 groups, zero last 5
    const [left, right = ''] = ip.split('::');
    const leftParts = left ? left.split(':') : [];
    const rightParts = right ? right.split(':') : [];
    const missing = 8 - leftParts.length - rightParts.length;
    const full = [
      ...leftParts,
      ...Array(Math.max(0, missing)).fill('0000'),
      ...rightParts,
    ];
    return full.slice(0, 3).concat(['0', '0', '0', '0', '0']).join(':');
  }
  // IPv4: zero last octet
  const parts = ip.split('.');
  if (parts.length === 4) {
    parts[3] = '0';
    return parts.join('.');
  }
  return '0.0.0.0';
}

/**
 * Derive retargeting attribution source from UTM params.
 * Returns null when UTM params don't match a known retargeting pattern.
 */
export function deriveAttributionSource(
  utmParams: { utm_source?: string; utm_medium?: string } | null | undefined
): string | null {
  if (!utmParams?.utm_source || utmParams.utm_medium !== 'retargeting')
    return null;
  const src = utmParams.utm_source.toLowerCase();
  if (src === 'meta' || src === 'facebook') return 'retargeting_meta';
  if (src === 'google') return 'retargeting_google';
  if (src === 'tiktok') return 'retargeting_tiktok';
  return null;
}

/**
 * Determine health status for a platform based on its forwarding stats.
 */
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'inactive';

export function computeHealthStatus(
  totalSent: number,
  totalFailed: number,
  lastSuccessAt: Date | null
): HealthStatus {
  const total = totalSent + totalFailed;

  if (total === 0) {
    return 'inactive';
  }

  const now = Date.now();
  const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
  const seventyTwoHoursAgo = now - 72 * 60 * 60 * 1000;

  const failureRate = total > 0 ? totalFailed / total : 0;
  const lastSuccessMs = lastSuccessAt ? lastSuccessAt.getTime() : 0;

  if (totalSent === 0 || !lastSuccessAt) {
    return 'unhealthy';
  }

  if (lastSuccessMs >= twentyFourHoursAgo && failureRate < 0.1) {
    return 'healthy';
  }

  // Remaining: failureRate >= 10% or last success older than 24h
  if (lastSuccessMs >= seventyTwoHoursAgo) {
    return 'degraded';
  }
  return 'unhealthy';
}
