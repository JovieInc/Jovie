import { describe, expect, it, vi } from 'vitest';
import type { DbOrTransaction } from '@/lib/db';
import { getExactProfileAccess, resolveProfileAccess } from './profile-access';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const PROFILE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROFILE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function resolve(
  claims: Array<{ userId: string; role: string }> = [],
  legacyUserId: string | null = USER_A
) {
  return resolveProfileAccess({
    appUserId: USER_A,
    profileId: PROFILE,
    userRows: [{ id: USER_A }],
    profileRows: [{ id: PROFILE, legacyUserId }],
    claimRows: claims,
  });
}

describe('resolveProfileAccess', () => {
  it.each(['owner', 'manager'])('allows the exact %s claim', role => {
    expect(resolve([{ userId: USER_A, role }])).toEqual({
      ok: true,
      profileId: PROFILE,
    });
  });

  it('fails closed instead of using stale legacy ownership after cutover', () => {
    expect(resolve([{ userId: USER_B, role: 'owner' }])).toEqual({
      ok: false,
      reason: 'forbidden',
    });
  });

  it('uses legacy ownership only when the exact target has no claims', () => {
    expect(resolve()).toEqual({ ok: true, profileId: PROFILE });
    expect(resolve([], USER_B)).toEqual({
      ok: false,
      reason: 'forbidden',
    });
  });

  it('fails closed on ambiguous canonical claims', () => {
    expect(
      resolve([
        { userId: USER_A, role: 'owner' },
        { userId: USER_A, role: 'manager' },
      ])
    ).toEqual({ ok: false, reason: 'ambiguous' });
  });

  it.each([
    {
      name: 'malformed app user id',
      overrides: { appUserId: 'not-a-uuid' },
      reason: 'invalid',
    },
    {
      name: 'malformed profile id',
      overrides: { profileId: 'not-a-uuid' },
      reason: 'invalid',
    },
    {
      name: 'missing user',
      overrides: { userRows: [] },
      reason: 'not_found',
    },
    {
      name: 'multiple users',
      overrides: { userRows: [{ id: USER_A }, { id: USER_B }] },
      reason: 'ambiguous',
    },
    {
      name: 'missing profile',
      overrides: { profileRows: [] },
      reason: 'not_found',
    },
    {
      name: 'multiple profiles',
      overrides: {
        profileRows: [
          { id: PROFILE, legacyUserId: USER_A },
          { id: PROFILE_B, legacyUserId: USER_A },
        ],
      },
      reason: 'ambiguous',
    },
    {
      name: 'unsupported claim role',
      overrides: { claimRows: [{ userId: USER_A, role: 'viewer' }] },
      reason: 'forbidden',
    },
    {
      name: 'claim belonging to another user',
      overrides: { claimRows: [{ userId: USER_B, role: 'owner' }] },
      reason: 'forbidden',
    },
    {
      name: 'multiple writable claims',
      overrides: {
        claimRows: [
          { userId: USER_A, role: 'owner' },
          { userId: USER_A, role: 'manager' },
        ],
      },
      reason: 'ambiguous',
    },
  ] as const)('denies $name', ({ overrides, reason }) => {
    expect(
      resolveProfileAccess({
        appUserId: USER_A,
        profileId: PROFILE,
        userRows: [{ id: USER_A }],
        profileRows: [{ id: PROFILE, legacyUserId: USER_A }],
        claimRows: [],
        ...overrides,
      })
    ).toEqual({ ok: false, reason });
  });
});

interface JoinedAccessRow {
  readonly userId: string;
  readonly profileId: string | null;
  readonly legacyUserId: string | null;
  readonly claimUserId: string | null;
  readonly claimRole: string | null;
}

function fakeAccessTransaction(rows: readonly JoinedAccessRow[]) {
  const where = vi.fn().mockResolvedValue(rows);
  const secondLeftJoin = vi.fn().mockReturnValue({ where });
  const firstLeftJoin = vi.fn().mockReturnValue({
    leftJoin: secondLeftJoin,
  });
  const from = vi.fn().mockReturnValue({ leftJoin: firstLeftJoin });
  const select = vi.fn().mockReturnValue({ from });

  return {
    tx: { select } as unknown as DbOrTransaction,
    select,
    from,
    firstLeftJoin,
    secondLeftJoin,
    where,
  };
}

describe('getExactProfileAccess', () => {
  it.each([
    'owner',
    'manager',
  ])('authorizes an exact %s claim through the joined query', async role => {
    const fake = fakeAccessTransaction([
      {
        userId: USER_A,
        profileId: PROFILE,
        legacyUserId: USER_B,
        claimUserId: USER_A,
        claimRole: role,
      },
    ]);

    await expect(
      getExactProfileAccess(fake.tx, USER_A, PROFILE)
    ).resolves.toEqual({ ok: true, profileId: PROFILE });
    expect(fake.select).toHaveBeenCalledTimes(1);
    expect(fake.from).toHaveBeenCalledTimes(1);
    expect(fake.firstLeftJoin).toHaveBeenCalledTimes(1);
    expect(fake.secondLeftJoin).toHaveBeenCalledTimes(1);
    expect(fake.where).toHaveBeenCalledTimes(1);
  });

  it('normalizes repeated joined user and profile rows before resolving', async () => {
    const fake = fakeAccessTransaction([
      {
        userId: USER_A,
        profileId: PROFILE,
        legacyUserId: USER_B,
        claimUserId: USER_A,
        claimRole: 'owner',
      },
      {
        userId: USER_A,
        profileId: PROFILE,
        legacyUserId: USER_B,
        claimUserId: USER_A,
        claimRole: 'viewer',
      },
    ]);

    await expect(
      getExactProfileAccess(fake.tx, USER_A, PROFILE)
    ).resolves.toEqual({ ok: true, profileId: PROFILE });
  });

  it.each([
    {
      name: 'missing joined profile',
      rows: [
        {
          userId: USER_A,
          profileId: null,
          legacyUserId: null,
          claimUserId: null,
          claimRole: null,
        },
      ],
      reason: 'not_found',
    },
    {
      name: 'unsupported joined claim role',
      rows: [
        {
          userId: USER_A,
          profileId: PROFILE,
          legacyUserId: USER_A,
          claimUserId: USER_A,
          claimRole: 'viewer',
        },
      ],
      reason: 'forbidden',
    },
    {
      name: 'ambiguous joined writable claims',
      rows: [
        {
          userId: USER_A,
          profileId: PROFILE,
          legacyUserId: USER_A,
          claimUserId: USER_A,
          claimRole: 'owner',
        },
        {
          userId: USER_A,
          profileId: PROFILE,
          legacyUserId: USER_A,
          claimUserId: USER_A,
          claimRole: 'manager',
        },
      ],
      reason: 'ambiguous',
    },
  ] as const)('denies $name', async ({ rows, reason }) => {
    const fake = fakeAccessTransaction(rows);
    await expect(
      getExactProfileAccess(fake.tx, USER_A, PROFILE)
    ).resolves.toEqual({ ok: false, reason });
  });

  it('rejects malformed identifiers without issuing a query', async () => {
    const fake = fakeAccessTransaction([]);

    await expect(
      getExactProfileAccess(fake.tx, 'malformed', PROFILE)
    ).resolves.toEqual({ ok: false, reason: 'invalid' });
    await expect(
      getExactProfileAccess(fake.tx, USER_A, 'malformed')
    ).resolves.toEqual({ ok: false, reason: 'invalid' });
    expect(fake.select).not.toHaveBeenCalled();
  });
});
