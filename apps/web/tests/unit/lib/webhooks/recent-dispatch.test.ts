import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetRedis = vi.hoisted(() => vi.fn());
const mockExists = vi.hoisted(() => vi.fn());
const mockSet = vi.hoisted(() => vi.fn());
const mockDel = vi.hoisted(() => vi.fn());

vi.mock('@/lib/redis', () => ({
  getRedis: mockGetRedis,
}));

describe('recent-dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockGetRedis.mockReturnValue({
      exists: mockExists,
      set: mockSet,
      del: mockDel,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('acquireRecentDispatch deduplicates repeated keys via Redis NX', async () => {
    mockSet.mockResolvedValueOnce('OK').mockResolvedValueOnce(null);

    const { acquireRecentDispatch } = await import(
      '@/lib/webhooks/recent-dispatch'
    );

    await expect(
      acquireRecentDispatch('linear', 'issue_1', 60)
    ).resolves.toEqual({
      acquired: true,
      reason: 'acquired',
    });
    await expect(
      acquireRecentDispatch('linear', 'issue_1', 60)
    ).resolves.toEqual({
      acquired: false,
      reason: 'duplicate',
    });

    expect(mockSet).toHaveBeenNthCalledWith(
      1,
      'webhook-dispatch:linear:issue_1',
      expect.any(String),
      { nx: true, ex: 60 }
    );
  });

  it('clearRecentDispatch releases key so failed events remain retryable', async () => {
    const { clearRecentDispatch } = await import(
      '@/lib/webhooks/recent-dispatch'
    );

    await clearRecentDispatch('sentry', '42');

    expect(mockDel).toHaveBeenCalledWith('webhook-dispatch:sentry:42');
  });

  it('hasRecentDispatch returns false when Redis is unavailable', async () => {
    mockGetRedis.mockReturnValue(null);

    const { hasRecentDispatch } = await import(
      '@/lib/webhooks/recent-dispatch'
    );

    await expect(hasRecentDispatch('linear', 'issue_1')).resolves.toBe(false);
  });

  it('fails closed in production when Redis is unavailable', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    mockGetRedis.mockReturnValue(null);

    const { acquireRecentDispatch } = await import(
      '@/lib/webhooks/recent-dispatch'
    );

    await expect(
      acquireRecentDispatch('linear', 'issue_1', 60)
    ).resolves.toEqual({
      acquired: false,
      reason: 'backend_unavailable',
    });
  });
});
