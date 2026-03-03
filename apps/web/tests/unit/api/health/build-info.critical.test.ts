import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCaptureWarning = vi.hoisted(() => vi.fn());

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    default: actual,
    readFileSync: vi.fn(() => {
      throw new Error('missing build id');
    }),
  };
});

vi.mock('@/lib/error-tracking', () => ({ captureWarning: mockCaptureWarning }));

describe('@critical GET /api/health/build-info', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('captures warning when build info read fails', async () => {
    const { GET } = await import('@/app/api/health/build-info/route');
    const response = GET();
    expect(response.status).toBe(200);
    expect(mockCaptureWarning).toHaveBeenCalledWith(
      'Build info health check failed',
      expect.any(Error),
      expect.objectContaining({
        service: 'build-info',
        route: '/api/health/build-info',
      })
    );
  });
});
