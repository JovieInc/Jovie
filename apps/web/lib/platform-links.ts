import {
  type DSPConfig,
  GENERIC_PLATFORM_LINK_CONFIG,
} from '@/lib/dsp-registry';

/**
 * Platform link — the canonical link model.
 *
 * A platform link is a URL plus a human-readable label. Known providers
 * (Spotify, Apple Music, …) are one source of links — each may attach its
 * brand `config` — but the link model itself is generic: a link to any
 * platform renders with a label even when it is not in the DSP registry.
 */

export interface PlatformLink {
  /**
   * Stable identifier used for de-duping, React keys, and saved
   * preferences. Equals the DSP registry key for known providers;
   * `link_<slug>` for generic platform links.
   */
  key: string;
  /** Human-readable label, e.g. "Spotify" or "Discord". */
  name: string;
  /** Destination URL. */
  url: string;
  /** Visual config — brand config for known providers, generic fallback otherwise. */
  config: DSPConfig;
  /** DSP registry key when this link maps to a known provider; null for generic links. */
  platformKey?: string | null;
}

export { GENERIC_PLATFORM_LINK_CONFIG } from '@/lib/dsp-registry';

/** Normalize a platform name or host to a lowercase alphanumeric slug. */
export function normalizePlatformSlug(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '_')
    .replaceAll(/^_+|_+$/g, '');
}

function prettifySlug(slug: string): string {
  return slug
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map(word => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

function hostnameOf(url: string): string | null {
  try {
    const host = new URL(url.trim()).hostname.toLowerCase();
    return host.startsWith('www.') ? host.slice(4) : host;
  } catch {
    return null;
  }
}

/**
 * Derive a display label for a platform link: prettified platform name when
 * known, otherwise the site hostname (e.g. "Discord" for discord.gg).
 */
export function platformLinkLabel(
  platform: string | null | undefined,
  url: string
): string {
  const slug = platform ? normalizePlatformSlug(platform) : '';
  if (slug) return prettifySlug(slug);

  const host = hostnameOf(url);
  if (host) return prettifySlug(host.split('.')[0]);

  return 'Link';
}

/**
 * Build a generic platform link (URL + label) for a platform that is not in
 * the DSP registry. Returns null when the URL is not a valid http(s) URL.
 */
export function toGenericPlatformLink(
  platform: string | null | undefined,
  url: string | null | undefined
): PlatformLink | null {
  if (!url?.trim()) return null;

  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }

  const slug = platform ? normalizePlatformSlug(platform) : '';
  const hostSlug = (hostnameOf(url) ?? 'link').split('.')[0];
  const key = `link_${slug || normalizePlatformSlug(hostSlug) || 'link'}`;

  return {
    key,
    name: platformLinkLabel(platform, url),
    url: url.trim(),
    config: GENERIC_PLATFORM_LINK_CONFIG,
    platformKey: null,
  };
}
