import 'server-only';

import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import {
  buildCompanyPresencePages,
  COMPANY_PRESENCE_SOURCES,
  type OwnedProfileRef,
} from './inventory';
import type { CompanyPresenceData } from './model';

const OWNED_PROFILE_LIMIT = 50;

/** Public profiles owned by Jovie staff (admin) accounts. */
async function loadOwnedProfiles(): Promise<OwnedProfileRef[]> {
  return db
    .select({
      username: creatorProfiles.username,
      displayName: creatorProfiles.displayName,
    })
    .from(creatorProfiles)
    .innerJoin(users, eq(users.id, creatorProfiles.userId))
    .where(
      and(
        eq(users.isAdmin, true),
        isNull(users.deletedAt),
        eq(creatorProfiles.isPublic, true)
      )
    )
    .orderBy(asc(creatorProfiles.usernameNormalized))
    .limit(OWNED_PROFILE_LIMIT);
}

export async function loadCompanyPresenceData(): Promise<CompanyPresenceData> {
  let ownedProfiles: OwnedProfileRef[] = [];
  let profilesUnavailable = false;
  try {
    ownedProfiles = await loadOwnedProfiles();
  } catch (error) {
    profilesUnavailable = true;
    await captureError(
      'Ovie company presence owned-profile lookup failed',
      error,
      {
        route: 'admin/presence',
      }
    );
  }

  return {
    pages: buildCompanyPresencePages({ ownedProfiles }),
    sources: COMPANY_PRESENCE_SOURCES,
    profilesUnavailable,
  };
}
