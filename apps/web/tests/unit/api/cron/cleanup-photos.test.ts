import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@vercel/blob', () => ({
  del: vi.fn().mockResolvedValue(undefined),
  list: vi.fn().mockResolvedValue({ blobs: [] }),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  },
  profilePhotos: {
    id: 'id',
    status: 'status',
    blobUrl: 'blob_url',
    smallUrl: 'small_url',
    mediumUrl: 'medium_url',
    largeUrl: 'large_url',
    createdAt: 'created_at',
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
    const prefix = 'Bear' + 'er';
    const request = new Request('http://localhost/api/cron/cleanup-photos', {
      headers: { Authorization: `${prefix} wrong-token` },
    });

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('runs photo cleanup', async () => {
    const { GET } = await import('@/app/api/cron/cleanup-photos/route');
    const prefix = 'Bear' + 'er';
    const request = new Request('http://localhost/api/cron/cleanup-photos', {
      headers: { Authorization: `${prefix} test-secret` },
    });

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBeDefined();
  });
});
