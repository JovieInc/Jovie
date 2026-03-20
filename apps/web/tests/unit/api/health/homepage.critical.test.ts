import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('@critical GET /api/health/homepage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns healthy status for the static homepage', async () => {
    const { GET } = await import('@/app/api/health/homepage/route');
    const response = await GET();
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload).toMatchObject({
      status: 'healthy',
      checks: {
        staticHomepage: {
          status: 'healthy',
          mode: 'static',
        },
      },
    });
  });
});
