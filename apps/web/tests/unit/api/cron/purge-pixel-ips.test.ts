import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockExecute = vi.hoisted(() => vi.fn());

vi.mock('@sentry/nextjs', () => ({
  captureCheckIn: vi.fn(() => 'check-in-id'),
}));

vi.mock('@/lib/db', () => ({
  db: {
    execute: mockExecute,
  },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

vi.mock('@/lib/http/headers', () => ({
  NO_STORE_HEADERS: { 'Cache-Control': 'no-store' },
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('GET /api/cron/purge-pixel-ips', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubEnv('CRON_SECRET', 'test-secret');
    mockExecute.mockResolvedValue({ rowCount: 12 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 401 for invalid cron auth', async () => {
    const { GET } = await import('@/app/api/cron/purge-pixel-ips/route');
    const response = await GET(
      new Request('http://localhost/api/cron/purge-pixel-ips', {
        headers: { Authorization: 'Bearer wrong-secret' },
      })
    );

    expect(response.status).toBe(401);
  });

  it('purges IPs with valid auth', async () => {
    const { GET } = await import('@/app/api/cron/purge-pixel-ips/route');
    const response = await GET(
      new Request('http://localhost/api/cron/purge-pixel-ips', {
        headers: { Authorization: 'Bearer test-secret' },
      })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.purgedCount).toBe(12);
  });
});
