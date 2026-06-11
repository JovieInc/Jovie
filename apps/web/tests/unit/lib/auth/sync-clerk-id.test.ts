import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDbSelect, mockDbUpdate } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
}));

vi.mock('server-only', () => ({}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
  },
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: {
    id: 'id',
    clerkId: 'clerkId',
    email: 'email',
    updatedAt: 'updatedAt',
  },
}));

import { syncClerkIdForEmail } from '@/lib/auth/sync-clerk-id';

function mockSelectChain(rows: unknown[]) {
  mockDbSelect.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  });
}

function mockSelectChainAll(rows: unknown[]) {
  mockDbSelect.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows),
    }),
  });
}

function mockUpdateChain() {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn().mockReturnValue({ where });
  mockDbUpdate.mockReturnValue({ set });
  return { set, where };
}

describe('syncClerkIdForEmail — fail-safe rebind (JOV-2999)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns in_sync when clerk_id already matches the email row', async () => {
    mockSelectChain([]);
    mockSelectChainAll([{ id: 'user-1', clerkId: 'clerk_dev' }]);

    const outcome = await syncClerkIdForEmail('dev@example.com', 'clerk_dev');

    expect(outcome).toEqual({ kind: 'in_sync' });
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it('returns in_sync when session clerk_id is already bound to the same email', async () => {
    mockSelectChain([{ id: 'user-1', email: 'dev@example.com' }]);

    const outcome = await syncClerkIdForEmail('dev@example.com', 'clerk_dev');

    expect(outcome).toEqual({ kind: 'in_sync' });
    expect(mockDbSelect).toHaveBeenCalledTimes(1);
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it('rebinds a single email match by user id when clerk_id drifts', async () => {
    mockSelectChain([]);
    mockSelectChainAll([{ id: 'user-1', clerkId: 'clerk_prod' }]);
    const { where } = mockUpdateChain();

    const outcome = await syncClerkIdForEmail('dev@example.com', 'clerk_dev');

    expect(outcome).toEqual({
      kind: 'synced',
      userId: 'user-1',
      oldClerkId: 'clerk_prod',
      newClerkId: 'clerk_dev',
    });
    expect(mockDbUpdate).toHaveBeenCalledTimes(1);
    expect(where).toHaveBeenCalledTimes(1);
  });

  it('returns no_db_row when no user matches the verified email', async () => {
    mockSelectChain([]);
    mockSelectChainAll([]);

    const outcome = await syncClerkIdForEmail(
      'missing@example.com',
      'clerk_dev'
    );

    expect(outcome).toEqual({ kind: 'no_db_row' });
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it('refuses ambiguous_email when multiple rows share the email', async () => {
    mockSelectChain([]);
    mockSelectChainAll([
      { id: 'user-1', clerkId: 'clerk_a' },
      { id: 'user-2', clerkId: 'clerk_b' },
    ]);

    const outcome = await syncClerkIdForEmail('dup@example.com', 'clerk_dev');

    expect(outcome).toEqual({ kind: 'ambiguous_email', matchCount: 2 });
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it('refuses clerk_id_taken when session clerk_id belongs to another email row', async () => {
    mockSelectChain([{ id: 'user-other', email: 'other@example.com' }]);

    const outcome = await syncClerkIdForEmail('dev@example.com', 'clerk_dev');

    expect(outcome).toEqual({
      kind: 'clerk_id_taken',
      existingUserId: 'user-other',
    });
    expect(mockDbSelect).toHaveBeenCalledTimes(1);
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it('normalizes email before lookup', async () => {
    mockSelectChain([]);
    mockSelectChainAll([{ id: 'user-1', clerkId: 'clerk_prod' }]);
    mockUpdateChain();

    await syncClerkIdForEmail('  DEV@Example.COM  ', 'clerk_dev');

    expect(mockDbSelect).toHaveBeenCalledTimes(2);
  });
});
