import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';

const getExactProfileAccess = vi.hoisted(() => vi.fn());
const eq = vi.hoisted(() => vi.fn((left, right) => ({ left, right })));
const and = vi.hoisted(() =>
  vi.fn((...conditions: unknown[]) => ({ conditions }))
);

vi.mock('@/lib/auth/profile-access', () => ({
  getExactProfileAccess,
}));
vi.mock('drizzle-orm', async () => {
  const actual =
    await vi.importActual<typeof import('drizzle-orm')>('drizzle-orm');
  return { ...actual, eq, and };
});

function createTx(options?: {
  existing?: Record<string, unknown>;
  conflict?: Record<string, unknown> | null;
  updated?: Record<string, unknown> | null;
  currentVersion?: number;
}) {
  const selections = [
    [
      options?.existing ?? {
        id: 'profile-a',
        usernameNormalized: 'oldname',
        settings: { hide_branding: false },
        theme: {},
        avatarUrl: null,
        profileEditVersion: 1,
      },
    ],
    ...(options?.conflict === undefined
      ? []
      : [options.conflict ? [options.conflict] : []]),
  ];
  const predicates: unknown[] = [];
  const updates: Array<{ table: unknown; values: Record<string, unknown> }> =
    [];
  const tx = {
    select: vi.fn(() => ({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn(async () => {
        if (selections.length > 0) return selections.shift() ?? [];
        return [{ profileEditVersion: options?.currentVersion ?? 2 }];
      }),
    })),
    update: vi.fn((table: unknown) => {
      const chain = {
        set(next: Record<string, unknown>) {
          updates.push({ table, values: next });
          return chain;
        },
        where(predicate: unknown) {
          predicates.push(predicate);
          return chain;
        },
        returning: vi.fn(async () =>
          options?.updated === null
            ? []
            : [
                options?.updated ?? {
                  id: 'profile-a',
                  usernameNormalized: 'oldname',
                  profileEditVersion: 2,
                },
              ]
        ),
      };
      return chain;
    }),
  };
  return { tx, predicates, updates };
}

describe('updateProfileRecords exact-profile CAS', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getExactProfileAccess.mockResolvedValue({
      ok: true,
      profileId: 'profile-a',
      ownerUserId: 'user-a',
    });
  });

  it('merges settings and scopes the CAS to the selected profile primary key', async () => {
    const { tx, predicates, updates } = createTx();
    const { updateProfileRecords } = await import(
      '@/app/api/dashboard/profile/lib/db-operations'
    );

    const result = await updateProfileRecords({
      tx: tx as never,
      appUserId: 'user-a',
      profileId: 'profile-a',
      dbProfileUpdates: {
        location: 'Austin, TX',
        settings: { hometown: 'Tulsa, OK' },
      },
      displayNameForUserUpdate: undefined,
      usernameUpdate: undefined,
      expectedVersion: 1,
    });

    expect(result).not.toBeInstanceOf(NextResponse);
    expect(updates[0]?.values).toMatchObject({
      location: 'Austin, TX',
      settings: { hide_branding: false, hometown: 'Tulsa, OK' },
    });
    expect(predicates[0]).toEqual({
      conditions: [
        { left: creatorProfiles.id, right: 'profile-a' },
        { left: creatorProfiles.profileEditVersion, right: 1 },
      ],
    });
  });

  it('keeps username, profile fields, and users.name in one transaction outcome', async () => {
    const { tx, predicates, updates } = createTx({ conflict: null });
    const { updateProfileRecords } = await import(
      '@/app/api/dashboard/profile/lib/db-operations'
    );

    const result = await updateProfileRecords({
      tx: tx as never,
      appUserId: 'user-a',
      profileId: 'profile-a',
      dbProfileUpdates: { bio: 'New bio' },
      displayNameForUserUpdate: 'New Name',
      usernameUpdate: 'newname',
      expectedVersion: 1,
    });

    expect(result).not.toBeInstanceOf(NextResponse);
    expect(updates[0]?.values).toMatchObject({
      bio: 'New bio',
      username: 'newname',
      usernameNormalized: 'newname',
    });
    expect(updates[1]?.values).toMatchObject({ name: 'New Name' });
    expect(predicates[1]).toEqual({
      left: users.id,
      right: 'user-a',
    });
  });

  it('updates the profile owner identity instead of the manager identity', async () => {
    getExactProfileAccess.mockResolvedValue({
      ok: true,
      profileId: 'profile-a',
      ownerUserId: 'owner-user',
    });
    const { tx, predicates, updates } = createTx();
    const { updateProfileRecords } = await import(
      '@/app/api/dashboard/profile/lib/db-operations'
    );

    const result = await updateProfileRecords({
      tx: tx as never,
      appUserId: 'manager-user',
      profileId: 'profile-a',
      dbProfileUpdates: { displayName: 'Artist Name' },
      displayNameForUserUpdate: 'Artist Name',
      usernameUpdate: undefined,
      expectedVersion: 1,
    });

    expect(result).not.toBeInstanceOf(NextResponse);
    expect(updates[1]?.table).toBe(users);
    expect(predicates[1]).toEqual({
      left: users.id,
      right: 'owner-user',
    });
  });

  it('does not update users.name when the exact CAS loses', async () => {
    const { tx, updates } = createTx({
      updated: null,
      currentVersion: 2,
    });
    const { updateProfileRecords } = await import(
      '@/app/api/dashboard/profile/lib/db-operations'
    );

    const result = await updateProfileRecords({
      tx: tx as never,
      appUserId: 'user-a',
      profileId: 'profile-a',
      dbProfileUpdates: { bio: 'Stale' },
      displayNameForUserUpdate: 'Must Roll Back',
      usernameUpdate: undefined,
      expectedVersion: 1,
    });

    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(409);
    expect(updates).toHaveLength(1);
    expect(updates[0]?.table).toBe(creatorProfiles);
  });

  it('rejects a username owned by another exact profile before writing', async () => {
    const { tx, updates } = createTx({
      conflict: { id: 'profile-b' },
    });
    const { updateProfileRecords } = await import(
      '@/app/api/dashboard/profile/lib/db-operations'
    );

    const result = await updateProfileRecords({
      tx: tx as never,
      appUserId: 'user-a',
      profileId: 'profile-a',
      dbProfileUpdates: {},
      displayNameForUserUpdate: undefined,
      usernameUpdate: 'taken',
      expectedVersion: 1,
    });

    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(400);
    expect(updates).toHaveLength(0);
  });
});
