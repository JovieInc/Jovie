import { isLegacyProfileModeAlias } from '@/app/[username]/_lib/mode-route-redirect';

/**
 * Browser-safe legacy-alias helpers for the client collision-recovery flow.
 *
 * `lib/routing/legacy-profile-alias-redirects.js` is a CommonJS module whose
 * only sanctioned consumer is `next.config.js` (plain Node require). Vite
 * serves alias-resolved source modules raw, without CommonJS interop, so a
 * `'use client'` component importing named exports from that file breaks the
 * Storybook browser build ("does not provide the export named ..."). These
 * typed ESM copies are what client code imports instead.
 *
 * The values MUST stay identical to the CJS module's: the edge redirect's
 * bypass conditions key on the same cookie and hash this module writes. The
 * parity is pinned in AliasCollisionRecovery.test.tsx.
 */

export const LEGACY_ALIAS_CONTENT_COOKIE = 'jovie_alias_content';
export const LEGACY_ALIAS_HASH_KEY = 'alias';
export const LEGACY_ALIAS_HOLD_MAX_AGE_SECONDS = 300;

const SAFE_SEGMENT = /^[a-zA-Z0-9._-]+$/;

export function readLegacyAliasHash(hash: string): string | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const alias = new URLSearchParams(raw).get(LEGACY_ALIAS_HASH_KEY);
  if (!alias || !isLegacyProfileModeAlias(alias)) return null;
  return alias;
}

export function buildLegacyAliasHoldCookie(
  username: string,
  alias: string,
  secure?: boolean
): string | null {
  if (!SAFE_SEGMENT.test(username) || !isLegacyProfileModeAlias(alias)) {
    return null;
  }
  const secureAttribute = secure ? '; Secure' : '';
  return `${LEGACY_ALIAS_CONTENT_COOKIE}=1; Path=/${username}/${alias}; Max-Age=${LEGACY_ALIAS_HOLD_MAX_AGE_SECONDS}; SameSite=Lax${secureAttribute}`;
}

export function isSafeRenamedAliasLocation(location: string): boolean {
  return /^\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(location);
}
