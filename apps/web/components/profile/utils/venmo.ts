import type { LegacySocialLink } from '@/types/db';

const ALLOWED_VENMO_HOSTS = new Set(['venmo.com', 'www.venmo.com']);

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
