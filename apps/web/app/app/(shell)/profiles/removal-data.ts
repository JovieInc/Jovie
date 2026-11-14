import 'server-only';

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { getAuthenticatedProfile } from '@/lib/db/queries/shared';
import { socialLinks } from '@/lib/db/schema/links';

/** Expose only owned active link identifiers, never verification tokens/evidence. */
export async function loadPresenceRemovalLinks(
  profileId: string,
  actorId: string
) {
  if (!(await getAuthenticatedProfile(db, profileId, actorId))) return [];
  return db
    .select({
      id: socialLinks.id,
      creatorProfileId: socialLinks.creatorProfileId,
      url: socialLinks.url,
      version: socialLinks.version,
      isActive: socialLinks.isActive,
      state: socialLinks.state,
    })
    .from(socialLinks)
    .where(
      and(
        eq(socialLinks.creatorProfileId, profileId),
        eq(socialLinks.isActive, true),
        eq(socialLinks.state, 'active')
      )
    );
}
