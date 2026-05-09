/**
 * ISR-safe profile variant resolver.
 *
 * This module intentionally does NOT import `cookies` from `next/headers`.
 * Importing that dynamic API would opt any RSC that imports this file into
 * dynamic rendering, defeating ISR on /[username].
 *
 * Only use this from server components that must remain ISR-cacheable.
 * For cookie-backed variant resolution (admin, dashboard), use lib/flags/server.ts.
 */
import 'server-only';
import type { ProfileAlertOptInVariant } from './contracts';
import { PROFILE_ALERT_OPTIN_VARIANT_FLAG } from './registry';

/**
 * Resolves the profile alert opt-in variant for a given stable ID.
 *
 * Safe to call from ISR-cached Server Components — no `cookies()` call
 * in this module or its transitive imports.
 *
 * @param stableId - The jv_aid cookie value (uuid), or null for ISR renders.
 *   Null returns the flag's default value ('button').
 */
export async function getProfileAlertOptInVariant(
  stableId: string | null
): Promise<ProfileAlertOptInVariant> {
  return PROFILE_ALERT_OPTIN_VARIANT_FLAG.run({
    identify: {
      userId: stableId,
    },
  });
}
