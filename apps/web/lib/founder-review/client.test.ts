import { File as NodeFile } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({ upload: vi.fn() }));

vi.mock('@vercel/blob/client', () => ({ upload: hoisted.upload }));

const {
  createFounderReviewClient,
  updateFounderReviewActionOutcome,
  uploadFounderReviewAudio,
} = await import('./client');

const target = {
  type: 'inbox-card' as const,
  id: '33333333-3333-4333-8333-333333333333',
  title: 'Review thumbnail',
  sourceKind: 'youtube.thumbnail_candidate',
  category: 'suggestion',
};

describe('founder review browser client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the exact decision receipt and persists its action outcome', async () => {
    const receipt = {
      id: '44444444-4444-4444-8444-444444444444',
      target,
      decision: 'approved',
      actionOutcome: { status: 'pending' },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, receipt }), { status: 201 })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            receipt: {
              ...receipt,
              actionOutcome: { status: 'applied' },
            },
          })
        )
      );
    vi.stubGlobal('fetch', fetchMock);
    const review = {
      sessionId: '11111111-1111-4111-8111-111111111111',
      segmentId: '22222222-2222-4222-8222-222222222222',
      target,
      decision: 'approved' as const,
      transcript: 'Increase subject scale.',
      typedText: '',
      transcription: {
        provider: 'web-speech' as const,
        status: 'complete' as const,
        errorCode: null,
      },
      recording: {
        startedAt: null,
        endedAt: '2026-09-01T18:00:08.000Z',
        initiatedBy: 'typed' as const,
        status: 'not-captured' as const,
        retention: 'transcript-only' as const,
        durationMs: null,
        media: null,
      },
      consent: {
        disclosureVersion: 1 as const,
        contentUse: 'not-allowed' as const,
        capturedAt: '2026-09-01T18:00:08.000Z',
      },
    };

    expect(await createFounderReviewClient(review)).toEqual(receipt);
    expect(
      await updateFounderReviewActionOutcome({
        receiptId: receipt.id,
        status: 'applied',
        errorCode: null,
      })
    ).toMatchObject({ actionOutcome: { status: 'applied' } });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `/api/inbox/founder-reviews/${receipt.id}/outcome`
    );
  });

  it('uploads private audio only under the owner-scoped lease prefix', async () => {
    vi.stubGlobal('File', NodeFile);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: true,
            uploadPathPrefix: 'founder-inbox-reviews/app-user/',
          })
        )
      )
    );
    hoisted.upload.mockResolvedValue({
      url: 'https://store.private.blob.vercel-storage.com/review.webm',
      pathname:
        'founder-inbox-reviews/app-user/11111111-1111-4111-8111-111111111111/review.webm',
    });

    const media = await uploadFounderReviewAudio({
      sessionId: '11111111-1111-4111-8111-111111111111',
      segmentId: '22222222-2222-4222-8222-222222222222',
      blob: new Blob(['private audio'], { type: 'audio/webm' }),
      contentType: 'audio/webm',
      durationMs: 8_000,
      target,
    });

    expect(hoisted.upload).toHaveBeenCalledWith(
      expect.stringContaining(
        '/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/'
      ),
      expect.any(File),
      expect.objectContaining({ access: 'private' })
    );
    expect(media.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
