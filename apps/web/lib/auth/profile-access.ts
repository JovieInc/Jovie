import 'server-only';

import { eq } from 'drizzle-orm';
import type { DbOrTransaction } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles, userProfileClaims } from '@/lib/db/schema/profiles';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isCanonicalUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export type ProfileAccessDecision =
  | { ok: true; profileId: string }
  | {
      ok: false;
      reason: 'invalid' | 'not_found' | 'forbidden' | 'ambiguous';
    };

export function resolveProfileAccess(input: {
  appUserId: string;
  profileId: string;
  userRows: ReadonlyArray<{ id: string }>;
  profileRows: ReadonlyArray<{ id: string; legacyUserId: string | null }>;
  claimRows: ReadonlyArray<{ userId: string; role: string }>;
}): ProfileAccessDecision {
  if (!isCanonicalUuid(input.appUserId) || !isCanonicalUuid(input.profileId)) {
    return { ok: false, reason: 'invalid' };
  }
  if (input.userRows.length !== 1) {
    return {
      ok: false,
      reason: input.userRows.length === 0 ? 'not_found' : 'ambiguous',
    };
  }
  if (input.profileRows.length !== 1) {
    return {
      ok: false,
      reason: input.profileRows.length === 0 ? 'not_found' : 'ambiguous',
    };
  }

  if (input.claimRows.length > 0) {
    const writableClaims = input.claimRows.filter(
      claim =>
        claim.userId === input.appUserId &&
        (claim.role === 'owner' || claim.role === 'manager')
    );
    return writableClaims.length === 1
      ? { ok: true, profileId: input.profileId }
      : {
          ok: false,
          reason: writableClaims.length > 1 ? 'ambiguous' : 'forbidden',
        };
  }

  return input.profileRows[0]?.legacyUserId === input.appUserId
    ? { ok: true, profileId: input.profileId }
    : { ok: false, reason: 'forbidden' };
}

/**
 * Authorize one immutable profile id. Legacy ownership is considered only
 * when the target has no canonical claims, so a stale legacy owner cannot
 * override the post-cutover claim graph.
 */
export async function getExactProfileAccess(
  tx: DbOrTransaction,
  appUserId: string,
  profileId: string
): Promise<ProfileAccessDecision> {
  if (!isCanonicalUuid(appUserId) || !isCanonicalUuid(profileId)) {
    return { ok: false, reason: 'invalid' };
  }

  const rows = await tx
    .select({
      userId: users.id,
      profileId: creatorProfiles.id,
      legacyUserId: creatorProfiles.userId,
      claimUserId: userProfileClaims.userId,
      claimRole: userProfileClaims.role,
    })
    .from(users)
    .leftJoin(creatorProfiles, eq(creatorProfiles.id, profileId))
    .leftJoin(
      userProfileClaims,
      eq(userProfileClaims.creatorProfileId, creatorProfiles.id)
    )
    .where(eq(users.id, appUserId));

  return resolveProfileAccess({
    appUserId,
    profileId,
    userRows: Array.from(
      new Map(rows.map(row => [row.userId, { id: row.userId }])).values()
    ),
    profileRows: Array.from(
      new Map(
        rows.flatMap(row =>
          row.profileId
            ? [
                [
                  row.profileId,
                  { id: row.profileId, legacyUserId: row.legacyUserId },
                ] as const,
              ]
            : []
        )
      ).values()
    ),
    claimRows: rows.flatMap(row =>
      row.claimUserId && row.claimRole
        ? [{ userId: row.claimUserId, role: row.claimRole }]
        : []
    ),
  });
}
