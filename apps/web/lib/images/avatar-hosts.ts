/**
 * Canonical allowlist for remote avatar image hosts.
 *
 * Keep this list in sync with `apps/web/next.config.js` image `remotePatterns`
 * and server-side avatar URL validation used by onboarding/admin flows.
 */

const ALLOWED_AVATAR_HOST_PATTERNS = [
  // Jovie-managed storage
  'blob.vercel-storage.com',
  '*.blob.vercel-storage.com',
  '*.public.blob.vercel-storage.com',

  // Clerk / auth providers
  'img.clerk.com',
  'images.clerk.dev',

  // Spotify and music CDNs
  'i.scdn.co',
  '*.scdn.co',
  '*.spotifycdn.com',
  '*.dzcdn.net',

  // Linktree profile images
  'linktr.ee',
  '*.linktr.ee',

  // Common social avatar CDNs
  'avatars.githubusercontent.com',
  '*.googleusercontent.com',
  'gravatar.com',
  'www.gravatar.com',
  'secure.gravatar.com',
  '*.fbcdn.net',
  '*.fbsbx.com',
  '*.twimg.com',
  'cdn.discordapp.com',

  // Existing trusted image sources
  'images.unsplash.com',
] as const;

export function isAllowedAvatarHostname(hostname: string): boolean {
  const normalizedHostname = hostname.trim().toLowerCase();

  return ALLOWED_AVATAR_HOST_PATTERNS.some(pattern => {
    if (pattern.startsWith('*.')) {
      const baseDomain = pattern.slice(2);
      return (
        normalizedHostname === baseDomain ||
        normalizedHostname.endsWith(`.${baseDomain}`)
      );
    }

    return normalizedHostname === pattern;
  });
}

export function getAllowedAvatarHostPatterns(): readonly string[] {
  return ALLOWED_AVATAR_HOST_PATTERNS;
}
