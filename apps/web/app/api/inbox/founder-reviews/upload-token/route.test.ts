import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  handleUpload: vi.fn(),
  resolveUserId: vi.fn(),
  assertTargetOwnership: vi.fn(),
}));

vi.mock('@/lib/auth/require-auth', () => ({
  requireAuth: hoisted.requireAuth,
}));

vi.mock('@vercel/blob/client', () => ({ handleUpload: hoisted.handleUpload }));

vi.mock('@/lib/founder-review/server', () => ({
  resolveFounderReviewUserId: hoisted.resolveUserId,
  assertFounderReviewTargetOwnership: hoisted.assertTargetOwnership,
  FounderReviewError: class FounderReviewError extends Error {
    constructor(
      public readonly code: string,
      public readonly status: number
    ) {
      super(code);
    }
  },
}));

vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));

const { POST } = await import('./route');

const SESSION = '11111111-1111-4111-8111-111111111111';
const SEGMENT = '22222222-2222-4222-8222-222222222222';
const TARGET_PATH = 'inbox-card/card-1/youtube.thumbnail_candidate/review.webm';

function request() {
  return new NextRequest(
    `https://jov.ie/api/inbox/founder-reviews/upload-token?sessionId=${SESSION}&segmentId=${SEGMENT}&targetType=inbox-card&targetId=card-1&sourceKind=youtube.thumbnail_candidate`,
    {
      method: 'POST',
      body: JSON.stringify({ type: 'blob.generate-client-token' }),
    }
  );
}

describe('founder review private upload token', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.requireAuth.mockResolvedValue({ userId: 'auth-user', error: null });
    hoisted.resolveUserId.mockResolvedValue('app-user');
    hoisted.assertTargetOwnership.mockResolvedValue(undefined);
    hoisted.handleUpload.mockImplementation(async options => {
      const policy = await options.onBeforeGenerateToken(
        `founder-inbox-reviews/app-user/${SESSION}/${SEGMENT}/${TARGET_PATH}`
      );
      return { type: 'blob.generate-client-token', policy };
    });
  });

  it('binds audio-only uploads to the authenticated user and exact segment', async () => {
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.policy.allowedContentTypes).toEqual([
      'audio/webm',
      'audio/mp4',
      'audio/ogg',
    ]);
    expect(JSON.parse(body.policy.tokenPayload)).toEqual({
      userId: 'app-user',
      sessionId: SESSION,
      segmentId: SEGMENT,
      targetType: 'inbox-card',
      targetId: 'card-1',
      sourceKind: 'youtube.thumbnail_candidate',
    });
    expect(hoisted.assertTargetOwnership).toHaveBeenCalledWith({
      userId: 'app-user',
      target: expect.objectContaining({
        type: 'inbox-card',
        id: 'card-1',
        sourceKind: 'youtube.thumbnail_candidate',
      }),
    });
  });

  it('rejects cross-user or cross-segment pathnames', async () => {
    hoisted.handleUpload.mockImplementation(async options => {
      await options.onBeforeGenerateToken(
        `founder-inbox-reviews/other/${SESSION}/${SEGMENT}/${TARGET_PATH}`
      );
    });

    const response = await POST(request());

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: 'invalid-founder-review-media-path',
    });
  });
});
