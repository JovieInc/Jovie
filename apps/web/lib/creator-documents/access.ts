import 'server-only';

import { and, eq } from 'drizzle-orm';
import { getExactProfileAccess } from '@/lib/auth/profile-access';
import { UnauthorizedSessionError } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { userProfileClaims } from '@/lib/db/schema/profiles';

export async function requireCreatorDocumentAccess(input: {
  readonly userId: string;
  readonly profileId: string;
  readonly ownerOnly?: boolean;
}): Promise<void> {
  const access = await getExactProfileAccess(db, input.userId, input.profileId);
  const claims = access.ok
    ? await db
        .select({ role: userProfileClaims.role })
        .from(userProfileClaims)
        .where(
          and(
            eq(userProfileClaims.creatorProfileId, input.profileId),
            eq(userProfileClaims.userId, input.userId)
          )
        )
        .limit(2)
    : [];
  const claim = claims.length === 1 ? claims[0] : null;
  if (!access.ok || !claim || (input.ownerOnly && claim.role !== 'owner')) {
    throw new UnauthorizedSessionError();
  }
}
