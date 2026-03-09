import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetFeaturedCreators = vi.hoisted(() => vi.fn());
const mockCaptureWarning = vi.hoisted(() => vi.fn());

vi.mock('@/lib/featured-creators', () => ({
  getFeaturedCreators: mockGetFeaturedCreators,
}));
vi.mock('@/lib/error-tracking', () => ({ captureWarning: mockCaptureWarning }));

describe('@critical GET /api/health/homepage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('captures warning when featured creators fetch fails', async () => {
    mockGetFeaturedCreators.mockRejectedValue(new Error('db offline'));
    const { GET } = await import('@/app/api/health/homepage/route');
    const response = await GET();
    expect(response.status).toBe(503);
    expect(mockCaptureWarning).toHaveBeenCalledWith(
      'Featured creators check failed in health endpoint',
      expect.any(Error),
      expect.objectContaining({
        service: 'homepage',
        route: '/api/health/homepage',
      })
    );
  });
});
