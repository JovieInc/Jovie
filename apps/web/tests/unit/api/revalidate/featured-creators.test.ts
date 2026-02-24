import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRevalidateTag = vi.hoisted(() => vi.fn());
const mockUpdateTag = vi.hoisted(() => vi.fn());
const mockCaptureError = vi.hoisted(() => vi.fn());

vi.mock('next/cache', () => ({
  revalidateTag: mockRevalidateTag,
  updateTag: mockUpdateTag,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

describe('POST /api/revalidate/featured-creators', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.REVALIDATE_SECRET = 'unit-test-token';
  });

  it('returns 401 without proper authorization', async () => {
    const { POST } = await import(
      '@/app/api/revalidate/featured-creators/route'
    );
    const request = new Request(
      'http://localhost/api/revalidate/featured-creators',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer wrong-token' },
      }
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('revalidates with proper authorization', async () => {
    const { POST } = await import(
      '@/app/api/revalidate/featured-creators/route'
    );
    const request = new Request(
      'http://localhost/api/revalidate/featured-creators',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer unit-test-token' },
      }
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.revalidated).toBe(true);
    expect(mockUpdateTag).toHaveBeenCalledWith('featured-creators');
    expect(mockRevalidateTag).toHaveBeenCalledWith('featured-creators', 'max');
  });

  it('captures errors when revalidation fails', async () => {
    mockUpdateTag.mockImplementationOnce(() => {
      throw new Error('cache unavailable');
    });

    const { POST } = await import(
      '@/app/api/revalidate/featured-creators/route'
    );
    const request = new Request(
      'http://localhost/api/revalidate/featured-creators',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer unit-test-token' },
      }
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Revalidation failed');
    expect(mockCaptureError).toHaveBeenCalledWith(
      'Featured creators revalidation failed',
      expect.any(Error),
      expect.objectContaining({
        context: 'api-revalidate-featured-creators',
        endpoint: '/api/revalidate/featured-creators',
      })
    );
  });
});
