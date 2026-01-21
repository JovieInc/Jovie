import { createHash } from 'node:crypto';

const ACTION_WEIGHTS: Record<string, number> = {
  listen: 3,
  social: 2,
  tip: 4,
  other: 1,
};

export function maskIpAddress(ip?: string | null): string {
  if (!ip) return 'unknown_ip';

  if (ip.includes(':')) {
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

export function createFingerprint(
  ip?: string | null,
  userAgent?: string | null
) {
  const maskedIp = maskIpAddress(ip);
  const ua = (userAgent || 'unknown_ua').slice(0, 128);
  const hash = createHash('sha256');
  hash.update(`${maskedIp}|${ua}`);
  return hash.digest('hex');
}

export function deriveIntentLevel(visits: number, actionCount: number) {
  if (visits >= 3 || actionCount >= 2) {
    return 'high' as const;
  }
  if (visits === 2 || actionCount === 1) {
    return 'medium' as const;
  }
  return 'low' as const;
}

export function getActionWeight(linkType?: string) {
  return ACTION_WEIGHTS[linkType ?? 'other'] ?? 1;
}

export function trimHistory<T>(items: T[], maxItems = 3) {
  return items.slice(0, maxItems);
}

/**
 * Hash an IP address for privacy-compliant storage.
 * Uses SHA-256 with a daily salt to prevent rainbow table attacks
 * while still allowing same-day deduplication.
 */
export function hashIpAddress(ip?: string | null): string | null {
  if (!ip) return null;

  // Daily salt based on UTC date - allows same-day deduplication
  const dailySalt = new Date().toISOString().split('T')[0];
  const hash = createHash('sha256');
  hash.update(`${dailySalt}:${ip}`);
  return hash.digest('hex');
}
