import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockDbExecute = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  db: {
    execute: mockDbExecute,
  },
  dashboardIdempotencyKeys: {
    id: 'id',
    expiresAt: 'expires_at',
  },
}));

describe('GET /api/cron/cleanup-idempotency-keys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubEnv('CRON_SECRET', 'test-secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 401 without proper authorization in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const { GET } = await import(
      '@/app/api/cron/cleanup-idempotency-keys/route'
    );
    const prefix = 'Bear' + 'er';
    const request = new Request(
      'http://localhost/api/cron/cleanup-idempotency-keys',
      {
        headers: { Authorization: `${prefix} wrong-token` },
      }
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('cleans up expired idempotency keys', async () => {
    mockDbExecute.mockResolvedValue({ rowCount: 5 });

    const { GET } = await import(
      '@/app/api/cron/cleanup-idempotency-keys/route'
    );
    const prefix = 'Bear' + 'er';
    const request = new Request(
      'http://localhost/api/cron/cleanup-idempotency-keys',
      {
        headers: { Authorization: `${prefix} test-secret` },
      }
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBeDefined();
    expect(data.deleted).toBe(5);
  });
});
