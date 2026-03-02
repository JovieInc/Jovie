import type { LegacySocialLink } from '@/types/db';

/**
 * Platform identifiers that map to referrer hostnames.
 * Used to detect which platform a visitor came from.
 */
const REFERRER_PLATFORM_MAP: Record<string, string> = {
  'instagram.com': 'instagram',
  'l.instagram.com': 'instagram',
  'www.instagram.com': 'instagram',
  'tiktok.com': 'tiktok',
  'www.tiktok.com': 'tiktok',
  'vm.tiktok.com': 'tiktok',
  'twitter.com': 'twitter',
  'x.com': 'twitter',
  't.co': 'twitter',
  'facebook.com': 'facebook',
  'www.facebook.com': 'facebook',
  'l.facebook.com': 'facebook',
  'lm.facebook.com': 'facebook',
  'youtube.com': 'youtube',
  'www.youtube.com': 'youtube',
  'youtu.be': 'youtube',
  'm.youtube.com': 'youtube',
  'linkedin.com': 'linkedin',
  'www.linkedin.com': 'linkedin',
  'discord.com': 'discord',
  'discord.gg': 'discord',
  'twitch.tv': 'twitch',
  'www.twitch.tv': 'twitch',
};

/**
 * UTM source values that map to platform identifiers.
 */
const UTM_SOURCE_PLATFORM_MAP: Record<string, string> = {
  instagram: 'instagram',
  ig: 'instagram',
  tiktok: 'tiktok',
  tt: 'tiktok',
  twitter: 'twitter',
  x: 'twitter',
  facebook: 'facebook',
  fb: 'facebook',
  youtube: 'youtube',
  yt: 'youtube',
  linkedin: 'linkedin',
  discord: 'discord',
  twitch: 'twitch',
};

/**
 * Platforms considered "action" links -- things visitors should do
 * (stream music, tip, buy merch). These are prioritized over social links.
 */
const ACTION_PLATFORMS = new Set([
  'venmo',
  'cashapp',
  'paypal',
  'website',
  'bandcamp',
  'merch',
  'store',
]);

/**
 * Cross-promotion pairs: if a visitor comes from platform A,
 * platform B should be surfaced (and vice versa).
 */
const CROSS_PROMOTE_PAIRS: Record<string, string[]> = {
  instagram: ['tiktok', 'youtube'],
  tiktok: ['instagram', 'youtube'],
  youtube: ['instagram', 'tiktok'],
  twitter: ['instagram', 'tiktok', 'youtube'],
  facebook: ['instagram', 'youtube'],
};

/**
 * Detect which platform the visitor came from using referrer or UTM params.
 * Returns the platform ID or null if unknown.
 */
export function detectSourcePlatform(
  referrer: string,
  searchParams: URLSearchParams
): string | null {
  // Check UTM source first (most explicit signal)
  const utmSource = searchParams.get('utm_source')?.toLowerCase();
  if (utmSource && UTM_SOURCE_PLATFORM_MAP[utmSource]) {
    return UTM_SOURCE_PLATFORM_MAP[utmSource];
  }

  // Check referrer hostname
  if (referrer) {
    try {
      const hostname = new URL(referrer).hostname;
      if (REFERRER_PLATFORM_MAP[hostname]) {
        return REFERRER_PLATFORM_MAP[hostname];
      }
    } catch {
      // Invalid referrer URL, skip
    }
  }

  return null;
}

/**
 * Filter and reorder social links based on the visitor's source platform.
 *
 * Rules:
 * 1. Hide the source platform (visitor from Instagram -> hide Instagram link)
 * 2. Prioritize action links (stream, tip, merch, website) over social links
 * 3. Surface cross-promotion alternatives (from Instagram -> show TikTok first)
 */
export function getContextAwareLinks(
  links: LegacySocialLink[],
  sourcePlatform: string | null
): LegacySocialLink[] {
  if (!sourcePlatform) return links;

  // Filter out the source platform
  const filtered = links.filter(link => {
    const platform = link.platform?.toLowerCase();
    return platform !== sourcePlatform;
  });

  // Sort: action links first, then cross-promoted platforms, then the rest
  const crossPromoted = new Set(CROSS_PROMOTE_PAIRS[sourcePlatform] ?? []);

  return filtered.sort((a, b) => {
    const aPlatform = a.platform?.toLowerCase() ?? '';
    const bPlatform = b.platform?.toLowerCase() ?? '';
    const aIsAction = ACTION_PLATFORMS.has(aPlatform);
    const bIsAction = ACTION_PLATFORMS.has(bPlatform);
    const aIsCross = crossPromoted.has(aPlatform);
    const bIsCross = crossPromoted.has(bPlatform);

    // Action links first
    if (aIsAction && !bIsAction) return -1;
    if (!aIsAction && bIsAction) return 1;

    // Cross-promoted platforms next
    if (aIsCross && !bIsCross) return -1;
    if (!aIsCross && bIsCross) return 1;

    return 0;
  });
}
