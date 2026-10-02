import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCheckDbHealth = vi.hoisted(() => vi.fn());
const mockCheckDbPerformance = vi.hoisted(() => vi.fn());
const mockValidateDbConnection = vi.hoisted(() => vi.fn());
const mockDbExecute = vi.hoisted(() => vi.fn());
const mockGetPoolMetrics = vi.hoisted(() => vi.fn());
const mockValidateEnvironment = vi.hoisted(() => vi.fn());
const mockGetFeaturedCreators = vi.hoisted(() => vi.fn());
const mockGetOptionalAuth = vi.hoisted(() => vi.fn());
const mockRequireAdmin = vi.hoisted(() => vi.fn());
const mockEnv = vi.hoisted(() => ({
  DATABASE_URL: 'postgres://test',
  BETTER_AUTH_SECRET: 'secret',
  STRIPE_SECRET_KEY: 'sk_test',
  NODE_ENV: 'test',
  CRON_SECRET: 'cron-secret',
}));
const mockPublicEnv = vi.hoisted(() => ({
  NEXT_PUBLIC_BETTER_AUTH_URL: 'http://localhost',
  NEXT_PUBLIC_APP_URL: 'http://localhost',
}));

vi.mock('@/lib/admin', () => ({ requireAdmin: mockRequireAdmin }));
vi.mock('@/lib/rate-limit', () => ({
  healthLimiter: {
    limit: async () => ({
      success: true,
      limit: 30,
      remaining: 29,
      reset: new Date(),
    }),
  },
  createRateLimitHeaders: () => ({}),
  getClientIP: () => '127.0.0.1',
}));
vi.mock('@/lib/db', () => ({
  db: { execute: mockDbExecute },
  checkDbHealth: mockCheckDbHealth,
  checkDbPerformance: mockCheckDbPerformance,
  validateDbConnection: mockValidateDbConnection,
  getDbConfig: () => ({ maxConnections: 1 }),
  dbCircuitBreaker: { getStats: () => ({ state: 'closed' }) },
  getPoolMetrics: mockGetPoolMetrics,
}));
vi.mock('@/lib/db/config', () => ({
  HEALTH_CHECK_CONFIG: {
    cacheHeaders: {},
    statusCodes: { healthy: 200, unhealthy: 503 },
  },
  PERFORMANCE_THRESHOLDS: {
    simpleQueryMax: 100,
    transactionTimeMax: 200,
    warningMultiplier: 0.8,
  },
}));
vi.mock('@/lib/env-server', () => ({
  env: mockEnv,
  validateEnvironment: mockValidateEnvironment,
  getEnvironmentInfo: () => ({
    nodeEnv: 'test',
    platform: 'linux',
    nodeVersion: 'v22.0.0',
    hasDatabase: true,
    hasClerk: false,
    hasStripe: false,
    hasVercelBlob: false,
  }),
}));
vi.mock('@/lib/env-public', () => ({ publicEnv: mockPublicEnv }));
vi.mock('@/lib/startup/environment-validator', () => ({
  validateDatabaseEnvironment: () => ({ valid: true }),
  isValidationCompleted: () => true,
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/error-tracking', () => ({ captureWarning: vi.fn() }));
vi.mock('@/lib/featured-creators', () => ({
  getFeaturedCreators: mockGetFeaturedCreators,
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => ({ get: () => null }),
}));
vi.mock('@/lib/auth/cached', () => ({ getOptionalAuth: mockGetOptionalAuth }));
vi.mock('@/lib/auth/session', () => ({ getDbUser: vi.fn() }));
vi.mock('@/lib/db/schema/profiles', () => ({ creatorProfiles: {} }));
vi.mock('@/lib/auth/test-mode', () => ({
  isTestAuthBypassEnabled: () => false,
  resolveTestBypassUserId: () => 'bypass-user',
}));

const DETAIL_KEYS = [
  'checks',
  'database',
  'details',
  'devFast',
  'error',
  'issues',
  'message',
  'metrics',
  'pool',
  'profile',
  'recommended',
  'required',
  'service',
  'status',
  'summary',
  'userId',
];

async function expectLiveness(response: Response, healthy: boolean) {
  const body = (await response.json()) as Record<string, unknown>;
  expect(response.status).toBe(healthy ? 200 : 503);
  expect(Object.keys(body).sort()).toEqual(['healthy', 'timestamp']);
  expect(body.healthy).toBe(healthy);
  for (const key of DETAIL_KEYS) expect(body).not.toHaveProperty(key);
  expect(response.headers.get('Cache-Control')).toContain('private, no-store');
  expect(response.headers.get('Vary')).toBe('Authorization, Cookie');
  expect(JSON.stringify(body)).not.toMatch(/DATABASE_URL|STRIPE|timeout/);
}

describe('anonymous /api/health liveness contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    );
    mockEnv.DATABASE_URL = 'postgres://test';
    mockEnv.BETTER_AUTH_SECRET = 'secret';
    mockPublicEnv.NEXT_PUBLIC_BETTER_AUTH_URL = 'http://localhost';
    mockDbExecute.mockResolvedValue(undefined);
    mockCheckDbHealth.mockResolvedValue({ healthy: true, latency: 4 });
    mockCheckDbPerformance.mockResolvedValue({
      healthy: false,
      error: 'slow',
      metrics: {},
    });
    mockValidateDbConnection.mockResolvedValue({
      connected: false,
      error: 'timeout',
    });
    mockValidateEnvironment.mockReturnValue({
      valid: false,
      errors: ['STRIPE_SECRET_KEY missing'],
      warnings: [],
      critical: ['DATABASE_URL invalid'],
    });
    mockGetPoolMetrics.mockReturnValue({});
    mockGetFeaturedCreators.mockResolvedValue([{ id: 'creator' }]);
    mockGetOptionalAuth.mockResolvedValue({ userId: 'user_should_not_leak' });
    vi.unstubAllEnvs();
  });

  it('keeps root success as {status:ok} and strips failure detail', async () => {
    const { GET } = await import('@/app/api/health/route');
    const ok = await GET(new Request('http://localhost/api/health'));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ status: 'ok' });
    expect(ok.headers.get('Vary')).toBe('Authorization, Cookie');
    mockDbExecute.mockRejectedValueOnce(new Error('connection refused'));
    await expectLiveness(
      await GET(new Request('http://localhost/api/health')),
      false
    );
  });

  it('hides detail keys and skips work that is not liveness', async () => {
    const db = await import('@/app/api/health/db/route');
    const performance = await import('@/app/api/health/db/performance/route');
    const comprehensive = await import('@/app/api/health/comprehensive/route');
    const homepage = await import('@/app/api/health/homepage/route');
    const env = await import('@/app/api/health/env/route');
    const keys = await import('@/app/api/health/keys/route');
    const deploy = await import('@/app/api/health/deploy/route');

    await expectLiveness(
      await db.GET(new Request('http://localhost/api/health/db')),
      true
    );
    expect(mockCheckDbHealth).toHaveBeenCalledOnce();
    expect(mockGetPoolMetrics).not.toHaveBeenCalled();
    await expectLiveness(
      await performance.GET(
        new Request('http://localhost/api/health/db/performance')
      ),
      true
    );
    await expectLiveness(
      await comprehensive.GET(
        new Request('http://localhost/api/health/comprehensive')
      ),
      true
    );
    expect(mockValidateEnvironment).not.toHaveBeenCalled();
    await expectLiveness(
      await homepage.GET(new Request('http://localhost/api/health/homepage')),
      true
    );
    mockEnv.DATABASE_URL = '';
    mockEnv.BETTER_AUTH_SECRET = '';
    mockPublicEnv.NEXT_PUBLIC_BETTER_AUTH_URL = '';
    await expectLiveness(
      await env.GET(new Request('http://localhost/api/health/env')),
      false
    );
    await expectLiveness(
      await keys.GET(new Request('http://localhost/api/health/keys')),
      false
    );
    await expectLiveness(
      await deploy.GET(new Request('http://localhost/api/health/deploy')),
      false
    );
    expect(mockCheckDbPerformance).not.toHaveBeenCalled();
    expect(mockGetFeaturedCreators).not.toHaveBeenCalled();
    expect(mockValidateDbConnection).toHaveBeenCalledOnce();
    expect(mockRequireAdmin).not.toHaveBeenCalled();
  });

  it('returns db detail for cron bearer or admin and liveness for a non-admin', async () => {
    const { GET } = await import('@/app/api/health/db/route');
    const cron = await GET(
      new Request('http://localhost/api/health/db', {
        headers: { authorization: 'Bearer cron-secret' },
      })
    );
    expect(cron.status).toBe(200);
    expect((await cron.json()).details.pool).toEqual({});
    expect(mockGetPoolMetrics).toHaveBeenCalled();

    mockRequireAdmin.mockResolvedValueOnce(null);
    const admin = await GET(
      new Request('http://localhost/api/health/db', {
        headers: { cookie: 'better-auth.session_token=signed' },
      })
    );
    expect((await admin.json()).service).toBe('db');

    const rejected = await GET(
      new Request('http://localhost/api/health/db', {
        headers: { cookie: 'better-auth.session_token=signed' },
      })
    );
    await expectLiveness(rejected, true);
  });

  it('does not read the auth session outside production', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    const { GET } = await import('@/app/api/health/auth/route');
    await expectLiveness(
      await GET(new Request('http://localhost/api/health/auth')),
      true
    );
    expect(mockGetOptionalAuth).not.toHaveBeenCalled();
  });
});
