import 'server-only';

import { and, asc, eq, isNull, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles, userProfileClaims } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import {
  buildCompanyPresencePages,
  COMPANY_PRESENCE_SOURCES,
  type OwnedProfileRef,
} from './inventory';
import type { CompanyPresenceData } from './model';

async function loadOwnedProfiles(): Promise<OwnedProfileRef[]> {
  return db
    .select({
      username: creatorProfiles.username,
      displayName: creatorProfiles.displayName,
    })
    .from(creatorProfiles)
    .leftJoin(
      userProfileClaims,
      and(
        eq(userProfileClaims.creatorProfileId, creatorProfiles.id),
        eq(userProfileClaims.role, 'owner')
      )
    )
    .innerJoin(
      users,
      or(
        eq(users.id, userProfileClaims.userId),
        and(isNull(userProfileClaims.id), eq(users.id, creatorProfiles.userId))
      )
    )
    .where(
      and(
        eq(users.isAdmin, true),
        isNull(users.deletedAt),
        eq(creatorProfiles.isPublic, true)
      )
    )
    .orderBy(asc(creatorProfiles.usernameNormalized));
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
