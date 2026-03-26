import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockLimit = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        innerJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: mockLimit,
          })),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(),
      })),
    })),
  },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

vi.mock('@/lib/pre-save/spotify', () => ({
  refreshSpotifyAccessToken: vi.fn(),
  saveReleaseToSpotifyLibrary: vi.fn(),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

describe('GET /api/cron/process-pre-saves', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubEnv('CRON_SECRET', 'test-secret');
    mockLimit.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 401 for invalid cron auth', async () => {
    const { GET } = await import('@/app/api/cron/process-pre-saves/route');
    const response = await GET(
      new Request('http://localhost/api/cron/process-pre-saves', {
        headers: { Authorization: 'Bearer wrong-secret' },
      })
    );

    expect(response.status).toBe(401);
  });

  it('returns an empty success payload when there are no eligible rows', async () => {
    const { GET } = await import('@/app/api/cron/process-pre-saves/route');
    const response = await GET(
      new Request('http://localhost/api/cron/process-pre-saves', {
        headers: { Authorization: 'Bearer test-secret' },
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      processed: 0,
      failed: 0,
      total: 0,
    });
  });
});
