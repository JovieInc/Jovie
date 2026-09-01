import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  selectCount: 0,
  inserted: null as Record<string, unknown> | null,
  getUserByIdentity: vi.fn(),
  head: vi.fn(),
}));

vi.mock('@/lib/db/queries/shared', () => ({
  getUserByIdentity: hoisted.getUserByIdentity,
}));

vi.mock('@vercel/blob', () => ({
  head: hoisted.head,
  get: vi.fn(),
  del: vi.fn(),
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
  },
}));

const { createFounderReview, FounderReviewError } = await import('./server');

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
    expect(hoisted.head).not.toHaveBeenCalled();
    expect(hoisted.inserted).toBeNull();
  });
});
