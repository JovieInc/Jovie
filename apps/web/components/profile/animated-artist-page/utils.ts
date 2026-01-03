import type { LegacySocialLink } from '@/types/db';

/**
 * Extract Venmo username from a Venmo URL
 */
export function extractVenmoUsername(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const allowedVenmoHosts = ['venmo.com', 'www.venmo.com'];
    if (allowedVenmoHosts.includes(u.hostname)) {
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts[0] === 'u' && parts[1]) return parts[1];
      if (parts[0]) return parts[0];
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Find Venmo link from social links array
 */
export function findVenmoLink(socialLinks: LegacySocialLink[]): string | null {
  return socialLinks.find(l => l.platform === 'venmo')?.url || null;
}

/**
 * Default tip amounts
 */
export const TIP_AMOUNTS = [3, 5, 7] as const;
