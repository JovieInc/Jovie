import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuth = vi.hoisted(() => vi.fn());
const mockGetUserBillingInfo = vi.hoisted(() => vi.fn());
const mockGetRedis = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mockAuth,
}));

vi.mock('@/lib/stripe/customer-sync', () => ({
  getUserBillingInfo: mockGetUserBillingInfo,
}));

vi.mock('@/lib/redis', () => ({
  getRedis: mockGetRedis,
}));

vi.mock('@sentry/nextjs', async importOriginal => {
  const actual = await importOriginal<typeof import('@sentry/nextjs')>();
  return {
    ...actual,
    captureException: vi.fn(),
    captureMessage: vi.fn(),
    addBreadcrumb: vi.fn(),
    getClient: vi.fn().mockReturnValue(null),
    captureRouterTransitionStart: vi.fn(),
    breadcrumbsIntegration: vi.fn(),
  };
});

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

async function loadRouteModule() {
  return import('@/app/api/billing/status/route');
}

describe('GET /api/billing/status', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockGetRedis.mockReturnValue(null);
  });

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const { GET } = await loadRouteModule();
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('returns billing status for authenticated user', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockGetUserBillingInfo.mockResolvedValue({
      success: true,
      data: {
        isPro: true,
        plan: 'pro',
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
      },
    });

    const { GET } = await loadRouteModule();
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.isPro).toBe(true);
    expect(data.plan).toBe('pro');
    expect(data.stripeCustomerId).toBe('cus_123');
    expect(data.stripeSubscriptionId).toBe('sub_123');
  });

  it('returns 503 when billing lookup fails (not silent downgrade)', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockGetUserBillingInfo.mockResolvedValue({
      success: false,
      error: 'database connection failed',
    });

    const { GET } = await loadRouteModule();
    const response = await GET();
    const data = await response.json();

    // Should return 503 so clients can distinguish "free" from "billing unavailable"
    expect(response.status).toBe(503);
    expect(data.error).toBe('Billing service temporarily unavailable');
  });

  it('returns cached billing status with stale flag when billing lookup fails', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_cached' });
    mockGetUserBillingInfo.mockResolvedValue({
      success: false,
      error: 'stripe timeout',
    });

    const mockRedis = {
      get: vi.fn().mockResolvedValue(
        JSON.stringify({
          payload: {
            isPro: true,
            plan: 'pro',
            stripeCustomerId: 'cus_cached',
            stripeSubscriptionId: 'sub_cached',
          },
          cachedAt: new Date().toISOString(),
        })
      ),
      set: vi.fn(),
    };
    mockGetRedis.mockReturnValue(mockRedis);

    const { GET } = await loadRouteModule();
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data._stale).toBe(true);
    expect(data._staleReason).toBe('Payment service temporarily unavailable');
    expect(data.isPro).toBe(true);
    expect(data.plan).toBe('pro');
    expect(data.stripeCustomerId).toBe('cus_cached');
    expect(data.stripeSubscriptionId).toBe('sub_cached');
  });

  it('returns free entitlements when user exists but has no billing data', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockGetUserBillingInfo.mockResolvedValue({
      success: true,
      data: null,
    });

    const { GET } = await loadRouteModule();
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.isPro).toBe(false);
    expect(data.plan).toBe('free');
    expect(data.stripeCustomerId).toBeNull();
    expect(data.stripeSubscriptionId).toBeNull();
  });

  it('returns 500 on unexpected error', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockGetUserBillingInfo.mockRejectedValue(new Error('Database error'));

    const { GET } = await loadRouteModule();
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to get billing status');
  });

  it('returns max user data correctly', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_max' });
    mockGetUserBillingInfo.mockResolvedValue({
      success: true,
      data: {
        userId: 'db_id',
        email: 'max@example.com',
        isAdmin: false,
        isPro: true,
        plan: 'max',
        stripeCustomerId: 'cus_max',
        stripeSubscriptionId: 'sub_max',
        billingVersion: 1,
        lastBillingEventAt: null,
      },
    });

    const { GET } = await loadRouteModule();
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.isPro).toBe(true);
    expect(data.plan).toBe('max');
  });

  it('defaults plan to free when plan is null in billing data', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_nullplan' });
    mockGetUserBillingInfo.mockResolvedValue({
      success: true,
      data: {
        userId: 'db_id',
        email: 'null@example.com',
        isAdmin: false,
        isPro: false,
        plan: null,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        billingVersion: 1,
        lastBillingEventAt: null,
      },
    });

    const { GET } = await loadRouteModule();
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.plan).toBe('free');
  });

  it('sets correct cache headers on success (private, 60s max-age)', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_cache' });
    mockGetUserBillingInfo.mockResolvedValue({
      success: true,
      data: {
        isPro: true,
        plan: 'pro',
        stripeCustomerId: 'cus_cache',
        stripeSubscriptionId: 'sub_cache',
      },
    });

    const { GET } = await loadRouteModule();
    const response = await GET();

    expect(response.headers.get('Cache-Control')).toBe(
      'private, max-age=60, stale-while-revalidate=300'
    );
  });

  it('writes billing status to cache on success', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_cache_write' });
    mockGetUserBillingInfo.mockResolvedValue({
      success: true,
      data: {
        isPro: true,
        plan: 'pro',
        stripeCustomerId: 'cus_write',
        stripeSubscriptionId: 'sub_write',
      },
    });

    const mockRedis = {
      get: vi.fn(),
      set: vi.fn().mockResolvedValue('OK'),
    };
    mockGetRedis.mockReturnValue(mockRedis);

    const { GET } = await loadRouteModule();
    await GET();

    expect(mockRedis.set).toHaveBeenCalledWith(
      expect.stringContaining('billing:status:v1:user_cache_write'),
      expect.any(String),
      expect.objectContaining({ ex: 3600 })
    );
  });

  it('sets no-store cache header on 401', async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const { GET } = await loadRouteModule();
    const response = await GET();

    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('sets no-store cache header on 503 billing failure', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_503' });
    mockGetUserBillingInfo.mockResolvedValue({
      success: false,
      error: 'timeout',
    });

    const { GET } = await loadRouteModule();
    const response = await GET();

    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('does not expose internal fields in the response', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_security' });
    mockGetUserBillingInfo.mockResolvedValue({
      success: true,
      data: {
        userId: 'internal_db_uuid',
        email: 'secret@example.com',
        isAdmin: true,
        isPro: true,
        plan: 'pro',
        stripeCustomerId: 'cus_sec',
        stripeSubscriptionId: 'sub_sec',
        billingVersion: 5,
        lastBillingEventAt: new Date(),
      },
    });

    const { GET } = await loadRouteModule();
    const response = await GET();
    const data = await response.json();

    // Should NOT leak internal fields
    expect(data).not.toHaveProperty('email');
    expect(data).not.toHaveProperty('userId');
    expect(data).not.toHaveProperty('isAdmin');
    expect(data).not.toHaveProperty('billingVersion');
    expect(data).not.toHaveProperty('lastBillingEventAt');
    // Should only contain the expected public fields
    expect(Object.keys(data).sort()).toEqual(
      [
        'isPro',
        'plan',
        'stripeCustomerId',
        'stripeSubscriptionId',
        'trialStartedAt',
        'trialEndsAt',
        'trialNotificationsSent',
      ].sort()
    );
  });
});
