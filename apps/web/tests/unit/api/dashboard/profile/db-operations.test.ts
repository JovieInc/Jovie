import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { creatorProfiles } from '@/lib/db/schema/profiles';

const getExactProfileAccess = vi.hoisted(() => vi.fn());
const eq = vi.hoisted(() => vi.fn((left, right) => ({ left, right })));
const and = vi.hoisted(() =>
  vi.fn((...conditions: unknown[]) => ({ conditions }))
);

vi.mock('@/lib/auth/profile-access', () => ({
  getExactProfileAccess,
}));
vi.mock('@/lib/db/queries/profile-ownership', () => ({
  writableProfileForUser: vi.fn(() => 'canonical-access-predicate'),
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

  it.each([
    { reason: 'forbidden' as const, status: 404 },
    { reason: 'not_found' as const, status: 404 },
  ])(
    'stops the profile update preflight at exact access $reason',
    async ({ reason, status }) => {
      getExactProfileAccess.mockResolvedValue({ ok: false, reason });
      const { tx } = createTx();
      const { getProfileUpdatePreflight } = await import(
        '@/app/api/dashboard/profile/lib/db-operations'
      );

      const result = await getProfileUpdatePreflight(
        tx as never,
        'user-a',
        'profile-a'
      );

      expect(result).toBeInstanceOf(NextResponse);
      expect((result as NextResponse).status).toBe(status);
      expect(tx.select).not.toHaveBeenCalled();
    }
  );

  it('reads the current avatar and CAS version after exact access succeeds', async () => {
    const avatarUrl = 'https://example.com/avatar.png';
    const { tx } = createTx({
      existing: {
        avatarUrl,
        profileEditVersion: 7,
      },
    });
    const { getProfileUpdatePreflight } = await import(
      '@/app/api/dashboard/profile/lib/db-operations'
    );

    const result = await getProfileUpdatePreflight(
      tx as never,
      'user-a',
      'profile-a'
    );

    expect(result).toEqual({ avatarUrl, profileEditVersion: 7 });
    expect(getExactProfileAccess).toHaveBeenCalledWith(
      tx,
      'user-a',
      'profile-a'
    );
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
      usernameUpdate: undefined,
      expectedVersion: 1,
      precomputedAvatarTheme: undefined,
    });

    expect(result).not.toBeInstanceOf(NextResponse);
    expect(updates[0]?.values).toMatchObject({
      location: 'Austin, TX',
      settings: { hide_branding: false, hometown: 'Tulsa, OK' },
    });
    const conditions = (predicates[0] as { conditions: unknown[] }).conditions;
    expect(conditions.slice(0, 2)).toEqual([
      { left: creatorProfiles.id, right: 'profile-a' },
      { left: creatorProfiles.profileEditVersion, right: 1 },
    ]);
    expect(conditions).toHaveLength(3);
  });

  it('merges a precomputed avatar accent without external work', async () => {
    const avatarUrl = 'https://example.com/new-avatar.png';
    const profileAccent = {
      version: 1 as const,
      primaryHex: '#123456',
      sourceUrl: avatarUrl,
    };
    const { tx, updates } = createTx({
      existing: {
        id: 'profile-a',
        usernameNormalized: 'oldname',
        settings: {},
        theme: { mode: 'dark' },
        avatarUrl: 'https://example.com/old-avatar.png',
        profileEditVersion: 1,
      },
    });
    const { updateProfileRecords } = await import(
      '@/app/api/dashboard/profile/lib/db-operations'
    );

    const result = await updateProfileRecords({
      tx: tx as never,
      appUserId: 'user-a',
      profileId: 'profile-a',
      dbProfileUpdates: { avatarUrl },
      usernameUpdate: undefined,
      expectedVersion: 1,
      precomputedAvatarTheme: { profileAccent },
    });

    expect(result).not.toBeInstanceOf(NextResponse);
    expect(updates[0]?.values).toMatchObject({
      avatarUrl,
      theme: { mode: 'dark', profileAccent },
    });
  });

  it('updates username and profile fields without renaming the account', async () => {
    const { tx, predicates, updates } = createTx({ conflict: null });
    const { updateProfileRecords } = await import(
      '@/app/api/dashboard/profile/lib/db-operations'
    );

    const result = await updateProfileRecords({
      tx: tx as never,
      appUserId: 'user-a',
      profileId: 'profile-a',
      dbProfileUpdates: { bio: 'New bio' },
      usernameUpdate: 'newname',
      expectedVersion: 1,
      precomputedAvatarTheme: undefined,
    });

    expect(result).not.toBeInstanceOf(NextResponse);
    expect(updates[0]?.values).toMatchObject({
      bio: 'New bio',
      username: 'newname',
      usernameNormalized: 'newname',
    });
    expect(updates).toHaveLength(1);
    expect(predicates).toHaveLength(1);
  });

  it('keeps both owner and manager account identities separate from artist edits', async () => {
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
      usernameUpdate: undefined,
      expectedVersion: 1,
      precomputedAvatarTheme: undefined,
    });

    expect(result).not.toBeInstanceOf(NextResponse);
    expect(updates).toHaveLength(1);
    expect(updates[0]?.table).toBe(creatorProfiles);
    expect(predicates).toHaveLength(1);
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
      usernameUpdate: undefined,
      expectedVersion: 1,
      precomputedAvatarTheme: undefined,
    });

    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(409);
    expect(updates).toHaveLength(1);
    expect(updates[0]?.table).toBe(creatorProfiles);
  });

  it('returns a conflict before requiring theme work for a stale avatar CAS', async () => {
    const { tx, updates } = createTx({
      existing: {
        id: 'profile-a',
        usernameNormalized: 'oldname',
        settings: {},
        theme: {},
        avatarUrl: 'https://example.com/old-avatar.png',
        profileEditVersion: 4,
      },
    });
    const { updateProfileRecords } = await import(
      '@/app/api/dashboard/profile/lib/db-operations'
    );

    const result = await updateProfileRecords({
      tx: tx as never,
      appUserId: 'user-a',
      profileId: 'profile-a',
      dbProfileUpdates: {
        avatarUrl: 'https://example.com/new-avatar.png',
      },
      usernameUpdate: undefined,
      expectedVersion: 3,
      precomputedAvatarTheme: undefined,
      avatarPreflightVersion: 4,
    });

    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(409);
    expect(updates).toHaveLength(0);
  });

  it('returns a conflict if the avatar changes after an unchanged-avatar preflight', async () => {
    const { tx, updates } = createTx({
      existing: {
        id: 'profile-a',
        usernameNormalized: 'oldname',
        settings: {},
        theme: {},
        avatarUrl: 'https://example.com/concurrent-avatar.png',
        profileEditVersion: 4,
      },
    });
    const { updateProfileRecords } = await import(
      '@/app/api/dashboard/profile/lib/db-operations'
    );

    const result = await updateProfileRecords({
      tx: tx as never,
      appUserId: 'user-a',
      profileId: 'profile-a',
      dbProfileUpdates: {
        avatarUrl: 'https://example.com/request-avatar.png',
      },
      usernameUpdate: undefined,
      precomputedAvatarTheme: undefined,
      avatarPreflightVersion: 3,
    });

    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(409);
    expect(updates).toHaveLength(0);
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
      usernameUpdate: 'taken',
      expectedVersion: 1,
      precomputedAvatarTheme: undefined,
    });

    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(400);
    expect(updates).toHaveLength(0);
  });
});
