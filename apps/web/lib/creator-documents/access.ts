import 'server-only';

import { getExactProfileAccess } from '@/lib/auth/profile-access';
import { UnauthorizedSessionError } from '@/lib/auth/session';
import { db } from '@/lib/db';

export async function requireCreatorDocumentAccess(input: {
  readonly userId: string;
  readonly profileId: string;
  readonly ownerOnly?: boolean;
}): Promise<void> {
  const access = await getExactProfileAccess(db, input.userId, input.profileId);
  if (!access.ok || (input.ownerOnly && access.ownerUserId !== input.userId)) {
    throw new UnauthorizedSessionError();
  }
}
