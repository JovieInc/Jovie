import 'server-only';

import { createFingerprintEdge } from '@/lib/audience/fingerprint';

/**
 * Mirror extractClientIP() priority for the middleware audience-block check.
 */
export function getAudienceBlockIpFromHeaders(headers: Headers): string | null {
  return (
    headers.get('cf-connecting-ip') ||
    headers.get('x-real-ip') ||
    (headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    headers.get('true-client-ip') ||
    null
  );
}

/**
 * Check if a public profile visitor should be blocked.
 *
 * Uses a single JOIN query (creator_profiles x audience_blocks) so no round-trip
 * is wasted when the profile exists but the visitor isn't blocked.
 *
 * Fails open on any error. A blocked user slipping through once is preferable
 * to locking out all visitors during a DB hiccup.
 */
export async function checkProfileVisitorBlocked(
  username: string,
  ip: string | null,
  ua: string | null
): Promise<boolean> {
  if (process.env.NODE_ENV === 'test') return false;
  if (process.env.PUBLIC_NOAUTH_SMOKE === '1') return false;

  try {
    const fingerprint = await createFingerprintEdge(ip, ua);

    // Lazy imports keep DB modules out of middleware invocations that do not
    // hit a valid public-profile candidate.
    const { db } = await import('@/lib/db');
    const { and, eq, isNull } = await import('drizzle-orm');
    const { audienceBlocks } = await import('@/lib/db/schema/analytics');
    const { creatorProfiles } = await import('@/lib/db/schema/profiles');

    const [result] = await db
      .select({ blockId: audienceBlocks.id })
      .from(creatorProfiles)
      .innerJoin(
        audienceBlocks,
        eq(audienceBlocks.creatorProfileId, creatorProfiles.id)
      )
      .where(
        and(
          eq(creatorProfiles.username, username.toLowerCase()),
          eq(audienceBlocks.fingerprint, fingerprint),
          isNull(audienceBlocks.unblockedAt)
        )
      )
      .limit(1);

    return !!result;
  } catch {
    return false;
  }
}
