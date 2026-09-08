import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  selectCount: 0,
  inserted: null as Record<string, unknown> | null,
  getUserByIdentity: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
}));

vi.mock('@/lib/db/queries/shared', () => ({
  getUserByIdentity: hoisted.getUserByIdentity,
}));

vi.mock('@vercel/blob', () => ({
  get: hoisted.get,
  del: hoisted.del,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => {
            hoisted.selectCount += 1;
            if (hoisted.selectCount === 1) {
              return [{ kind: 'youtube.thumbnail_candidate' }];
            }
            return hoisted.inserted
              ? [
                  {
                    id: hoisted.inserted.id,
                    context: hoisted.inserted.context,
                    createdAt: hoisted.inserted.createdAt,
                  },
                ]
              : [];
          }),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((value: Record<string, unknown>) => {
        hoisted.inserted = value;
        return { onConflictDoNothing: vi.fn(async () => undefined) };
      }),
    })),
    delete: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
  },
}));

const {
  createFounderReview,
  FounderReviewError,
  recordFounderReviewUploadLease,
} = await import('./server');

const REVIEW = {
  sessionId: '11111111-1111-4111-8111-111111111111',
  segmentId: '22222222-2222-4222-8222-222222222222',
  target: {
    type: 'inbox-card' as const,
    id: '33333333-3333-4333-8333-333333333333',
    title: 'Refresh a weak YouTube thumbnail',
    sourceKind: 'youtube.thumbnail_candidate',
    category: 'suggestion',
  },
  decision: 'approved' as const,
  transcript: 'The subject needs to read at mobile size.',
  typedText: '',
  transcription: {
    provider: 'web-speech' as const,
    status: 'complete' as const,
    errorCode: null,
  },
  recording: {
    startedAt: '2026-09-01T18:00:00.000Z',
    endedAt: '2026-09-01T18:00:08.000Z',
    initiatedBy: 'button' as const,
    status: 'captured-discarded' as const,
    retention: 'transcript-only' as const,
    durationMs: 8_000,
    media: null,
  },
  consent: {
    disclosureVersion: 1 as const,
    contentUse: 'not-allowed' as const,
    capturedAt: '2026-09-01T18:00:08.000Z',
  },
};

describe('founder review server persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.selectCount = 0;
    hoisted.inserted = null;
    hoisted.del.mockResolvedValue(undefined);
    hoisted.getUserByIdentity.mockResolvedValue({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      deletedAt: null,
    });
  });

  it('binds the card to its owner and stores a non-authorizing durable receipt', async () => {
    const receipt = await createFounderReview({
      userIdentity: 'auth-user',
      review: REVIEW,
      pathname: '/app',
      userAgent: 'Ovie Desktop',
    });

    expect(hoisted.inserted).toMatchObject({
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      source: 'founder-inbox-review',
      status: 'pending',
      context: {
        target: REVIEW.target,
        decision: 'approved',
        authority: {
          externalActionAuthorized: false,
          exactContent: null,
          destination: null,
          requiresExplicitApproval: true,
        },
      },
    });
    expect(receipt.target).toEqual(REVIEW.target);
    expect(receipt.authority.externalActionAuthorized).toBe(false);
  });

  it('refuses a card when the persisted suggested-action kind does not match', async () => {
    const mismatched = {
      ...REVIEW,
      target: { ...REVIEW.target, sourceKind: 'calendar.create_event' },
    };

    await expect(
      createFounderReview({
        userIdentity: 'auth-user',
        review: mismatched,
        pathname: '/app',
        userAgent: null,
      })
    ).rejects.toEqual(
      expect.objectContaining<Partial<InstanceType<typeof FounderReviewError>>>(
        {
          code: 'founder-review-target-not-found',
          status: 404,
        }
      )
    );
    expect(hoisted.inserted).toBeNull();
  });

  it('refuses retained audio bound to a different target card', async () => {
    const retained = {
      ...REVIEW,
      recording: {
        ...REVIEW.recording,
        status: 'captured-retained' as const,
        retention: 'audio-and-transcript' as const,
        media: {
          blobUrl: 'https://store.private.blob.vercel-storage.com/review.webm',
          pathname: `founder-inbox-reviews/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/${REVIEW.sessionId}/${REVIEW.segmentId}/inbox-card/other-card/youtube.thumbnail_candidate/review.webm`,
          contentType: 'audio/webm' as const,
          sha256: 'a'.repeat(64),
          byteSize: 1_024,
          durationMs: 8_000,
        },
      },
    };

    await expect(
      createFounderReview({
        userIdentity: 'auth-user',
        review: retained,
        pathname: '/app',
        userAgent: null,
      })
    ).rejects.toEqual(
      expect.objectContaining({
        code: 'invalid-founder-review-media-path',
        status: 422,
      })
    );
    expect(hoisted.get).not.toHaveBeenCalled();
    expect(hoisted.inserted).toBeNull();
  });

  it('verifies the private audio digest before storing its receipt', async () => {
    const audio = new TextEncoder().encode('private founder audio');
    const blobUrl = 'https://store.private.blob.vercel-storage.com/review.webm';
    const pathname = `founder-inbox-reviews/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/${REVIEW.sessionId}/${REVIEW.segmentId}/inbox-card/${REVIEW.target.id}/youtube.thumbnail_candidate/review.webm`;
    hoisted.get.mockResolvedValue({
      statusCode: 200,
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue(audio);
          controller.close();
        },
      }),
      blob: {
        url: blobUrl,
        pathname,
        size: audio.byteLength,
        contentType: 'audio/webm',
      },
    });

    const receipt = await createFounderReview({
      userIdentity: 'auth-user',
      review: {
        ...REVIEW,
        recording: {
          ...REVIEW.recording,
          status: 'captured-retained',
          retention: 'audio-and-transcript',
          media: {
            blobUrl,
            pathname,
            contentType: 'audio/webm',
            sha256: createHash('sha256').update(audio).digest('hex'),
            byteSize: audio.byteLength,
            durationMs: 8_000,
          },
        },
      },
      pathname: '/app',
      userAgent: null,
    });

    expect(receipt.recording.sha256).toBe(
      createHash('sha256').update(audio).digest('hex')
    );
  });

  it('records an expiring upload lease from the blob completion payload', async () => {
    const pathname = `founder-inbox-reviews/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/${REVIEW.sessionId}/${REVIEW.segmentId}/inbox-card/${REVIEW.target.id}/youtube.thumbnail_candidate/review.webm`;
    await recordFounderReviewUploadLease({
      tokenPayload: JSON.stringify({
        userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        sessionId: REVIEW.sessionId,
        segmentId: REVIEW.segmentId,
        targetType: REVIEW.target.type,
        targetId: REVIEW.target.id,
        sourceKind: REVIEW.target.sourceKind,
      }),
      blob: {
        url: 'https://store.private.blob.vercel-storage.com/review.webm',
        pathname,
        contentType: 'audio/webm',
      },
    });

    expect(hoisted.inserted).toMatchObject({
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      source: 'founder-inbox-review-upload-lease',
      context: {
        kind: 'founder-review-upload-lease',
        token: { segmentId: REVIEW.segmentId },
        blob: { pathname },
      },
    });
  });

  it('deletes a completed upload when account erasure wins the callback race', async () => {
    const pathname = `founder-inbox-reviews/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/${REVIEW.sessionId}/${REVIEW.segmentId}/inbox-card/${REVIEW.target.id}/youtube.thumbnail_candidate/raced.webm`;
    hoisted.getUserByIdentity.mockResolvedValue({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      deletedAt: new Date(),
    });

    await expect(
      recordFounderReviewUploadLease({
        tokenPayload: JSON.stringify({
          userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          sessionId: REVIEW.sessionId,
          segmentId: REVIEW.segmentId,
          targetType: REVIEW.target.type,
          targetId: REVIEW.target.id,
          sourceKind: REVIEW.target.sourceKind,
        }),
        blob: {
          url: 'https://store.private.blob.vercel-storage.com/raced.webm',
          pathname,
          contentType: 'audio/webm',
        },
      })
    ).rejects.toMatchObject({ code: 'founder-review-user-not-found' });
    expect(hoisted.del).toHaveBeenCalledWith(
      'https://store.private.blob.vercel-storage.com/raced.webm'
    );
  });

  it('retains the cleanup lease when post-erasure blob deletion fails', async () => {
    const pathname = `founder-inbox-reviews/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/${REVIEW.sessionId}/${REVIEW.segmentId}/inbox-card/${REVIEW.target.id}/youtube.thumbnail_candidate/late.webm`;
    hoisted.getUserByIdentity.mockResolvedValue({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      deletedAt: new Date(),
    });
    hoisted.del.mockRejectedValue(new Error('blob unavailable'));

    await expect(
      recordFounderReviewUploadLease({
        tokenPayload: JSON.stringify({
          userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          sessionId: REVIEW.sessionId,
          segmentId: REVIEW.segmentId,
          targetType: REVIEW.target.type,
          targetId: REVIEW.target.id,
          sourceKind: REVIEW.target.sourceKind,
        }),
        blob: {
          url: 'https://store.private.blob.vercel-storage.com/late.webm',
          pathname,
          contentType: 'audio/webm',
        },
      })
    ).rejects.toMatchObject({
      code: 'founder-review-media-deletion-failed',
      status: 502,
    });
    expect(hoisted.inserted).toMatchObject({
      source: 'founder-inbox-review-upload-lease',
      context: { blob: { pathname } },
    });
  });
});
