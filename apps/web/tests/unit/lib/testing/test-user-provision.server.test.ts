import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCreateUser, mockGetUserList } = vi.hoisted(() => ({
  mockCreateUser: vi.fn(),
  mockGetUserList: vi.fn(),
}));

const { mockInvalidateProxyUserStateCache, mockRedisDel, mockRevalidateTag } =
  vi.hoisted(() => ({
    mockInvalidateProxyUserStateCache: vi.fn(),
    mockRedisDel: vi.fn(),
    mockRevalidateTag: vi.fn(),
  }));

vi.mock('@clerk/backend', () => ({
  createClerkClient: vi.fn(() => ({
    users: {
      createUser: mockCreateUser,
      getUserList: mockGetUserList,
    },
  })),
}));

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation(function MockRedis() {
    return {
      del: mockRedisDel,
    };
  }),
}));

vi.mock('next/cache', () => ({
  revalidateTag: mockRevalidateTag,
}));

vi.mock('@/lib/auth/proxy-state', () => ({
  invalidateProxyUserStateCache: mockInvalidateProxyUserStateCache,
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

  it('does not call Clerk for non-allowlisted emails', async () => {
    const { ensureClerkTestUser } = await import(
      '@/lib/testing/test-user-provision.server'
    );

    await expect(
      ensureClerkTestUser({
        email: 'person@example.com',
        username: 'person',
        firstName: 'Person',
        lastName: 'Example',
      })
    ).resolves.toBe('user_dev_person_example_com');

    expect(mockGetUserList).not.toHaveBeenCalled();
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it('keeps privileged seeding narrower than the generic browse allowlist', async () => {
    const {
      isAllowlistedPrivilegedTestAccountEmail,
      isAllowlistedTestAccountEmail,
    } = await import('@/lib/testing/test-user-provision.server');

    expect(isAllowlistedTestAccountEmail('browse+clerk_test@jov.ie')).toBe(
      true
    );
    expect(
      isAllowlistedPrivilegedTestAccountEmail('browse+clerk_test@jov.ie')
    ).toBe(false);
    expect(
      isAllowlistedPrivilegedTestAccountEmail('e2e+clerk_test@jov.ie')
    ).toBe(true);
  });

  it('clears proxy-state and dashboard caches for reprovisioned test users', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example.com');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');

    const { invalidateTestUserCaches } = await import(
      '@/lib/testing/test-user-provision.server'
    );

    await invalidateTestUserCaches(['user_123', 'user_456']);

    expect(mockInvalidateProxyUserStateCache).toHaveBeenCalledTimes(2);
    expect(mockInvalidateProxyUserStateCache).toHaveBeenNthCalledWith(
      1,
      'user_123'
    );
    expect(mockInvalidateProxyUserStateCache).toHaveBeenNthCalledWith(
      2,
      'user_456'
    );
    expect(mockRevalidateTag).toHaveBeenCalledWith('dashboard-data', 'max');
    expect(mockRedisDel).toHaveBeenCalledWith('admin:role:user_123');
    expect(mockRedisDel).toHaveBeenCalledWith('admin:role:user_456');
  });
});
