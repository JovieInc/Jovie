import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildStoredFounderReviewContext,
  type StoredFounderReviewContext,
} from './contract';

const hoisted = vi.hoisted(() => ({
  context: null as StoredFounderReviewContext | null,
  getUserByIdentity: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
  update: vi.fn(),
  updateKind: null as 'media' | 'outcome' | null,
  actionStatus: 'approved',
}));

vi.mock('@/lib/db/queries/shared', () => ({
  getUserByIdentity: hoisted.getUserByIdentity,
}));

vi.mock('@vercel/blob', () => ({
  head: vi.fn(),
  get: hoisted.get,
  del: hoisted.del,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn((projection: Record<string, unknown>) => {
      const result =
        'status' in projection
          ? [
              {
                id: '33333333-3333-4333-8333-333333333333',
                status: hoisted.actionStatus,
              },
            ]
          : [
              {
                id: '44444444-4444-4444-8444-444444444444',
                context: hoisted.context,
                createdAt: new Date('2026-09-01T18:00:08.000Z'),
              },
            ];
      const terminal = {
        limit: vi.fn(async () => result),
        orderBy: vi.fn(),
        then: (resolve: (value: typeof result) => void) =>
          Promise.resolve(result).then(resolve),
      };
      terminal.orderBy.mockReturnValue(terminal);
      return {
        from: vi.fn(() => ({ where: vi.fn(() => terminal) })),
      };
    }),
    update: vi.fn(() => ({
      set: vi.fn((_value: { context: StoredFounderReviewContext }) => ({
        where: vi.fn(() => {
          const current = hoisted.context;
          if (current && hoisted.updateKind === 'media') {
            hoisted.context = {
              ...current,
              recording: {
                ...current.recording,
                deletedAt: new Date().toISOString(),
              },
            };
          } else if (current && hoisted.updateKind === 'outcome') {
            hoisted.context = {
              ...current,
              actionOutcome: {
                status: 'applied',
                updatedAt: new Date().toISOString(),
                errorCode: null,
              },
            };
          }
          hoisted.update(hoisted.context);
          return {
            returning: vi.fn(async () => [
              { id: '44444444-4444-4444-8444-444444444444' },
            ]),
          };
        }),
      })),
    })),
  },
}));

const {
  deleteFounderReviewMedia,
  FounderReviewError,
  getFounderReviewMedia,
  listFounderReviews,
  updateFounderReviewActionOutcome,
} = await import('./server');

const REVIEW_ID = '44444444-4444-4444-8444-444444444444';
const MEDIA_URL =
  'https://store.private.blob.vercel-storage.com/founder-review.webm';
const MEDIA_PATH =
  'founder-inbox-reviews/app-user/session/segment/inbox-card/card/youtube.thumbnail_candidate/founder-review.webm';

function retainedContext(): StoredFounderReviewContext {
  const review = {
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
    transcript: 'Make the face legible at phone size.',
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
      status: 'captured-retained' as const,
      retention: 'audio-and-transcript' as const,
      durationMs: 8_000,
      media: {
        blobUrl: MEDIA_URL,
        pathname: MEDIA_PATH,
        contentType: 'audio/webm' as const,
        sha256: 'a'.repeat(64),
        byteSize: 1_024,
        durationMs: 8_000,
      },
    },
    consent: {
      disclosureVersion: 1 as const,
      contentUse: 'not-allowed' as const,
      capturedAt: '2026-09-01T18:00:08.000Z',
    },
  };
  return buildStoredFounderReviewContext({
    review,
    pathname: '/app',
    userAgent: 'Ovie Desktop',
    capturedAt: '2026-09-01T18:00:08.000Z',
  });
}

describe('founder review private media', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.context = retainedContext();
    hoisted.updateKind = null;
    hoisted.actionStatus = 'approved';
    hoisted.getUserByIdentity.mockResolvedValue({
      id: 'app-user',
      deletedAt: null,
    });
  });

  it('streams retained audio only through the authenticated private route', async () => {
    const stream = new ReadableStream();
    hoisted.get.mockResolvedValue({ statusCode: 200, stream });

    const result = await getFounderReviewMedia({
      id: REVIEW_ID,
      userIdentity: 'auth-user',
      range: null,
    });

    expect(result.stream).toBe(stream);
    expect(hoisted.get).toHaveBeenCalledWith(MEDIA_PATH, {
      access: 'private',
      useCache: false,
    });
  });

  it('fails closed without changing the receipt when blob deletion fails', async () => {
    hoisted.del.mockRejectedValue(new Error('blob unavailable'));

    await expect(
      deleteFounderReviewMedia({
        id: REVIEW_ID,
        userIdentity: 'auth-user',
      })
    ).rejects.toEqual(
      expect.objectContaining<Partial<InstanceType<typeof FounderReviewError>>>(
        {
          code: 'founder-review-media-deletion-failed',
          status: 502,
        }
      )
    );
    expect(hoisted.update).not.toHaveBeenCalled();
    expect(hoisted.context?.recording.deletedAt).toBeNull();
  });

  it('deletes the private blob before marking audio unavailable', async () => {
    hoisted.updateKind = 'media';
    hoisted.del.mockResolvedValue(undefined);

    const receipt = await deleteFounderReviewMedia({
      id: REVIEW_ID,
      userIdentity: 'auth-user',
    });

    expect(hoisted.del).toHaveBeenCalledWith(MEDIA_URL);
    expect(hoisted.update).toHaveBeenCalledOnce();
    expect(receipt.recording.mediaAvailable).toBe(false);
    expect(receipt.recording.mediaPath).toBeNull();
    expect(receipt.recording.deletedAt).not.toBeNull();
  });

  it('persists the canonical action outcome on the same durable receipt', async () => {
    hoisted.updateKind = 'outcome';
    const receipt = await updateFounderReviewActionOutcome({
      id: REVIEW_ID,
      userIdentity: 'auth-user',
      status: 'applied',
      errorCode: null,
    });

    expect(receipt.actionOutcome.status).toBe('applied');
    expect(hoisted.update).toHaveBeenCalledWith(
      expect.objectContaining({
        actionOutcome: expect.objectContaining({
          status: 'applied',
          errorCode: null,
        }),
      })
    );
  });

  it('refuses to claim an applied outcome before the canonical action changes', async () => {
    hoisted.actionStatus = 'pending';

    await expect(
      updateFounderReviewActionOutcome({
        id: REVIEW_ID,
        userIdentity: 'auth-user',
        status: 'applied',
        errorCode: null,
      })
    ).rejects.toMatchObject({
      code: 'canonical-action-not-applied',
      status: 409,
    });
    expect(hoisted.update).not.toHaveBeenCalled();
  });

  it('reconciles a removed card receipt from canonical state on reload', async () => {
    hoisted.updateKind = 'outcome';

    const receipts = await listFounderReviews({
      userIdentity: 'auth-user',
    });

    expect(receipts[0]?.actionOutcome.status).toBe('applied');
    expect(hoisted.update).toHaveBeenCalledOnce();
  });
});
