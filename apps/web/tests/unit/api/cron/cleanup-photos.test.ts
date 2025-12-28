import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@vercel/blob', () => ({
  del: vi.fn().mockResolvedValue(undefined),
  list: vi.fn().mockResolvedValue({ blobs: [] }),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockResolvedValue([]),
    }),
  },
}));

vi.mock('@/lib/db/schema', () => ({
  creatorProfiles: {},
}));

describe('GET /api/cron/cleanup-photos', () => {
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

    const { GET } = await import('@/app/api/cron/cleanup-photos/route');
    const request = new NextRequest(
      'http://localhost/api/cron/cleanup-photos',
      {
        headers: { Authorization: 'Bearer wrong-secret' },
      }
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('runs photo cleanup', async () => {
    const { GET } = await import('@/app/api/cron/cleanup-photos/route');
    const request = new NextRequest(
      'http://localhost/api/cron/cleanup-photos',
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
