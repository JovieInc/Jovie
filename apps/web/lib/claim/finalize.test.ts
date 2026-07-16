import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbOrTransaction } from '@/lib/db';

// Capture the values passed to `eq`/`and`/`ne` so WHERE-targeting can be
// asserted without depending on drizzle-orm's internal SQL tree shape, while
// keeping the real implementations so query building doesn't throw. Matches
// the established pattern in lib/library/asset-share.server.test.ts.
const eqCalls: unknown[][] = [];
const andCalls: unknown[][] = [];
const neCalls: unknown[][] = [];

vi.mock('drizzle-orm', async importActual => {
  const actual = await importActual<typeof import('drizzle-orm')>();
  return {
    ...actual,
    eq: (...args: unknown[]) => {
      eqCalls.push(args);
      return actual.eq(args[0] as never, args[1] as never);
    },
    and: (...args: unknown[]) => {
      andCalls.push(args);
      return actual.and(...(args as never[]));
    },
    ne: (...args: unknown[]) => {
      neCalls.push(args);
      return actual.ne(args[0] as never, args[1] as never);
    },
  };
});

import { users } from '@/lib/db/schema/auth';
import {
  creatorProfiles,
  profileOwnershipLog,
  userProfileClaims,
} from '@/lib/db/schema/profiles';
import {
  claimPrebuiltProfileForUser,
  ensureOnboardingUserRow,
  reservePrebuiltProfileForUser,
} from './finalize';

const FIXED_NOW = new Date('2026-03-01T12:00:00.000Z');

interface ProfileRowOverrides {
  id?: string;
  userId?: string | null;
  usernameNormalized?: string;
  displayName?: string | null;
  isClaimed?: boolean | null;
  claimedAt?: Date | null;
  onboardingCompletedAt?: Date | null;
}

function profileRow(overrides: ProfileRowOverrides = {}) {
  return {
    id: 'profile-1',
    userId: null,
    usernameNormalized: 'artistname',
    displayName: 'Old Name',
    isClaimed: false,
    claimedAt: null,
    onboardingCompletedAt: null,
    ...overrides,
  };
}

/**
 * Builds a fully-chainable `tx` mock covering every call shape `finalize.ts`
 * makes: select().from().where().for('update').limit(1), update().set().where(),
 * and insert().values() — the last of which must behave both as a directly
 * awaitable promise (profileOwnershipLog insert) and as a chain root for
 * .onConflictDoNothing()/.onConflictDoUpdate() (userProfileClaims, users).
 */
function createTxMock(selectResultsQueue: unknown[][]) {
  const selectQueue = [...selectResultsQueue];
  const limitMock = vi.fn((_n: number) =>
    Promise.resolve(selectQueue.shift() ?? [])
  );
  const forMock = vi.fn((_mode: unknown) => ({ limit: limitMock }));
  const selectWhereMock = vi.fn((_condition: unknown) => ({ for: forMock }));
  const fromMock = vi.fn((_table: unknown) => ({ where: selectWhereMock }));
  const selectMock = vi.fn((_columns: unknown) => ({ from: fromMock }));

  const updateWhereMock = vi.fn((_condition: unknown) =>
    Promise.resolve(undefined)
  );
  const updateSetMock = vi.fn((_payload: Record<string, unknown>) => ({
    where: updateWhereMock,
  }));
  const updateMock = vi.fn((_table: unknown) => ({ set: updateSetMock }));

  const insertReturningMock = vi.fn((_columns: unknown) =>
    Promise.resolve([{ id: 'provisioned-user-id' }])
  );
  const onConflictDoUpdateMock = vi.fn((_payload: Record<string, unknown>) => ({
    returning: insertReturningMock,
  }));
  const onConflictDoNothingMock = vi.fn(() => Promise.resolve(undefined));
  const insertValuesMock = vi.fn((_payload: Record<string, unknown>) => {
    const thenable = Promise.resolve(undefined) as Promise<undefined> & {
      onConflictDoUpdate: typeof onConflictDoUpdateMock;
      onConflictDoNothing: typeof onConflictDoNothingMock;
    };
    thenable.onConflictDoUpdate = onConflictDoUpdateMock;
    thenable.onConflictDoNothing = onConflictDoNothingMock;
    return thenable;
  });
  const insertMock = vi.fn((_table: unknown) => ({ values: insertValuesMock }));

  const tx = {
    select: selectMock,
    update: updateMock,
    insert: insertMock,
  } as unknown as DbOrTransaction;

  return {
    tx,
    selectMock,
    fromMock,
    selectWhereMock,
    forMock,
    limitMock,
    updateMock,
    updateSetMock,
    updateWhereMock,
    insertMock,
    insertValuesMock,
    onConflictDoUpdateMock,
    insertReturningMock,
    onConflictDoNothingMock,
  };
}

function assertNoWrites(mocks: ReturnType<typeof createTxMock>) {
  expect(mocks.updateMock).not.toHaveBeenCalled();
  expect(mocks.insertMock).not.toHaveBeenCalled();
}

beforeEach(() => {
  eqCalls.length = 0;
  andCalls.length = 0;
  neCalls.length = 0;
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('claimPrebuiltProfileForUser', () => {
  const baseParams = {
    userId: 'user-1',
    creatorProfileId: 'profile-1',
    expectedUsername: 'ArtistName', // mixed case: must be lowercased before compare
    displayName: 'Artist Name',
    source: 'token_backed_onboarding' as const,
  };

  it('throws CLAIM_NOT_FOUND when the target profile row does not exist', async () => {
    const mocks = createTxMock([[]]); // getClaimTargetProfile finds nothing

    await expect(
      claimPrebuiltProfileForUser(mocks.tx, baseParams)
    ).rejects.toThrow('[CLAIM_NOT_FOUND] Profile not found');
    assertNoWrites(mocks);
  });

  it('throws CLAIM_NOT_FOUND when usernameNormalized mismatches expectedUsername', async () => {
    const mocks = createTxMock([
      [profileRow({ usernameNormalized: 'someone-else' })],
    ]);

    await expect(
      claimPrebuiltProfileForUser(mocks.tx, baseParams)
    ).rejects.toThrow('[CLAIM_NOT_FOUND] Claim context is out of date');
    assertNoWrites(mocks);
    // Must fail before the multi-profile conflict check ever queries.
    expect(mocks.limitMock).toHaveBeenCalledTimes(1);
  });

  it('throws PROFILE_CONFLICT when the user already owns a different claimed profile', async () => {
    const mocks = createTxMock([
      [profileRow()],
      [{ id: 'other-profile', usernameNormalized: 'myotherhandle' }],
    ]);

    await expect(
      claimPrebuiltProfileForUser(mocks.tx, baseParams)
    ).rejects.toThrow('[PROFILE_CONFLICT] You already own @myotherhandle.');
    assertNoWrites(mocks);
  });

  it('throws PROFILE_CONFLICT ("no longer available") when the profile is reserved by a different user', async () => {
    const mocks = createTxMock([
      [profileRow({ userId: 'other-user', isClaimed: false })],
      [],
    ]);

    await expect(
      claimPrebuiltProfileForUser(mocks.tx, baseParams)
    ).rejects.toThrow(
      '[PROFILE_CONFLICT] This profile is no longer available.'
    );
    assertNoWrites(mocks);
  });

  it('throws PROFILE_CONFLICT ("already been claimed") when isClaimed is true and owned by no one / someone else', async () => {
    // userId is null (falsy) so the "reserved by other user" guard does not
    // fire first; isClaimed + userId mismatch (null !== params.userId) is the
    // only way to reach this specific branch distinctly.
    const mocks = createTxMock([
      [profileRow({ userId: null, isClaimed: true })],
      [],
    ]);

    await expect(
      claimPrebuiltProfileForUser(mocks.tx, baseParams)
    ).rejects.toThrow(
      '[PROFILE_CONFLICT] This profile has already been claimed.'
    );
    assertNoWrites(mocks);
  });

  it('claims successfully, finalizing onboarding, and pins the full ownership audit trail', async () => {
    const mocks = createTxMock([
      [profileRow({ onboardingCompletedAt: null })],
      [],
    ]);

    const result = await claimPrebuiltProfileForUser(mocks.tx, {
      ...baseParams,
      finalizeOnboarding: true,
    });

    expect(result).toEqual({
      profileId: 'profile-1',
      username: 'artistname',
      status: 'updated',
    });

    // Call 0: release-other-reserved-profiles update on creatorProfiles
    expect(mocks.updateMock.mock.calls[0]?.[0]).toBe(creatorProfiles);
    expect(mocks.updateSetMock.mock.calls[0]?.[0]).toEqual({
      userId: null,
      onboardingCompletedAt: null,
      updatedAt: FIXED_NOW,
    });

    // Call 1: main ownership-transfer update on creatorProfiles
    expect(mocks.updateMock.mock.calls[1]?.[0]).toBe(creatorProfiles);
    expect(mocks.updateSetMock.mock.calls[1]?.[0]).toEqual({
      userId: 'user-1',
      displayName: 'Artist Name',
      isClaimed: true,
      isPublic: true,
      claimedAt: FIXED_NOW,
      onboardingCompletedAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    });

    // Call 2: final user status update
    expect(mocks.updateMock.mock.calls[2]?.[0]).toBe(users);
    expect(mocks.updateSetMock.mock.calls[2]?.[0]).toEqual({
      activeProfileId: 'profile-1',
      userStatus: 'active',
      updatedAt: FIXED_NOW,
    });
    expect(mocks.updateMock).toHaveBeenCalledTimes(3);

    // userProfileClaims insert (ownership audit trail row 1)
    expect(mocks.insertMock.mock.calls[0]?.[0]).toBe(userProfileClaims);
    expect(mocks.insertValuesMock.mock.calls[0]?.[0]).toEqual({
      userId: 'user-1',
      creatorProfileId: 'profile-1',
      role: 'owner',
      claimedAt: FIXED_NOW,
    });
    expect(mocks.onConflictDoNothingMock).toHaveBeenCalledOnce();

    // profileOwnershipLog insert (ownership audit trail row 2)
    expect(mocks.insertMock.mock.calls[1]?.[0]).toBe(profileOwnershipLog);
    expect(mocks.insertValuesMock.mock.calls[1]?.[0]).toEqual({
      creatorProfileId: 'profile-1',
      userId: 'user-1',
      performedBy: 'user-1',
      action: 'claimed',
      reason: 'token_backed_onboarding',
    });
    expect(mocks.insertMock).toHaveBeenCalledTimes(2);
  });

  it('does not mark onboarding complete or flip user status to active when finalizeOnboarding is false', async () => {
    const existingOnboardingCompletedAt = new Date('2025-01-01T00:00:00.000Z');
    const mocks = createTxMock([
      [profileRow({ onboardingCompletedAt: existingOnboardingCompletedAt })],
      [],
    ]);

    await claimPrebuiltProfileForUser(mocks.tx, {
      ...baseParams,
      finalizeOnboarding: false,
    });

    expect(mocks.updateSetMock.mock.calls[1]?.[0]).toMatchObject({
      onboardingCompletedAt: existingOnboardingCompletedAt,
    });
    expect(mocks.updateSetMock.mock.calls[2]?.[0]).toMatchObject({
      userStatus: 'onboarding_incomplete',
    });
  });

  it('preserves an already-set onboardingCompletedAt instead of overwriting it with now', async () => {
    const originalCompletion = new Date('2025-06-15T00:00:00.000Z');
    const mocks = createTxMock([
      [profileRow({ onboardingCompletedAt: originalCompletion })],
      [],
    ]);

    await claimPrebuiltProfileForUser(mocks.tx, {
      ...baseParams,
      finalizeOnboarding: true,
    });

    expect(mocks.updateSetMock.mock.calls[1]?.[0]).toMatchObject({
      onboardingCompletedAt: originalCompletion,
    });
  });

  it("targets only the user's OTHER reserved (unclaimed) profiles when releasing, excluding the one being claimed", async () => {
    const mocks = createTxMock([[profileRow()], []]);

    await claimPrebuiltProfileForUser(mocks.tx, baseParams);

    // The conflict guard emits the same userId predicate before the release
    // UPDATE. Requiring both calls proves the release stays scoped to this user.
    expect(
      eqCalls.filter(
        ([col, value]) => col === creatorProfiles.userId && value === 'user-1'
      )
    ).toHaveLength(2);
    expect(eqCalls).toContainEqual([creatorProfiles.isClaimed, false]);
    // Cardinality, not just presence: the conflict-guard select emits an
    // identical ne(id, 'profile-1'); the release UPDATE must emit a second
    // one. A mutant dropping the release-side ne leaves exactly 1 call.
    expect(
      neCalls.filter(
        ([col, v]) => col === creatorProfiles.id && v === 'profile-1'
      )
    ).toHaveLength(2);
  });

  it('preserves the original claimedAt when the same user re-claims an already-claimed profile', async () => {
    const originalClaimedAt = new Date('2024-01-01T00:00:00.000Z');
    const mocks = createTxMock([
      // Same user already owns and has already claimed this exact profile.
      [
        profileRow({
          userId: 'user-1',
          isClaimed: true,
          claimedAt: originalClaimedAt,
        }),
      ],
      [],
    ]);

    await claimPrebuiltProfileForUser(mocks.tx, baseParams);

    expect(mocks.updateSetMock.mock.calls[1]?.[0]).toMatchObject({
      claimedAt: originalClaimedAt,
    });
  });
});

describe('reservePrebuiltProfileForUser', () => {
  const baseParams = {
    userId: 'user-1',
    creatorProfileId: 'profile-1',
    expectedUsername: 'ArtistName',
    displayName: 'Artist Name',
  };

  it('throws CLAIM_NOT_FOUND when usernameNormalized mismatches expectedUsername', async () => {
    const mocks = createTxMock([
      [profileRow({ usernameNormalized: 'someone-else' })],
    ]);

    await expect(
      reservePrebuiltProfileForUser(mocks.tx, baseParams)
    ).rejects.toThrow('[CLAIM_NOT_FOUND] Claim context is out of date');
    assertNoWrites(mocks);
  });

  it('throws PROFILE_CONFLICT when the user already owns a different claimed profile', async () => {
    const mocks = createTxMock([
      [profileRow()],
      [{ id: 'other-profile', usernameNormalized: 'myotherhandle' }],
    ]);

    await expect(
      reservePrebuiltProfileForUser(mocks.tx, baseParams)
    ).rejects.toThrow('[PROFILE_CONFLICT] You already own @myotherhandle.');
    assertNoWrites(mocks);
  });

  it('throws PROFILE_CONFLICT ("no longer available") when the profile is reserved by a different user', async () => {
    const mocks = createTxMock([
      [profileRow({ userId: 'other-user', isClaimed: false })],
      [],
    ]);

    await expect(
      reservePrebuiltProfileForUser(mocks.tx, baseParams)
    ).rejects.toThrow(
      '[PROFILE_CONFLICT] This profile is no longer available.'
    );
    assertNoWrites(mocks);
  });

  it('throws PROFILE_CONFLICT ("already been claimed") when isClaimed is true and unowned', async () => {
    const mocks = createTxMock([
      [profileRow({ userId: null, isClaimed: true })],
      [],
    ]);

    await expect(
      reservePrebuiltProfileForUser(mocks.tx, baseParams)
    ).rejects.toThrow(
      '[PROFILE_CONFLICT] This profile has already been claimed.'
    );
    assertNoWrites(mocks);
  });

  it('reserves without transferring ownership: no isClaimed/claimedAt fields, no ownership-log writes', async () => {
    const mocks = createTxMock([[profileRow()], []]);

    const result = await reservePrebuiltProfileForUser(mocks.tx, baseParams);

    expect(result).toEqual({
      profileId: 'profile-1',
      username: 'artistname',
      status: 'updated',
    });

    // Call 0: release-other-reserved-profiles
    expect(mocks.updateMock.mock.calls[0]?.[0]).toBe(creatorProfiles);
    expect(mocks.updateSetMock.mock.calls[0]?.[0]).toEqual({
      userId: null,
      onboardingCompletedAt: null,
      updatedAt: FIXED_NOW,
    });

    // Call 1: reserve update — deliberately NOT the claim shape.
    const reserveSetPayload = mocks.updateSetMock.mock.calls[1]?.[0] as Record<
      string,
      unknown
    >;
    expect(reserveSetPayload).toEqual({
      userId: 'user-1',
      displayName: 'Artist Name',
      isPublic: true,
      updatedAt: FIXED_NOW,
    });
    expect(reserveSetPayload).not.toHaveProperty('isClaimed');
    expect(reserveSetPayload).not.toHaveProperty('claimedAt');

    // Call 2: user active-profile pointer, always onboarding_incomplete —
    // reserve has no finalizeOnboarding concept at all.
    expect(mocks.updateMock.mock.calls[2]?.[0]).toBe(users);
    expect(mocks.updateSetMock.mock.calls[2]?.[0]).toEqual({
      activeProfileId: 'profile-1',
      userStatus: 'onboarding_incomplete',
      updatedAt: FIXED_NOW,
    });
    expect(mocks.updateMock).toHaveBeenCalledTimes(3);

    // No userProfileClaims / profileOwnershipLog rows — reserve is not a claim.
    expect(mocks.insertMock).not.toHaveBeenCalled();
  });

  it('targets only the OTHER reserved profiles when releasing, excluding the one being reserved', async () => {
    const mocks = createTxMock([[profileRow()], []]);

    await reservePrebuiltProfileForUser(mocks.tx, baseParams);

    // The conflict guard emits the same userId predicate before the release
    // UPDATE. Requiring both calls proves the release stays scoped to this user.
    expect(
      eqCalls.filter(
        ([col, value]) => col === creatorProfiles.userId && value === 'user-1'
      )
    ).toHaveLength(2);
    expect(eqCalls).toContainEqual([creatorProfiles.isClaimed, false]);
    // Cardinality, not just presence — see the claim-side twin test.
    expect(
      neCalls.filter(
        ([col, v]) => col === creatorProfiles.id && v === 'profile-1'
      )
    ).toHaveLength(2);
  });
});

describe('ensureOnboardingUserRow', () => {
  it('upserts a user row keyed on clerkId and returns the provisioned id', async () => {
    const mocks = createTxMock([]);

    const result = await ensureOnboardingUserRow(mocks.tx, {
      clerkUserId: 'clerk-1',
      userEmail: 'artist@example.com',
    });

    expect(result).toEqual({ id: 'provisioned-user-id' });
    expect(mocks.insertMock.mock.calls[0]?.[0]).toBe(users);
    expect(mocks.insertValuesMock).toHaveBeenCalledWith({
      clerkId: 'clerk-1',
      email: 'artist@example.com',
      userStatus: 'onboarding_incomplete',
      updatedAt: FIXED_NOW,
    });
    expect(mocks.onConflictDoUpdateMock).toHaveBeenCalledWith({
      target: users.clerkId,
      set: {
        email: 'artist@example.com',
        userStatus: 'onboarding_incomplete',
        updatedAt: FIXED_NOW,
      },
    });
    expect(mocks.insertReturningMock).toHaveBeenCalledWith({ id: users.id });
  });

  it('omits the email key from the conflict-update SET when userEmail is null (does not clobber existing email)', async () => {
    const mocks = createTxMock([]);

    await ensureOnboardingUserRow(mocks.tx, {
      clerkUserId: 'clerk-1',
      userEmail: null,
    });

    const setPayload = mocks.onConflictDoUpdateMock.mock.calls[0]?.[0] as {
      set: Record<string, unknown>;
    };
    expect(setPayload.set).not.toHaveProperty('email');
    expect(setPayload.set).toEqual({
      userStatus: 'onboarding_incomplete',
      updatedAt: FIXED_NOW,
    });
    // The initial insert values still carry the (null) email column.
    expect(mocks.insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ email: null })
    );
  });

  it('throws DATABASE_ERROR when the upsert returns no row', async () => {
    const mocks = createTxMock([]);
    mocks.insertReturningMock.mockResolvedValueOnce([]);

    await expect(
      ensureOnboardingUserRow(mocks.tx, {
        clerkUserId: 'clerk-1',
        userEmail: null,
      })
    ).rejects.toThrow('[DATABASE_ERROR] Failed to provision user row');
  });

  it('is idempotent: repeated calls for the same clerkId resolve to the same row id via the clerkId conflict target', async () => {
    const mocksA = createTxMock([]);
    mocksA.insertReturningMock.mockResolvedValue([{ id: 'stable-user-id' }]);
    const first = await ensureOnboardingUserRow(mocksA.tx, {
      clerkUserId: 'clerk-shared',
      userEmail: 'artist@example.com',
    });

    const mocksB = createTxMock([]);
    mocksB.insertReturningMock.mockResolvedValue([{ id: 'stable-user-id' }]);
    const second = await ensureOnboardingUserRow(mocksB.tx, {
      clerkUserId: 'clerk-shared',
      userEmail: 'artist@example.com',
    });

    expect(first).toEqual({ id: 'stable-user-id' });
    expect(second).toEqual({ id: 'stable-user-id' });
    // Both calls upsert against the same natural key — no path exists that
    // would create a second distinct user row for the same clerkId.
    expect(mocksA.onConflictDoUpdateMock.mock.calls[0]?.[0]).toMatchObject({
      target: users.clerkId,
    });
    expect(mocksB.onConflictDoUpdateMock.mock.calls[0]?.[0]).toMatchObject({
      target: users.clerkId,
    });
  });
});
