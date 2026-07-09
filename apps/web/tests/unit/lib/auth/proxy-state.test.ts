import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockInvalidateAdminCache, mockInvalidateBanStatusCache } = vi.hoisted(
  () => ({
    mockInvalidateAdminCache: vi.fn(),
    mockInvalidateBanStatusCache: vi.fn(),
  })
);

vi.mock('server-only', () => ({}));

vi.mock('@/lib/admin/roles', () => ({
  invalidateAdminCache: mockInvalidateAdminCache,
}));

vi.mock('@/lib/auth/ban-check', () => ({
  invalidateBanStatusCache: mockInvalidateBanStatusCache,
}));

describe('proxy-state.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockInvalidateAdminCache.mockReturnValue(undefined);
    mockInvalidateBanStatusCache.mockResolvedValue(undefined);
  });

  it('invalidates ban and admin caches for the user', async () => {
    const { invalidateProxyUserStateCache } = await import(
      '@/lib/auth/proxy-state'
    );

    await invalidateProxyUserStateCache('user_123');

    expect(mockInvalidateBanStatusCache).toHaveBeenCalledWith('user_123');
    expect(mockInvalidateAdminCache).toHaveBeenCalledWith('user_123');
  });

  it('settles when one cache invalidation rejects', async () => {
    mockInvalidateBanStatusCache.mockRejectedValueOnce(new Error('redis down'));

    const { invalidateProxyUserStateCache } = await import(
      '@/lib/auth/proxy-state'
    );

    await expect(
      invalidateProxyUserStateCache('user_123')
    ).resolves.toBeUndefined();

    expect(mockInvalidateAdminCache).toHaveBeenCalledWith('user_123');
  });
});
