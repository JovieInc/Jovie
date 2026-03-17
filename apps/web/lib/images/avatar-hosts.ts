/**
 * Avatar host validation.
 *
 * Uses the canonical CDN domain registry as its data source.
 * @see constants/platforms/cdn-domains.ts
 */

import { getAllImageDomainPatterns } from '@/constants/platforms/cdn-domains';

const ALLOWED_AVATAR_HOST_PATTERNS = getAllImageDomainPatterns();

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
