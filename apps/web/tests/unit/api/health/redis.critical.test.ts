import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPing = vi.hoisted(() => vi.fn());
const mockCaptureWarning = vi.hoisted(() => vi.fn());

vi.mock('@/lib/redis', () => ({
  getRedis: vi.fn(() => ({ ping: mockPing })),
}));
vi.mock('@/lib/error-tracking', () => ({ captureWarning: mockCaptureWarning }));

describe('@critical GET /api/health/redis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('captures warning when redis ping fails', async () => {
    mockPing.mockRejectedValue(new Error('Redis down'));
    const { GET } = await import('@/app/api/health/redis/route');
    const response = await GET();
    expect(response.status).toBe(503);
    expect(mockCaptureWarning).toHaveBeenCalledWith(
      'Redis health check failed',
      expect.any(Error),
      expect.objectContaining({ service: 'redis', route: '/api/health/redis' })
    );
  });
});
