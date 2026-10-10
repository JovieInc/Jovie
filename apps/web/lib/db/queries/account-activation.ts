import 'server-only';

import { and, sql as drizzleSql, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { chatConversations } from '@/lib/db/schema/chat';
import { creatorProfiles, userProfileClaims } from '@/lib/db/schema/profiles';
import { waitlistEntries } from '@/lib/db/schema/waitlist';

/** Read only the already-enumerated account population; never contact/token data. */
export async function readAccountActivation(accountIds: readonly string[]) {
  const ids = [...new Set(accountIds)];
  if (ids.length > 500)
    throw new RangeError('Account activation scan exceeds cohort bound');
  if (ids.length === 0) return [];

  return db
    .select({
      id: users.id,
      accountStatus: users.userStatus,
      waitlistLinked: drizzleSql<boolean>`${users.waitlistEntryId} is not null`,
      waitlistStatus: waitlistEntries.status,
      attachedOnboardingConversation: drizzleSql<boolean>`exists (
        select 1 from ${chatConversations}
        where ${chatConversations.userId} = ${users.id}
          and ${chatConversations.sessionId} is not null
      )`,
      ownedProfileCount: drizzleSql<number>`(
        select count(*) from ${creatorProfiles}
        where ${creatorProfiles.userId} = ${users.id}
      )`.mapWith(Number),
      // Same membership predicate as founder-funnel.v2, not a permission verdict.
      claimedProfileCount: drizzleSql<number>`(
        select count(*) from ${creatorProfiles}
        where ${creatorProfiles.userId} = ${users.id}
          and ${creatorProfiles.isClaimed} = true
      )`.mapWith(Number),
      roleClaimCount: drizzleSql<number>`(
        select count(*) from ${userProfileClaims}
        where ${userProfileClaims.userId} = ${users.id}
      )`.mapWith(Number),
    })
    .from(users)
    .leftJoin(waitlistEntries, eq(users.waitlistEntryId, waitlistEntries.id))
    .where(and(inArray(users.id, ids), isNull(users.deletedAt)));
}
