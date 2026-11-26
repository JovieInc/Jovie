/** Domain-routed DB adapter for you-proof seed. */

import { and, eq } from 'drizzle-orm';
import {
  invalidateProfileCache,
  invalidateSocialLinksCache,
} from '@/lib/cache/profile';
import type { DbType } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { socialLinks } from '@/lib/db/schema/links';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { updateProfileById } from '@/lib/services/profile/mutations';
import type { ProfileUpdateData } from '@/lib/services/profile/types';
import { createLink } from '@/lib/services/social-links/mutations';
import { YOU_PROOF_HANDLE } from './you-proof-fixture';
import type { YouProofSeedStore, YouProofSeedValue } from './you-proof-seed';

export type YouProofDb = DbType;

export function profileSetToUpdateData(
  set: Readonly<Record<string, YouProofSeedValue>>
): ProfileUpdateData {
  const updates: ProfileUpdateData = {};
  if (set.username != null) updates.username = String(set.username);
  if (set.username_normalized != null) {
    updates.usernameNormalized = String(set.username_normalized);
  }
  if (set.display_name !== undefined) {
    updates.displayName = set.display_name as string | undefined;
  }
  if (set.bio !== undefined) updates.bio = set.bio as string | undefined;
  if (set.is_public !== undefined) updates.isPublic = Boolean(set.is_public);
  return updates;
}

function mapRow(
  row: Record<string, unknown>,
  ownerEmailFallback?: string
): {
  profileId: string;
  ownerEmail: string | null;
  username: string | null;
  displayName: string | null;
  bio: string | null;
  isPublic: boolean | null;
  isClaimed: boolean | null;
} {
  return {
    profileId: String(row.profileId),
    ownerEmail: (row.ownerEmail as string | null) ?? ownerEmailFallback ?? null,
    username: (row.username as string | null) ?? null,
    displayName: (row.displayName as string | null) ?? null,
    bio: (row.bio as string | null) ?? null,
    isPublic: (row.isPublic as boolean | null) ?? null,
    isClaimed: (row.isClaimed as boolean | null) ?? null,
  };
}

export function createYouProofDbStore(database: YouProofDb): YouProofSeedStore {
  return {
    async loadHandleRow() {
      const [row] = await database
        .select({
          profileId: creatorProfiles.id,
          username: creatorProfiles.username,
          displayName: creatorProfiles.displayName,
          bio: creatorProfiles.bio,
          isPublic: creatorProfiles.isPublic,
          isClaimed: creatorProfiles.isClaimed,
          ownerEmail: users.email,
        })
        .from(creatorProfiles)
        .leftJoin(users, eq(users.id, creatorProfiles.userId))
        .where(eq(creatorProfiles.usernameNormalized, YOU_PROOF_HANDLE))
        .limit(1);
      return row ? mapRow(row) : null;
    },
    async loadOwnerProfile(ownerEmail) {
      const [row] = await database
        .select({
          profileId: creatorProfiles.id,
          ownerEmail: users.email,
          username: creatorProfiles.username,
          displayName: creatorProfiles.displayName,
          bio: creatorProfiles.bio,
          isPublic: creatorProfiles.isPublic,
          isClaimed: creatorProfiles.isClaimed,
        })
        .from(users)
        .leftJoin(creatorProfiles, eq(creatorProfiles.userId, users.id))
        .where(eq(users.email, ownerEmail))
        .limit(1);
      if (!row?.profileId) return null;
      return mapRow(row, ownerEmail) as {
        profileId: string;
        ownerEmail: string;
        username: string | null;
        displayName: string | null;
        bio: string | null;
        isPublic: boolean | null;
        isClaimed: boolean | null;
      };
    },
    async loadSocialPlatforms(profileId) {
      const rows = await database
        .select({ platform: socialLinks.platform })
        .from(socialLinks)
        .where(
          and(
            eq(socialLinks.creatorProfileId, profileId),
            eq(socialLinks.isActive, true),
            eq(socialLinks.state, 'active')
          )
        );
      return new Set(rows.map(row => String(row.platform)));
    },
    async updateProfile(profileId, set) {
      const updates = profileSetToUpdateData(set);
      if (Object.keys(updates).length === 0) return;
      await updateProfileById(profileId, updates);
    },
    async insertSocialLink(input) {
      await createLink(input.profileId, {
        platform: input.platform,
        platformType: input.platformType,
        url: input.url,
        displayText: input.displayText,
        sortOrder: input.sortOrder,
        isActive: true,
        state: 'active',
        sourceType: 'manual',
      });
      await invalidateSocialLinksCache(input.profileId, YOU_PROOF_HANDLE);
      await invalidateProfileCache(YOU_PROOF_HANDLE);
    },
  };
}
