import type { LegacySocialLink } from '@/types/db';

export const ALLOWED_VENMO_HOSTS = new Set(['venmo.com', 'www.venmo.com']);

/** Validate that a URL points to a canonical Venmo host over HTTPS. */
export function isAllowedVenmoUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return (
      parsedUrl.protocol === 'https:' &&
      ALLOWED_VENMO_HOSTS.has(parsedUrl.hostname)
    );
  } catch {
    return false;
  }
}

export function extractVenmoUsername(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsedUrl = new URL(url);
    if (!ALLOWED_VENMO_HOSTS.has(parsedUrl.hostname)) {
      return null;
    }

    const parts = parsedUrl.pathname.split('/').filter(Boolean);
    if (parts[0] === 'u' && parts[1]) {
      return parts[1];
    }

    return parts[0] ?? null;
  } catch {
    return null;
  }
}

export function findVenmoLink(socialLinks: LegacySocialLink[]): string | null {
  return socialLinks.find(link => link.platform === 'venmo')?.url ?? null;
}
