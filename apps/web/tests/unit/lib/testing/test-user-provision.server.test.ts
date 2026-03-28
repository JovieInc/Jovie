import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCreateUser, mockGetUserList } = vi.hoisted(() => ({
  mockCreateUser: vi.fn(),
  mockGetUserList: vi.fn(),
}));

vi.mock('@clerk/backend', () => ({
  createClerkClient: vi.fn(() => ({
    users: {
      createUser: mockCreateUser,
      getUserList: mockGetUserList,
    },
  })),
}));

describe('test-user-provision.server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_123');
  });

  it('reuses the Clerk user when createUser races with an existing identifier', async () => {
    mockGetUserList
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [{ id: 'user_existing' }] });
    mockCreateUser.mockRejectedValue({
      status: 422,
      errors: [{ code: 'form_identifier_exists' }],
    });

    const { ensureClerkTestUser } = await import(
      '@/lib/testing/test-user-provision.server'
    );

    await expect(
      ensureClerkTestUser({
        email: 'browse+clerk_test@jov.ie',
        username: 'browse-test-user',
        firstName: 'Browse',
        lastName: 'Test',
      })
    ).resolves.toBe('user_existing');

    expect(mockGetUserList).toHaveBeenCalledTimes(2);
  });
});
