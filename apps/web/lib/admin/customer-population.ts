import 'server-only';

import {
  and,
  sql as drizzleSql,
  eq,
  exists,
  ilike,
  inArray,
  or,
} from 'drizzle-orm';
import { getDeterministicTestBetterAuthUserId } from '@/lib/auth/dev-test-auth-identity';
import type { CanonicalContactSourceRow } from '@/lib/contacts/lifecycle';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles, userProfileClaims } from '@/lib/db/schema/profiles';
import { waitlistEntries } from '@/lib/db/schema/waitlist';
import {
  isReservedPublicProfileIdentity,
  PUBLIC_PROFILE_RESERVED_IDENTITY_HANDLES,
} from '@/lib/profile/public-profile-identity-policy';
import {
  INTERNAL_ACCOUNT_EMAIL_SQL_PATTERN,
  isInternalOrTestAccountEmail,
} from '@/lib/utils/email';

export interface CustomerPopulationExclusions {
  userIds: ReadonlySet<string>;
  profileIds: ReadonlySet<string>;
  waitlistEntryIds: ReadonlySet<string>;
}

export function isNonCustomerUser(user: {
  email: string | null;
  betterAuthUserId: string | null;
}): boolean {
  return (
    isInternalOrTestAccountEmail(user.email) ||
    (!!user.email &&
      user.betterAuthUserId ===
        getDeterministicTestBetterAuthUserId(user.email))
  );
}

/** Read-only provenance graph, independent of CRM source scan limits. */
export async function getCustomerPopulationExclusions(): Promise<CustomerPopulationExclusions> {
  const [userCandidates, waitlistCandidates] = await Promise.all([
    db
      .select({
        id: users.id,
        email: users.email,
        betterAuthUserId: users.betterAuthUserId,
      })
      .from(users)
      .where(
        or(
          drizzleSql`btrim(${users.email}) ~* ${INTERNAL_ACCOUNT_EMAIL_SQL_PATTERN}`,
          // UUIDv8 is only a candidate: verify the exact provisioning digest in JS.
          ilike(users.betterAuthUserId, '________-____-8___-____-____________')
        )
      ),
    db
      .select({
        id: waitlistEntries.id,
        emailNormalized: waitlistEntries.emailNormalized,
      })
      .from(waitlistEntries)
      .where(
        drizzleSql`btrim(${waitlistEntries.emailNormalized}) ~* ${INTERNAL_ACCOUNT_EMAIL_SQL_PATTERN}`
      ),
  ]);
  const userIds = new Set(
    userCandidates.filter(isNonCustomerUser).map(row => row.id)
  );
  const waitlistEntryIds = new Set(
    waitlistCandidates
      .filter(row => isInternalOrTestAccountEmail(row.emailNormalized))
      .map(row => row.id)
  );
  const excludedUsers = [...userIds];
  const excludedWaitlist = [...waitlistEntryIds];
  const profileCandidates = await db
    .select({
      id: creatorProfiles.id,
      userId: creatorProfiles.userId,
      waitlistEntryId: creatorProfiles.waitlistEntryId,
      usernameNormalized: creatorProfiles.usernameNormalized,
    })
    .from(creatorProfiles)
    .where(
      or(
        inArray(creatorProfiles.usernameNormalized, [
          ...PUBLIC_PROFILE_RESERVED_IDENTITY_HANDLES,
        ]),
        excludedUsers.length
          ? inArray(creatorProfiles.userId, excludedUsers)
          : undefined,
        excludedWaitlist.length
          ? inArray(creatorProfiles.waitlistEntryId, excludedWaitlist)
          : undefined,
        excludedUsers.length
          ? exists(
              db
                .select({ id: userProfileClaims.id })
                .from(userProfileClaims)
                .where(
                  and(
                    eq(userProfileClaims.creatorProfileId, creatorProfiles.id),
                    eq(userProfileClaims.role, 'owner'),
                    inArray(userProfileClaims.userId, excludedUsers)
                  )
                )
            )
          : undefined
      )
    );
  const owners = profileCandidates.length
    ? await db
        .select({
          creatorProfileId: userProfileClaims.creatorProfileId,
          userId: userProfileClaims.userId,
        })
        .from(userProfileClaims)
        .where(
          and(
            eq(userProfileClaims.role, 'owner'),
            inArray(
              userProfileClaims.creatorProfileId,
              profileCandidates.map(row => row.id)
            )
          )
        )
    : [];
  const ownersByProfile = new Map<string, string[]>();
  for (const owner of owners) {
    const ids = ownersByProfile.get(owner.creatorProfileId) ?? [];
    ids.push(owner.userId);
    ownersByProfile.set(owner.creatorProfileId, ids);
  }
  const profileIds = new Set(
    profileCandidates
      .filter(profile => {
        if (isReservedPublicProfileIdentity(profile.usernameNormalized))
          return true;
        if (
          profile.waitlistEntryId &&
          waitlistEntryIds.has(profile.waitlistEntryId)
        )
          return true;
        const ownerIds = ownersByProfile.get(profile.id);
        // A current owner supersedes the deprecated user_id. Manager/viewer
        // access is not an identity edge and must never hide a real customer.
        return ownerIds?.length
          ? ownerIds.every(id => userIds.has(id))
          : !!profile.userId && userIds.has(profile.userId);
      })
      .map(profile => profile.id)
  );
  return { userIds, profileIds, waitlistEntryIds };
}

/** Filter before merging, stage promotion, metrics, search and pagination. */
export function isCustomerContactSource(
  row: Pick<
    CanonicalContactSourceRow,
    'dedupeKey' | 'email' | 'userId' | 'creatorProfileId' | 'waitlistEntryId'
  >,
  excluded: CustomerPopulationExclusions
): boolean {
  return !(
    isInternalOrTestAccountEmail(row.email) ||
    (row.dedupeKey.startsWith('email:') &&
      isInternalOrTestAccountEmail(row.dedupeKey.slice(6))) ||
    (row.userId && excluded.userIds.has(row.userId)) ||
    (row.creatorProfileId && excluded.profileIds.has(row.creatorProfileId)) ||
    (row.waitlistEntryId && excluded.waitlistEntryIds.has(row.waitlistEntryId))
  );
}
