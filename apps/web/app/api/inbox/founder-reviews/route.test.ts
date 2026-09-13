import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  requireAuth: vi.fn(),
  createReview: vi.fn(),
  listReviews: vi.fn(),
  resolveUserId: vi.fn(),
}));

vi.mock('@/lib/auth/require-auth', () => ({
  requireAuth: hoisted.requireAuth,
}));

vi.mock('@/lib/hud/require-admin-hud-api', () => ({
  requireAdminHudApiAccess: hoisted.requireAdmin,
}));

vi.mock('@/lib/founder-review/server', () => ({
  createFounderReview: hoisted.createReview,
  listFounderReviews: hoisted.listReviews,
  resolveFounderReviewUserId: hoisted.resolveUserId,
  FounderReviewError: class FounderReviewError extends Error {},
}));

vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));

const { GET, POST } = await import('./route');

const VALID_REVIEW = {
  sessionId: '11111111-1111-4111-8111-111111111111',
  segmentId: '22222222-2222-4222-8222-222222222222',
  target: {
    type: 'founder-note',
    id: 'founder-brain-dump',
    title: 'Inbox Brain Dump',
    sourceKind: 'founder.brain_dump',
    category: 'note',
  },
  decision: 'note',
  transcript: '',
  typedText: 'Prioritize the next release narrative.',
  transcription: {
    provider: 'typed',
    status: 'typed-only',
    errorCode: null,
  },
  recording: {
    startedAt: null,
    endedAt: '2026-09-01T18:00:08.000Z',
    initiatedBy: 'typed',
    status: 'not-captured',
    retention: 'transcript-only',
    durationMs: null,
    media: null,
  },
  consent: {
    disclosureVersion: 1,
    contentUse: 'not-allowed',
    capturedAt: '2026-09-01T18:00:08.000Z',
  },
};

describe('/api/inbox/founder-reviews', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.requireAdmin.mockResolvedValue(null);
    hoisted.requireAuth.mockResolvedValue({ userId: 'auth-user', error: null });
    hoisted.resolveUserId.mockResolvedValue('app-user');
    hoisted.listReviews.mockResolvedValue([{ id: 'receipt-1' }]);
    hoisted.createReview.mockResolvedValue({ id: 'receipt-2' });
  });

  it('restores authenticated receipts with an owner-scoped upload prefix', async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      receipts: [{ id: 'receipt-1' }],
      uploadPathPrefix: 'founder-inbox-reviews/app-user/',
    });
    expect(hoisted.listReviews).toHaveBeenCalledWith({
      userIdentity: 'app-user',
    });
  });

  it('denies customer-role access before reading founder receipts', async () => {
    hoisted.requireAdmin.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
    );

    const response = await GET();

    expect(response.status).toBe(403);
    expect(hoisted.requireAuth).not.toHaveBeenCalled();
    expect(hoisted.listReviews).not.toHaveBeenCalled();
  });

  it('denies customer-role receipt creation before parsing or persisting', async () => {
    hoisted.requireAdmin.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
    );

    const response = await POST(
      new Request('https://jov.ie/api/inbox/founder-reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(VALID_REVIEW),
      })
    );

    expect(response.status).toBe(403);
    expect(hoisted.requireAuth).not.toHaveBeenCalled();
    expect(hoisted.createReview).not.toHaveBeenCalled();
  });

  it('persists a validated receipt before returning success', async () => {
    const request = new Request('https://jov.ie/api/inbox/founder-reviews', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-jovie-pathname': '/app',
        'user-agent': 'Ovie Desktop',
      },
      body: JSON.stringify(VALID_REVIEW),
    });
    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      ok: true,
      receipt: { id: 'receipt-2' },
    });
    expect(hoisted.createReview).toHaveBeenCalledWith(
      expect.objectContaining({
        userIdentity: 'auth-user',
        pathname: '/app',
        userAgent: 'Ovie Desktop',
      })
    );
  });

  it('rejects an invalid consent and retention contract', async () => {
    const request = new Request('https://jov.ie/api/inbox/founder-reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID_REVIEW, consent: undefined }),
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid-founder-review' });
    expect(hoisted.createReview).not.toHaveBeenCalled();
  });
});
