'use server';

import { and, eq, inArray, isNull } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';

import { getCachedAuth } from '@/lib/auth/cached';
import { createAudienceDataTag } from '@/lib/cache/tags';
import { db } from '@/lib/db';
import { audienceBlocks, audienceMembers } from '@/lib/db/schema/analytics';
import { creatorProfiles } from '@/lib/db/schema/profiles';

/**
 * Block an audience member from viewing the creator's public profile.
 * Copies fingerprint, email, and display data into audience_blocks so the
 * block survives even if the audience member row is cleaned up.
 */
export async function blockAudienceMember(
  audienceMemberId: string,
  reason?: string
) {
  const { userId } = await getCachedAuth();
  if (!userId) throw new Error('Unauthorized');

  // Look up the audience member + verify ownership
  const member = await db
    .select({
      member: {
        id: audienceMembers.id,
        creatorProfileId: audienceMembers.creatorProfileId,
        fingerprint: audienceMembers.fingerprint,
        email: audienceMembers.email,
        displayName: audienceMembers.displayName,
        geoCity: audienceMembers.geoCity,
        geoCountry: audienceMembers.geoCountry,
      },
      profileId: creatorProfiles.id,
    })
    .from(audienceMembers)
    .innerJoin(
      creatorProfiles,
      eq(audienceMembers.creatorProfileId, creatorProfiles.id)
    )
    .where(
      and(
        eq(audienceMembers.id, audienceMemberId),
        eq(creatorProfiles.userId, userId)
      )
    )
    .limit(1);

  if (!member[0]) throw new Error('Member not found');

  const { member: m, profileId } = member[0];

  if (!m.fingerprint) {
    throw new Error(
      'Cannot block: this visitor has no identifying information on record'
    );
  }

  // Insert block with snapshotted display data
  const result = await db
    .insert(audienceBlocks)
    .values({
      creatorProfileId: m.creatorProfileId,
      audienceMemberId: m.id,
      fingerprint: m.fingerprint,
      email: m.email?.toLowerCase() ?? null,
      displayName: m.displayName,
      geoCity: m.geoCity,
      geoCountry: m.geoCountry,
      reason: reason || null,
    })
    .onConflictDoNothing() // partial unique index prevents duplicates
    .returning({ id: audienceBlocks.id });

  if (!result[0]) {
    // Already blocked — not an error, just a no-op
    return;
  }

  revalidateTag(createAudienceDataTag(profileId), 'max');
}

/**
 * Unblock a previously blocked visitor. Sets unblockedAt (soft unblock)
 * to preserve block history.
 */
export async function unblockAudienceMember(blockId: string) {
  const { userId } = await getCachedAuth();
  if (!userId) throw new Error('Unauthorized');

  // Verify ownership via subquery on creator_profiles
  const result = await db
    .update(audienceBlocks)
    .set({ unblockedAt: new Date() })
    .where(
      and(
        eq(audienceBlocks.id, blockId),
        isNull(audienceBlocks.unblockedAt),
        inArray(
          audienceBlocks.creatorProfileId,
          db
            .select({ id: creatorProfiles.id })
            .from(creatorProfiles)
            .where(eq(creatorProfiles.userId, userId))
        )
      )
    )
    .returning({ profileId: audienceBlocks.creatorProfileId });

  if (!result[0]) {
    throw new Error('Block not found');
  }

  revalidateTag(createAudienceDataTag(result[0].profileId), 'max');
}
