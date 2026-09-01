import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getMedia: vi.fn(),
  deleteMedia: vi.fn(),
}));

vi.mock('@/lib/auth/require-auth', () => ({
  requireAuth: hoisted.requireAuth,
}));

vi.mock('@/lib/founder-review/server', () => ({
  getFounderReviewMedia: hoisted.getMedia,
  deleteFounderReviewMedia: hoisted.deleteMedia,
  FounderReviewError: class FounderReviewError extends Error {},
}));

vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));

const { GET, DELETE } = await import('./route');
const params = { params: Promise.resolve({ id: 'review-1' }) };

describe('founder review retained audio route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.requireAuth.mockResolvedValue({ userId: 'user-1', error: null });
    hoisted.getMedia.mockResolvedValue({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('private audio'));
          controller.close();
        },
      }),
      blob: { contentType: 'audio/webm', etag: 'etag-1' },
    });
    hoisted.deleteMedia.mockResolvedValue({
      id: 'review-1',
      recording: { mediaAvailable: false },
    });
  });

  it('streams retained audio only through the authenticated private route', async () => {
    const response = await GET(
      new Request('https://jov.ie/api/inbox/founder-reviews/review-1/media'),
      params
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('Content-Type')).toBe('audio/webm');
    expect(await response.text()).toBe('private audio');
    expect(hoisted.getMedia).toHaveBeenCalledWith({
      id: 'review-1',
      userIdentity: 'user-1',
      range: null,
    });
  });

  it('returns the durable receipt after explicit audio deletion', async () => {
    const response = await DELETE(
      new Request('https://jov.ie/api/inbox/founder-reviews/review-1/media', {
        method: 'DELETE',
      }),
      params
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      receipt: {
        id: 'review-1',
        recording: { mediaAvailable: false },
      },
    });
    expect(hoisted.deleteMedia).toHaveBeenCalledWith({
      id: 'review-1',
      userIdentity: 'user-1',
    });
  });
});
