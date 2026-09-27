'use server';

/**
 * Record the artist's decision on the one-time Artist Presence upgrade offer
 * (JOV-6675). Called from the onboarding checkout client when the artist
 * accepts (starts checkout) or dismisses (continues free). The receipt is the
 * server-side funnel step that makes the offer once-only.
 */

import { and, eq } from 'drizzle-orm';
import { getCachedAuth } from '@/lib/auth/cached';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { recordOnboardingUpgradeOfferEvent } from '@/lib/onboarding/upgrade-offer';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function recordOnboardingUpgradeOfferDecision(
  profileId: string,
  decision: 'accepted' | 'dismissed',
  plan: string
): Promise<{ ok: boolean }> {
  const { userId } = await getCachedAuth();
  if (!userId || !UUID_PATTERN.test(profileId) || !plan) {
    return { ok: false };
  }

  const [profile] = await db
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .innerJoin(users, eq(users.id, creatorProfiles.userId))
    .where(
      and(
        eq(users.clerkId, userId),
        eq(creatorProfiles.id, profileId),
        eq(creatorProfiles.isClaimed, true)
      )
    )
    .limit(1);

  if (!profile) {
    return { ok: false };
  }

  const delivery = await recordOnboardingUpgradeOfferEvent(
    profile.id,
    decision,
    plan
  );
  return { ok: delivery.ok };
}
