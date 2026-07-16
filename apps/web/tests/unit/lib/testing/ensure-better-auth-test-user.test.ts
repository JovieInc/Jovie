import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockOnConflictDoNothing, mockReturning, mockSelectLimit } = vi.hoisted(
  () => ({
    mockOnConflictDoNothing: vi.fn(),
    mockReturning: vi.fn(),
    mockSelectLimit: vi.fn(),
  })
);

vi.mock('@/lib/db', () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoNothing: mockOnConflictDoNothing,
      })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: mockSelectLimit,
        })),
      })),
    })),
  },
}));

describe('ensureBetterAuthTestUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnConflictDoNothing.mockReturnValue({ returning: mockReturning });
  });

  it('returns the newly inserted deterministic identity', async () => {
    mockReturning.mockResolvedValue([{ id: 'new-better-auth-user' }]);
    const { ensureBetterAuthTestUser } = await import(
      '@/lib/testing/test-user-provision.server'
    );

    await expect(
      ensureBetterAuthTestUser({
        email: 'Browse+Clerk_Test@Jov.ie',
        fullName: 'Browse Creator',
      })
    ).resolves.toBe('new-better-auth-user');

    expect(mockSelectLimit).not.toHaveBeenCalled();
  });

  it('converges on an identity after either unique key conflicts', async () => {
    mockReturning.mockResolvedValue([]);
    mockSelectLimit.mockResolvedValue([{ id: 'existing-better-auth-user' }]);
    const { ensureBetterAuthTestUser } = await import(
      '@/lib/testing/test-user-provision.server'
    );

    await expect(
      ensureBetterAuthTestUser({
        email: 'Browse+Clerk_Test@Jov.ie',
        fullName: 'Browse Creator',
      })
    ).resolves.toBe('existing-better-auth-user');
  });

  it('fails closed if a conflict cannot be resolved', async () => {
    mockReturning.mockResolvedValue([]);
    mockSelectLimit.mockResolvedValue([]);
    const { ensureBetterAuthTestUser } = await import(
      '@/lib/testing/test-user-provision.server'
    );

    await expect(
      ensureBetterAuthTestUser({
        email: 'browse+clerk_test@jov.ie',
        fullName: 'Browse Creator',
      })
    ).rejects.toThrow('Better Auth test user conflict could not be resolved');
  });
});
