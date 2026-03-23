import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockCaptureWarning = vi.hoisted(() => vi.fn());
const mutableEnv = process.env as Record<string, string | undefined>;

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
    vi.resetModules();
  });

  afterEach(() => {
    delete mutableEnv.NODE_ENV;
  });

  it('captures warning when build info read fails in production', async () => {
    mutableEnv.NODE_ENV = 'production';

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
