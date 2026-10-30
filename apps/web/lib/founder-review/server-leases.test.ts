import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildStoredFounderReviewContext } from './contract';

const hoisted = vi.hoisted(() => ({
  selectCall: 0,
  deleteWhere: vi.fn(),
  del: vi.fn(),
  boundBlobName: 'bound.webm',
}));

vi.mock('@vercel/blob', () => ({
  del: hoisted.del,
  get: vi.fn(),
}));

vi.mock('@/lib/db/queries/shared', () => ({ getUserByIdentity: vi.fn() }));

vi.mock('@/lib/db/schema/feedback', () => ({
  feedbackItems: {
    id: 'feedback.id',
    userId: 'feedback.userId',
    source: 'feedback.source',
    context: 'feedback.context',
    createdAt: 'feedback.createdAt',
  },
}));

vi.mock('@/lib/db/schema/connectors', () => ({
  suggestedActions: {
    id: 'actions.id',
    userId: 'actions.userId',
    kind: 'actions.kind',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...values) => values),
  desc: vi.fn(value => value),
  eq: vi.fn((field, value) => ({ field, value })),
  inArray: vi.fn((field, values) => ({ field, values })),
  lt: vi.fn((field, value) => ({ field, value })),
  sql: vi.fn(),
}));

const ORPHAN_LEASE_ID = '11111111-1111-4111-8111-111111111111';
const BOUND_LEASE_ID = '22222222-2222-4222-8222-222222222222';
const ORPHAN_REVIEW_ID = '33333333-3333-4333-8333-333333333333';
const BOUND_REVIEW_ID = '44444444-4444-4444-8444-444444444444';

function lease(reviewId: string, segmentId: string, blobName: string) {
  return {
    schemaVersion: 1,
    kind: 'founder-review-upload-lease',
    reviewId,
    token: {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      sessionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      segmentId,
      targetType: 'inbox-card',
      targetId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      sourceKind: 'youtube.thumbnail_candidate',
    },
    blob: {
      url: `https://store.private.blob.vercel-storage.com/${blobName}`,
      pathname: `founder-inbox-reviews/user/session/${blobName}`,
      contentType: 'audio/webm',
    },
    uploadedAt: '2026-08-30T18:00:00.000Z',
  };
}

function boundReviewContext() {
  const boundLease = lease(
    BOUND_REVIEW_ID,
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    hoisted.boundBlobName
  );
  return buildStoredFounderReviewContext({
    review: {
      sessionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      segmentId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      target: {
        type: 'inbox-card',
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        title: 'Bound review',
        sourceKind: 'youtube.thumbnail_candidate',
        category: 'suggestion',
      },
      decision: 'approved',
      transcript: 'Keep this recording.',
      typedText: '',
      transcription: {
        provider: 'web-speech',
        status: 'complete',
        errorCode: null,
      },
      recording: {
        startedAt: '2026-08-30T17:59:50.000Z',
        endedAt: '2026-08-30T18:00:00.000Z',
        initiatedBy: 'button',
        status: 'captured-retained',
        retention: 'audio-and-transcript',
        durationMs: 10_000,
        media: {
          blobUrl: boundLease.blob.url,
          pathname: boundLease.blob.pathname,
          contentType: 'audio/webm',
          sha256: 'a'.repeat(64),
          byteSize: 1_024,
          durationMs: 10_000,
        },
      },
      consent: {
        disclosureVersion: 1,
        contentUse: 'not-allowed',
        capturedAt: '2026-08-30T18:00:00.000Z',
      },
    },
    pathname: '/app',
    userAgent: null,
    capturedAt: '2026-08-30T18:00:00.000Z',
  });
}

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => {
      hoisted.selectCall += 1;
      const result =
        hoisted.selectCall === 1
          ? [
              {
                id: ORPHAN_LEASE_ID,
                context: lease(
                  ORPHAN_REVIEW_ID,
                  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
                  'orphan.webm'
                ),
              },
              {
                id: BOUND_LEASE_ID,
                context: lease(
                  BOUND_REVIEW_ID,
                  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
                  'bound.webm'
                ),
              },
            ]
          : [{ id: BOUND_REVIEW_ID, context: boundReviewContext() }];
      const terminal = Promise.resolve(result);
      const chain = {
        from: vi.fn(),
        where: vi.fn(),
        limit: vi.fn(async () => result),
        then: terminal.then.bind(terminal),
      };
      chain.from.mockReturnValue(chain);
      chain.where.mockReturnValue(chain);
      return chain;
    }),
    delete: vi.fn(() => ({ where: hoisted.deleteWhere })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn() })),
    })),
  },
}));

const { cleanupFounderReviewUploadLeases } = await import('./server');

describe('founder review upload lease cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.selectCall = 0;
    hoisted.del.mockResolvedValue(undefined);
    hoisted.boundBlobName = 'bound.webm';
    hoisted.deleteWhere.mockResolvedValue(undefined);
  });

  it('deletes expired orphan audio while preserving media bound to a receipt', async () => {
    const result = await cleanupFounderReviewUploadLeases({
      now: new Date('2026-09-01T18:00:00.000Z'),
    });

    expect(hoisted.del).toHaveBeenCalledOnce();
    expect(hoisted.del).toHaveBeenCalledWith(
      'https://store.private.blob.vercel-storage.com/orphan.webm'
    );
    expect(hoisted.deleteWhere).toHaveBeenCalledOnce();
    expect(result).toEqual({
      scanned: 2,
      deletedOrphans: 1,
      reconciled: 1,
      failed: 0,
    });
  });

  it('deletes a superseded blob instead of reconciling by review id alone', async () => {
    hoisted.boundBlobName = 'replacement.webm';

    const result = await cleanupFounderReviewUploadLeases({
      now: new Date('2026-09-01T18:00:00.000Z'),
    });

    expect(hoisted.del).toHaveBeenCalledTimes(2);
    expect(hoisted.del).toHaveBeenCalledWith(
      'https://store.private.blob.vercel-storage.com/bound.webm'
    );
    expect(result).toEqual({
      scanned: 2,
      deletedOrphans: 2,
      reconciled: 0,
      failed: 0,
    });
  });
});
