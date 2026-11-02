/**
 * Browser-safe alias recovery helpers.
 *
 * Edge redirects stay in `legacy-profile-alias-redirects.js` so next.config
 * can require them. That module is CommonJS. Storybook's browser runner treats
 * the import as ESM and does not see `module.exports` names, which fails
 * AliasCollisionRecovery.stories.tsx. Keep these helpers as real named ESM
 * exports. Slugs, the hold cookie, and the hash key stay aligned with the
 * redirect module; the recovery test locks that.
 */

export const LEGACY_PROFILE_ALIAS_CONTENT_COOKIE = 'jovie_alias_content';
export const LEGACY_PROFILE_ALIAS_HASH_KEY = 'alias';

const LEGACY_PROFILE_ALIAS_HOLD_MAX_AGE_SECONDS = 300;

export const LEGACY_PROFILE_ALIAS_SLUGS = [
  'listen',
  'music',
  'releases',
  'subscribe',
  'tip',
  'tour',
  'shows',
  'events',
  'contact',
] as const;

const SAFE_SEGMENT = /^[a-zA-Z0-9._-]+$/;

const legacyProfileAliasSlugSet = new Set<string>(LEGACY_PROFILE_ALIAS_SLUGS);

export function isLegacyProfileAliasSlug(slug: string): boolean {
  return legacyProfileAliasSlugSet.has(slug);
}

export function readLegacyAliasHash(hash: string): string | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const alias = new URLSearchParams(raw).get(LEGACY_PROFILE_ALIAS_HASH_KEY);
  if (!alias || !isLegacyProfileAliasSlug(alias)) return null;
  return alias;
}

export function buildLegacyAliasHoldCookie(
  username: string,
  alias: string,
  secure: boolean
): string | null {
  if (!SAFE_SEGMENT.test(username) || !isLegacyProfileAliasSlug(alias)) {
    return null;
  }
  const secureAttribute = secure ? '; Secure' : '';
  return `${LEGACY_PROFILE_ALIAS_CONTENT_COOKIE}=1; Path=/${username}/${alias}; Max-Age=${LEGACY_PROFILE_ALIAS_HOLD_MAX_AGE_SECONDS}; SameSite=Lax${secureAttribute}`;
}

export function isSafeRenamedAliasLocation(location: string): boolean {
  return /^\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(location);
}
