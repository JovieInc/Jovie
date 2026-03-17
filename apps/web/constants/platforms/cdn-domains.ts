/**
 * CDN Domain Registry — Single Source of Truth
 *
 * All image CDN domains for supported platforms, used by:
 * - avatar-hosts.ts (runtime hostname validation)
 * - content-security-policy.ts (CSP img-src directive)
 * - dsp-images.ts (DSP image optimization bypass)
 * - next.config.js (Next.js remotePatterns — inline copy, verified by sync test)
 *
 * When adding a new platform or CDN domain, update ONLY this file.
 * The sync test ensures all consumers stay in sync.
 */

import { ALL_PLATFORMS } from './data';

/**
 * CDN domains for each supported platform.
 *
 * Wildcard patterns: `*.domain.com` matches any subdomain of domain.com.
 * Exact domains: `cdn.example.com` matches only that hostname.
 *
 * Platforms with no known image CDN use an empty array.
 */
export const PLATFORM_CDN_DOMAINS: Record<string, readonly string[]> = {
  // ── Music DSPs ──────────────────────────────────────────────
  spotify: ['i.scdn.co', '*.scdn.co', '*.spotifycdn.com'],
  apple_music: ['*.mzstatic.com'],
  youtube_music: ['*.ytimg.com', '*.ggpht.com'],
  soundcloud: ['*.sndcdn.com'],
  bandcamp: ['*.bcbits.com'],
  tidal: ['*.tidal.com'],
  deezer: ['*.dzcdn.net'],
  amazon_music: ['m.media-amazon.com', '*.ssl-images-amazon.com'],
  pandora: ['*.sndimg.com', 'content-images.p-cdn.com'],
  beatport: ['geo-media.beatport.com'],

  // ── Social ──────────────────────────────────────────────────
  instagram: ['*.cdninstagram.com', '*.fbcdn.net'],
  twitter: ['*.twimg.com'],
  x: ['*.twimg.com'],
  tiktok: ['*.tiktokcdn.com', '*.tiktokcdn-us.com'],
  facebook: ['*.fbcdn.net', '*.fbsbx.com'],
  youtube: ['*.ytimg.com', '*.ggpht.com'],
  linkedin: ['*.licdn.com'],
  snapchat: ['*.sc-cdn.net'],
  pinterest: ['*.pinimg.com'],
  reddit: ['*.redd.it', '*.redditstatic.com'],

  // ── Creator ─────────────────────────────────────────────────
  twitch: ['*.jtvnw.net'],
  discord: ['cdn.discordapp.com'],
  patreon: ['*.patreonusercontent.com'],
  onlyfans: [],
  substack: ['*.substackcdn.com'],
  medium: ['miro.medium.com'],
  github: ['avatars.githubusercontent.com'],
  behance: ['mir-s3-cdn-cf.behance.net'],
  dribbble: ['cdn.dribbble.com'],

  // ── Link Aggregators (only Linktree serves images) ──────────
  linktree: ['linktr.ee', '*.linktr.ee'],
};

/**
 * Infrastructure image domains not tied to a specific platform.
 */
export const INFRASTRUCTURE_IMAGE_DOMAINS: readonly string[] = [
  // Jovie-managed storage
  '*.blob.vercel-storage.com',
  // Clerk / auth providers
  'img.clerk.com',
  'images.clerk.dev',
  // Common avatar providers
  '*.googleusercontent.com',
  '*.gravatar.com',
  'images.unsplash.com',
  // Utilities
  'api.qrserver.com',
  // Hosting / storage
  '*.supabase.co',
  '*.supabase.in',
  'vercel.live',
  'vercel.com',
];

/**
 * Categories whose platforms should have CDN domain entries.
 * Platforms in other categories (payment, messaging, professional)
 * generally don't serve user-facing images.
 */
const IMAGE_SERVING_CATEGORIES = new Set(['music', 'social', 'creator']);

// ── Derived helpers ───────────────────────────────────────────

/**
 * Returns a flat, deduplicated array of all wildcard domain patterns.
 * Used by avatar-hosts.ts for runtime hostname validation.
 */
export function getAllImageDomainPatterns(): string[] {
  const allDomains = [
    ...Object.values(PLATFORM_CDN_DOMAINS).flat(),
    ...INFRASTRUCTURE_IMAGE_DOMAINS,
  ];
  return [...new Set(allDomains)];
}

/**
 * Returns all domains prefixed with `https://` for CSP img-src.
 * Used by content-security-policy.ts.
 */
export function getCspImgSrcDomains(): string[] {
  return getAllImageDomainPatterns().map(d => `https://${d}`);
}

/**
 * Returns base domains (wildcards stripped) for music-category platforms.
 * Used by dsp-images.ts to detect DSP CDN images that should bypass optimization.
 */
export function getDspCdnDomains(): string[] {
  const musicPlatformIds: Set<string> = new Set(
    ALL_PLATFORMS.filter(p => p.category === 'music').map(p => p.id)
  );

  const domains = Object.entries(PLATFORM_CDN_DOMAINS)
    .filter(([id]) => musicPlatformIds.has(id))
    .flatMap(([, patterns]) =>
      patterns.map(p => (p.startsWith('*.') ? p.slice(2) : p))
    );

  return [...new Set(domains)];
}

/**
 * Returns the set of platform IDs that should have CDN domain entries.
 * Used by the sync test.
 */
export function getImageServingPlatformIds(): string[] {
  return ALL_PLATFORMS.filter(p =>
    IMAGE_SERVING_CATEGORIES.has(p.category)
  ).map(p => p.id);
}
