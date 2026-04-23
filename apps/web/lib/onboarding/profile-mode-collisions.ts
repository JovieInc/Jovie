import 'server-only';

import { inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { PROFILE_MODE_RESERVED_TOKENS } from '@/lib/validation/username-core';

/**
 * Detects existing creator profiles whose normalized handle collides with a
 * public-profile mode route token (e.g. a creator named "listen" would be
 * unreachable once /[username]/listen mounts as a mode page).
 *
 * Run this before shipping the route-level cutover (plan PR 3a). If this
 * returns a non-empty list, coordinate renames with the affected creators
 * first.
 */
export async function detectProfileModeHandleCollisions(): Promise<
  ReadonlyArray<{ id: string; usernameNormalized: string }>
> {
  const tokens = [...PROFILE_MODE_RESERVED_TOKENS];
  const rows = await db
    .select({
      id: creatorProfiles.id,
      usernameNormalized: creatorProfiles.usernameNormalized,
    })
    .from(creatorProfiles)
    .where(inArray(creatorProfiles.usernameNormalized, tokens));
  return rows;
}
