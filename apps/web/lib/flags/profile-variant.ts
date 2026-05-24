/**
 * ISR-safe profile variant resolver.
 *
 * This module intentionally bypasses the Vercel Flags SDK (`flag().run()`).
 * The Flags SDK calls `headers()` from `next/headers` inside `.run()` to
 * implement per-request evaluation caching — that dynamic API opts any RSC
 * that calls it into dynamic rendering, defeating ISR on /[username].
 *
 * Instead, this module calls the underlying Statsig helper directly, which
 * reads from the initialized Statsig server SDK without touching any Next.js
 * per-request APIs.
 *
 * Only use this from server components that must remain ISR-cacheable.
 * For cookie-backed override support and the Flags SDK devtools integration,
 * use lib/flags/server.ts (safe on dynamic routes like /api/*).
 */
import 'server-only';
import type { ProfileAlertOptInVariant } from './contracts';
import {
  getProfileAlertOptInVariantValue,
  getStatsigGateValue,
} from './statsig';

/**
 * Resolves the profile alert opt-in variant for a given stable ID.
 *
 * ISR-safe: calls the Statsig SDK directly without touching next/headers.
 *
 * @param stableId - The jv_aid cookie value (uuid), or null for ISR renders.
 *   Null resolves as the anonymous user and returns the flag's default ('button').
 */
export async function getProfileAlertOptInVariant(
  stableId: string | null
): Promise<ProfileAlertOptInVariant> {
  return getProfileAlertOptInVariantValue(stableId);
}

/**
 * Resolves the merch MVP gate without touching Next.js request APIs.
 *
 * Public profile pages use ISR, so the request-override aware flag helpers are
 * intentionally avoided here.
 */
export async function getMerchMvpEnabled(
  stableId: string | null
): Promise<boolean> {
  return getStatsigGateValue('MERCH_MVP', stableId);
}
