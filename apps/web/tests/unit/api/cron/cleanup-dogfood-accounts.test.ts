import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockCleanup = vi.hoisted(() => vi.fn());
const mockAtomic = vi.hoisted(() => vi.fn());

vi.mock('@/lib/accounts/dogfood-tmp-cleanup', () => ({
  runDogfoodTmpCleanup: mockCleanup,
}));
vi.mock('@/lib/db/legacy-transaction', () => ({
  runAtomicDbOperation: mockAtomic,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
const mockInvalidateHandle = vi.hoisted(() => vi.fn());
const mockInvalidateProfile = vi.hoisted(() => vi.fn());
vi.mock('@/lib/onboarding/handle-availability-cache', () => ({
  invalidateHandleCache: mockInvalidateHandle,
}));
vi.mock('@/lib/cache/profile', () => ({
  invalidateProfileCache: mockInvalidateProfile,
}));

const ROUTE = 'http://localhost/api/cron/cleanup-dogfood-accounts';
const auth = { Authorization: `${'Bear' + 'er'} test-secret` };

describe('GET /api/cron/cleanup-dogfood-accounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubEnv('CRON_SECRET', 'test-secret');
    vi.stubEnv('NODE_ENV', 'production');
    mockCleanup.mockImplementation(async (_db, options) => ({
      mode: options.apply ? 'apply' : 'dry-run',
      matched: 1,
      removed: options.apply ? 1 : 0,
    }));
  });

  afterEach(() => vi.unstubAllEnvs());

  it('refuses a request without the cron secret and runs nothing', async () => {
    const { GET } = await import(
      '@/app/api/cron/cleanup-dogfood-accounts/route'
    );
    const response = await GET(
      new NextRequest(ROUTE, {
        headers: { Authorization: `${'Bear' + 'er'} wrong` },
      })
    );
    expect(response.status).toBe(401);
    expect(mockCleanup).not.toHaveBeenCalled();
  });

  it('is a dry run by default', async () => {
    const { GET } = await import(
      '@/app/api/cron/cleanup-dogfood-accounts/route'
    );
    const response = await GET(new NextRequest(ROUTE, { headers: auth }));
    expect(response.status).toBe(200);
    expect(mockCleanup.mock.calls[0]?.[1]).toMatchObject({ apply: false });
    expect(await response.json()).toMatchObject({
      success: true,
      mode: 'dry-run',
      removed: 0,
    });
  });

  it('applies only with apply=1, as the system actor', async () => {
    const { GET } = await import(
      '@/app/api/cron/cleanup-dogfood-accounts/route'
    );
    const response = await GET(
      new NextRequest(`${ROUTE}?apply=1`, { headers: auth })
    );
    expect(await response.json()).toMatchObject({ mode: 'apply', removed: 1 });
    const [db, options] = mockCleanup.mock.calls[0]!;
    await db.atomic(async () => null);
    await options.afterRemoval(['walk1']);
    expect(mockInvalidateHandle).toHaveBeenCalledWith('walk1');
    expect(mockInvalidateProfile).toHaveBeenCalledWith('walk1');
    expect(mockAtomic).toHaveBeenCalledWith(expect.any(Function), {
      actorId: 'jovie-dogfood-tmp-cleanup',
      system: true,
      retry: 'never',
    });
    for (const value of ['true', 'yes', '0']) {
      mockCleanup.mockClear();
      await GET(new NextRequest(`${ROUTE}?apply=${value}`, { headers: auth }));
      expect(mockCleanup.mock.calls[0]?.[1]).toMatchObject({ apply: false });
    }
  });

  it('returns 500 without details when cleanup fails', async () => {
    mockCleanup.mockRejectedValue(new Error('boom'));
    const { GET } = await import(
      '@/app/api/cron/cleanup-dogfood-accounts/route'
    );
    const response = await GET(new NextRequest(ROUTE, { headers: auth }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      success: false,
      error: 'cleanup_failed',
    });
  });
});
