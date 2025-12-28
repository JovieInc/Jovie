import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDbDelete = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  db: {
    delete: mockDbDelete,
  },
}));

vi.mock('@/lib/db/schema', () => ({
  idempotencyKeys: {},
}));

describe('GET /api/cron/cleanup-idempotency-keys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.CRON_SECRET = 'test-secret';
  });

  it('returns 401 without proper authorization in production', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const { GET } = await import(
      '@/app/api/cron/cleanup-idempotency-keys/route'
    );
    const request = new Request(
      'http://localhost/api/cron/cleanup-idempotency-keys',
      {
        headers: { Authorization: 'Bearer wrong-secret' },
      }
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');

    process.env.NODE_ENV = originalEnv;
  });

  it('cleans up expired idempotency keys', async () => {
    mockDbDelete.mockReturnValue({
      where: vi.fn().mockResolvedValue({ rowCount: 5 }),
    });

    const { GET } = await import(
      '@/app/api/cron/cleanup-idempotency-keys/route'
    );
    const request = new Request(
      'http://localhost/api/cron/cleanup-idempotency-keys',
      {
        headers: { Authorization: 'Bearer test-secret' },
      }
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBeDefined();
  });
});
