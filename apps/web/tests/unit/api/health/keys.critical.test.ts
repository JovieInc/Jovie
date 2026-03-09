import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCaptureWarning = vi.hoisted(() => vi.fn());

vi.mock('@/lib/env-server', () => ({ env: { DATABASE_URL: '' } }));
vi.mock('@/lib/env-public', () => ({
  publicEnv: { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: '' },
}));
vi.mock('@/lib/error-tracking', () => ({ captureWarning: mockCaptureWarning }));

describe('@critical GET /api/health/keys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('captures warning when required keys are missing', async () => {
    const { GET } = await import('@/app/api/health/keys/route');
    const response = await GET();
    expect(response.status).toBe(503);
    expect(mockCaptureWarning).toHaveBeenCalledWith(
      'Required keys health check failed',
      undefined,
      expect.objectContaining({ route: '/api/health/keys' })
    );
  });
});
