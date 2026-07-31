/**
 * Public-facing URL hygiene for profile/social links.
 * Suppresses malformed hrefs (e.g. bare hosts without a TLD like
 * `https://itstimwhite/`) before they reach the public profile UI.
 */

import { normalizeUrl } from '@/lib/utils/platform-detection';

const ALLOWED_SINGLE_LABEL_HOSTS = new Set(['localhost']);

/**
 * True when a URL is safe to render as a public external link.
 * Requires http(s) and a hostname with a TLD (or an allowlisted local host).
 */
export function isRenderablePublicUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    const host = parsed.hostname.toLowerCase();
    if (!host || host.includes(' ')) {
      return false;
    }

    if (ALLOWED_SINGLE_LABEL_HOSTS.has(host)) {
      return true;
    }

    // Require at least one dot so bare labels (`itstimwhite`) never ship.
    if (!host.includes('.')) {
      return false;
    }

    // Reject leading/trailing dots and empty labels.
    if (host.startsWith('.') || host.endsWith('.') || host.includes('..')) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Normalize then validate a raw URL for public href use.
 * Returns null when the value should be suppressed.
 */
export function sanitizePublicHref(
  raw: string | null | undefined
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const normalized = normalizeUrl(trimmed);
  if (!isRenderablePublicUrl(normalized)) {
    return null;
  }

  return normalized;
}

const PAYMENT_SUPPORT_PLATFORMS = new Set([
  'venmo',
  'cashapp',
  'cash_app',
  'paypal',
  'ko-fi',
  'kofi',
  'buymeacoffee',
  'patreon',
]);

/** Payment/support platforms belong in tip/support, not Follow. */
export function isPaymentSupportPlatform(
  platform: string | null | undefined
): boolean {
  if (!platform) return false;
  return PAYMENT_SUPPORT_PLATFORMS.has(platform.toLowerCase());
}

/**
 * Accessible name for a public social/support/website control.
 */
export function publicLinkAriaLabel(
  artistName: string,
  platform: string,
  label: string
): string {
  const key = platform.toLowerCase();
  if (key === 'website') {
    return `Visit ${artistName}'s website`;
  }
  if (isPaymentSupportPlatform(key)) {
    return `Support ${artistName} on ${label}`;
  }
  return `Follow ${artistName} on ${label}`;
}
