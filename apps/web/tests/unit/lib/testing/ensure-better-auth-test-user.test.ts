import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockOnConflictDoUpdate, mockReturning } = vi.hoisted(() => ({
  mockOnConflictDoUpdate: vi.fn(),
  mockReturning: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoUpdate: mockOnConflictDoUpdate,
      })),
    })),
  },
}));

describe('ensureBetterAuthTestUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnConflictDoUpdate.mockReturnValue({ returning: mockReturning });
  });

  it('converges on the user already owning the unique email', async () => {
    mockReturning.mockResolvedValue([{ id: 'existing-better-auth-user' }]);
    const { ensureBetterAuthTestUser } = await import(
      '@/lib/testing/test-user-provision.server'
    );

    await expect(
      ensureBetterAuthTestUser({
        email: 'Browse+Clerk_Test@Jov.ie',
        fullName: 'Browse Creator',
      })
    ).resolves.toBe('existing-better-auth-user');

    expect(mockOnConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({ name: 'email' }),
        set: expect.objectContaining({
          name: 'Browse Creator',
          emailVerified: true,
        }),
      })
    );
  });

  it('fails closed if the atomic upsert returns no identity', async () => {
    mockReturning.mockResolvedValue([]);
    const { ensureBetterAuthTestUser } = await import(
      '@/lib/testing/test-user-provision.server'
    );

    await expect(
      ensureBetterAuthTestUser({
        email: 'browse+clerk_test@jov.ie',
        fullName: 'Browse Creator',
      })
    ).rejects.toThrow('Better Auth test user upsert returned no user');
  });
});
