import 'server-only';

import { withDbSessionTx } from '@/lib/auth/session';
import { verifyProfileOwnership } from '@/lib/db/queries/shared';

/**
 * Resolve profile ownership from trusted membership on a pinned RLS
 * transaction. Ignore any caller-supplied profile.userId.
 */
export async function requireOwnedReleaseProfile(profileId: string): Promise<{
  readonly userId: string;
  readonly profileId: string;
}> {
  return withDbSessionTx(async (tx, sessionUserId) => {
    const owned = await verifyProfileOwnership(tx, profileId, sessionUserId);
    if (!owned) {
      throw new Error('Unauthorized');
    }
    return { userId: sessionUserId, profileId: owned.id };
  });
}
