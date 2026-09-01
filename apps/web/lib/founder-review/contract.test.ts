import { describe, expect, it } from 'vitest';
import {
  buildFounderReviewReceipt,
  buildStoredFounderReviewContext,
  CreateFounderReviewSchema,
  founderReviewBlobPrefix,
  founderReviewMediaPath,
} from './contract';

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
  transcript: 'The current image reads too quietly on mobile.',
  typedText: 'Keep the face larger.',
  transcription: {
    provider: 'mixed' as const,
    status: 'complete' as const,
    errorCode: null,
  },
  recording: {
    startedAt: '2026-09-01T18:00:00.000Z',
    endedAt: '2026-09-01T18:00:08.000Z',
    initiatedBy: 'keyboard' as const,
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

describe('founder review contract', () => {
  it('keeps the rationale useful without granting external authority', () => {
    const review = CreateFounderReviewSchema.parse(REVIEW);
    const context = buildStoredFounderReviewContext({
      review,
      pathname: '/app',
      userAgent: 'Ovie Desktop',
      capturedAt: '2026-09-01T18:00:08.000Z',
    });

    expect(context.rationaleExtractionStatus).toBe('pending');
    expect(context.provenance).toEqual({
      surface: 'opportunity-inbox',
      sourceBinding:
        'inbox-card:33333333-3333-4333-8333-333333333333:youtube.thumbnail_candidate',
      founderMaterial: false,
    });
    expect(context.authority).toEqual({
      externalActionAuthorized: false,
      exactContent: null,
      destination: null,
      requiresExplicitApproval: true,
    });
  });

  it('rejects transcript-only receipts that smuggle retained media metadata', () => {
    const parsed = CreateFounderReviewSchema.safeParse({
      ...REVIEW,
      recording: {
        ...REVIEW.recording,
        media: {
          blobUrl: 'https://blob.example/review.webm',
          pathname: 'founder-inbox-reviews/user/session/segment/review.webm',
          contentType: 'audio/webm',
          sha256: 'a'.repeat(64),
          byteSize: 1_024,
          durationMs: 8_000,
        },
      },
    });

    expect(parsed.success).toBe(false);
  });

  it('builds a restart-safe receipt and owner-scoped media path', () => {
    const context = buildStoredFounderReviewContext({
      review: CreateFounderReviewSchema.parse(REVIEW),
      pathname: '/app',
      userAgent: null,
      capturedAt: '2026-09-01T18:00:08.000Z',
    });
    const receipt = buildFounderReviewReceipt({
      id: '44444444-4444-4444-8444-444444444444',
      createdAt: new Date('2026-09-01T18:00:08.000Z'),
      context,
    });

    expect(receipt.recording).toMatchObject({
      status: 'captured-discarded',
      retention: 'transcript-only',
      durationMs: 8_000,
      mediaAvailable: false,
      mediaPath: null,
    });
    expect(founderReviewMediaPath(receipt.id)).toBe(
      `/api/inbox/founder-reviews/${receipt.id}/media`
    );
    expect(
      founderReviewBlobPrefix({
        userId: 'user-1',
        sessionId: REVIEW.sessionId,
        segmentId: REVIEW.segmentId,
        target: REVIEW.target,
      })
    ).toBe(
      `founder-inbox-reviews/user-1/${REVIEW.sessionId}/${REVIEW.segmentId}/inbox-card/${REVIEW.target.id}/youtube.thumbnail_candidate/`
    );
  });
});
