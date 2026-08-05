'use server';

import { and, eq, inArray, isNull } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';

import {
  markProfileHasAudienceBlocks,
  markProfileHasNoAudienceBlocks,
  markProfileVisitorAllowed,
} from '@/lib/audience/public-profile-block';
import { getSessionContext } from '@/lib/auth/session';
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
  const { user } = await getSessionContext();

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
      profileUsername: creatorProfiles.username,
    })
    .from(audienceMembers)
    .innerJoin(
      creatorProfiles,
      eq(audienceMembers.creatorProfileId, creatorProfiles.id)
    )
    .where(
      and(
        eq(audienceMembers.id, audienceMemberId),
        eq(creatorProfiles.userId, user.id)
      )
    )
    .limit(1);

  if (!member[0]) throw new Error('Member not found');

  const { member: m, profileId, profileUsername } = member[0];

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

  if (profileUsername) {
    // Await the shared cache write before reporting success. Repeated block
    // requests also repair a previously interrupted cache mutation.
    await markProfileHasAudienceBlocks(profileUsername, m.fingerprint);
  }

  if (!result[0]) {
    // Already blocked — not an error, just a no-op after cache reconciliation.
    return;
  }

  revalidateTag(createAudienceDataTag(profileId), 'max');
}

/**
 * Unblock a previously blocked visitor. Sets unblockedAt (soft unblock)
 * to preserve block history.
 */
export async function unblockAudienceMember(blockId: string) {
  const { user } = await getSessionContext();

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
            .where(eq(creatorProfiles.userId, user.id))
        )
      )
    )
    .returning({
      fingerprint: audienceBlocks.fingerprint,
      profileId: audienceBlocks.creatorProfileId,
    });

  if (!result[0]) {
    throw new Error('Block not found');
  }

  revalidateTag(createAudienceDataTag(result[0].profileId), 'max');

  const [profile] = await db
    .select({ username: creatorProfiles.username })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, result[0].profileId))
    .limit(1);

  const remainingBlocks = await db
    .select({ id: audienceBlocks.id })
    .from(audienceBlocks)
    .where(
      and(
        eq(audienceBlocks.creatorProfileId, result[0].profileId),
        isNull(audienceBlocks.unblockedAt)
      )
    )
    .limit(1);

  if (profile?.username) {
    if (remainingBlocks.length === 0) {
      await markProfileHasNoAudienceBlocks(
        profile.username,
        result[0].fingerprint
      );
    } else {
      await Promise.all([
        markProfileHasAudienceBlocks(profile.username),
        markProfileVisitorAllowed(profile.username, result[0].fingerprint),
      ]);
    }
  }
}
