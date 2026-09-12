import 'server-only';

import { and, desc, eq, ne } from 'drizzle-orm';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import {
  decideOpaqueInternalProfileUsername,
  isCanonicalPublicProfileHandle,
  isOpaqueInternalProfileHandle,
  normalizePublicProfileHandle,
  type OpaqueInternalProfileDecision,
} from './opaque-internal-profile-handle';

export async function findCanonicalHandleForOpaqueProfile(
  username: string
): Promise<string | null> {
  const normalized = normalizePublicProfileHandle(username);
  if (!isOpaqueInternalProfileHandle(normalized)) {
    return null;
  }

  const [opaque] = await db
    .select({
      id: creatorProfiles.id,
      spotifyId: creatorProfiles.spotifyId,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.usernameNormalized, normalized))
    .limit(1);

  const spotifyId = opaque?.spotifyId?.trim();
  if (!opaque || !spotifyId) {
    return null;
  }

  const twins = await db
    .select({
      username: creatorProfiles.usernameNormalized,
      isClaimed: creatorProfiles.isClaimed,
    })
    .from(creatorProfiles)
    .where(
      and(
        eq(creatorProfiles.spotifyId, spotifyId),
        eq(creatorProfiles.isPublic, true),
        ne(creatorProfiles.id, opaque.id)
      )
    )
    .orderBy(
      desc(creatorProfiles.isClaimed),
      creatorProfiles.usernameNormalized
    )
    .limit(20);

  return (
    twins.find(row => isCanonicalPublicProfileHandle(row.username))?.username ??
    null
  );
}

export async function resolveOpaqueInternalProfileUsername(
  username: string
): Promise<OpaqueInternalProfileDecision> {
  if (!isOpaqueInternalProfileHandle(username)) {
    return { action: 'serve' };
  }

  const canonicalHandle = await findCanonicalHandleForOpaqueProfile(username);
  return decideOpaqueInternalProfileUsername({ username, canonicalHandle });
}
