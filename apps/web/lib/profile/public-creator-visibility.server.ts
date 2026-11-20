import 'server-only';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { isOpaqueInternalProfileHandle } from '@/lib/profile/opaque-internal-profile-handle';
import { isPublicProfilePublished } from '@/lib/profile/public-profile-access';
import {
  isTestProfileDirectUrlExempt,
  shouldHideTestProfileFromDirectUrl,
} from '@/lib/profile/test-profile-policy';

function hasSyntheticTestFlag(settings: unknown): boolean {
  return (
    Boolean(settings) &&
    typeof settings === 'object' &&
    (settings as Record<string, unknown>).isSyntheticTestProfile === true
  );
}

export function isCreatorRowPubliclyVisible(row: {
  readonly handle: string;
  readonly isPublic: unknown;
  readonly settings?: unknown;
  readonly ownerEmail?: string | null;
}): boolean {
  if (!isPublicProfilePublished(row.isPublic)) return false;
  if (isOpaqueInternalProfileHandle(row.handle)) return false;
  if (
    hasSyntheticTestFlag(row.settings) &&
    !isTestProfileDirectUrlExempt({
      handle: row.handle,
      ownerEmail: row.ownerEmail,
      settings: row.settings,
    })
  ) {
    return false;
  }
  return !shouldHideTestProfileFromDirectUrl({
    handle: row.handle,
    ownerEmail: row.ownerEmail,
    settings: row.settings,
  });
}

export async function readPublicCreatorVisibilityByUsername(
  usernameNormalized: string
): Promise<{
  readonly id: string;
  readonly isClaimed: boolean | null;
} | null> {
  const [row] = await db
    .select({
      id: creatorProfiles.id,
      usernameNormalized: creatorProfiles.usernameNormalized,
      isPublic: creatorProfiles.isPublic,
      isClaimed: creatorProfiles.isClaimed,
      settings: creatorProfiles.settings,
      ownerEmail: users.email,
    })
    .from(creatorProfiles)
    .leftJoin(users, eq(users.id, creatorProfiles.userId))
    .where(eq(creatorProfiles.usernameNormalized, usernameNormalized))
    .limit(1);

  if (
    !row ||
    !isCreatorRowPubliclyVisible({
      handle: row.usernameNormalized,
      isPublic: row.isPublic,
      settings: row.settings,
      ownerEmail: row.ownerEmail,
    })
  ) {
    return null;
  }

  return { id: row.id, isClaimed: row.isClaimed };
}

export async function readPublicCreatorVisibilityById(
  profileId: string
): Promise<{
  readonly id: string;
  readonly username: string;
  readonly usernameNormalized: string;
  readonly isClaimed: boolean;
} | null> {
  const [row] = await db
    .select({
      id: creatorProfiles.id,
      username: creatorProfiles.username,
      usernameNormalized: creatorProfiles.usernameNormalized,
      isPublic: creatorProfiles.isPublic,
      isClaimed: creatorProfiles.isClaimed,
      settings: creatorProfiles.settings,
      ownerEmail: users.email,
    })
    .from(creatorProfiles)
    .leftJoin(users, eq(users.id, creatorProfiles.userId))
    .where(eq(creatorProfiles.id, profileId))
    .limit(1);

  if (
    !row ||
    !isCreatorRowPubliclyVisible({
      handle: row.usernameNormalized,
      isPublic: row.isPublic,
      settings: row.settings,
      ownerEmail: row.ownerEmail,
    })
  ) {
    return null;
  }

  return {
    id: row.id,
    username: row.username,
    usernameNormalized: row.usernameNormalized,
    isClaimed: Boolean(row.isClaimed),
  };
}
