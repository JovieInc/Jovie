import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---- hoisted mocks ----
const mockGetCachedAuth = vi.hoisted(() => vi.fn());
const mockClerkClient = vi.hoisted(() => vi.fn());
const mockWithDbSession = vi.hoisted(() => vi.fn());
const mockWithDbSessionTx = vi.hoisted(() => vi.fn());
const mockCaptureError = vi.hoisted(() => vi.fn());
const mockCheckAccountDeleteRateLimit = vi.hoisted(() => vi.fn());
const mockInvalidateHandleCache = vi.hoisted(() => vi.fn());
const mockInvalidateProfileCache = vi.hoisted(() => vi.fn());
const mockDeleteBlobs = vi.hoisted(() => vi.fn());

vi.mock('@vercel/blob', () => ({ del: mockDeleteBlobs }));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mockGetCachedAuth,
}));

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: mockClerkClient,
}));

vi.mock('@/lib/auth/session', () => ({
  withDbSession: mockWithDbSession,
  withDbSessionTx: mockWithDbSessionTx,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

vi.mock('@/lib/rate-limit', () => ({
  checkAccountDeleteRateLimit: mockCheckAccountDeleteRateLimit,
  createRateLimitHeaders: vi.fn(() => ({})),
}));

vi.mock('@/lib/onboarding/handle-availability-cache', () => ({
  invalidateHandleCache: mockInvalidateHandleCache,
}));

vi.mock('@/lib/cache/profile', () => ({
  invalidateProfileCache: mockInvalidateProfileCache,
}));

vi.mock('@/lib/http/headers', () => ({
  NO_STORE_HEADERS: {},
}));

vi.mock('@/lib/http/parse-json', () => ({
  parseJsonBody: vi.fn(async (request: Request) => {
    const body = await request.json();
    return { ok: true, data: body };
  }),
}));

// ---- Drizzle chain mock ----
// Each db method returns a chainable proxy that resolves to a configured value.
const selectResults = vi.hoisted(() => ({ queue: [] as unknown[] }));

function makeChain(resolveValue: unknown = undefined) {
  const chain: Record<string, unknown> = {};
  const proxy = new Proxy(chain, {
    get(_, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => void) =>
          Promise.resolve(resolveValue).then(resolve);
      }
      return vi.fn().mockReturnValue(proxy);
    },
  });
  return proxy;
}

const mockDbUpdate = vi.hoisted(() => vi.fn());
const mockDbDelete = vi.hoisted(() => vi.fn());

function makeTx() {
  return {
    select: vi.fn().mockImplementation(() => {
      const result =
        selectResults.queue.length > 0 ? selectResults.queue.shift() : [];
      return makeChain(result);
    }),
    update: mockDbUpdate.mockImplementation(() => makeChain()),
    delete: mockDbDelete.mockImplementation(() => makeChain()),
  };
}

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockImplementation(() => {
      const result =
        selectResults.queue.length > 0 ? selectResults.queue.shift() : [];
      return makeChain(result);
    }),
    delete: mockDbDelete.mockImplementation(() => makeChain()),
  },
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: { id: 'users.id', clerkId: 'users.clerkId' },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    userId: 'creatorProfiles.userId',
    usernameNormalized: 'creatorProfiles.usernameNormalized',
  },
}));

vi.mock('@/lib/db/schema/pre-save', () => ({
  preSaveTokens: { userId: 'preSaveTokens.userId' },
}));

vi.mock('@/lib/db/schema/feedback', () => ({
  feedbackItems: {
    userId: 'feedbackItems.userId',
    source: 'feedbackItems.source',
    context: 'feedbackItems.context',
  },
}));

vi.mock('@/lib/db/schema/suppression', () => ({
  emailSuppressions: { createdBy: 'emailSuppressions.createdBy' },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...values) => values),
  eq: vi.fn((a, b) => ({ field: a, value: b })),
  inArray: vi.fn((field, values) => ({ field, values })),
}));

// ---- helpers ----
function makeRequest(body: unknown) {
  return new Request('http://localhost/api/account/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/account/delete', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    selectResults.queue = [];

    mockGetCachedAuth.mockResolvedValue({ userId: 'clerk_user_1' });
    mockCheckAccountDeleteRateLimit.mockResolvedValue({ success: true });
    mockDeleteBlobs.mockResolvedValue(undefined);
    mockWithDbSession.mockImplementation(async (operation, options) =>
      operation(options?.clerkUserId ?? 'clerk_user_1')
    );
    mockWithDbSessionTx.mockImplementation(async (operation, options) =>
      operation(makeTx(), options?.clerkUserId ?? 'clerk_user_1')
    );
    mockClerkClient.mockResolvedValue({
      users: { deleteUser: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: null });

    const { POST } = await import('@/app/api/account/delete/route');
    const response = await POST(makeRequest({ confirmation: 'DELETE' }));

    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 429 when rate-limited', async () => {
    mockCheckAccountDeleteRateLimit.mockResolvedValue({
      success: false,
      reason: 'Too many requests',
    });

    const { POST } = await import('@/app/api/account/delete/route');
    const response = await POST(makeRequest({ confirmation: 'DELETE' }));

    expect(response.status).toBe(429);
  });

  it('returns 400 when confirmation text is wrong', async () => {
    const { POST } = await import('@/app/api/account/delete/route');
    const response = await POST(makeRequest({ confirmation: 'WRONG' }));

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toContain('DELETE');
  });

  it('returns 404 when user not found', async () => {
    selectResults.queue.push([]);

    const { POST } = await import('@/app/api/account/delete/route');
    const response = await POST(makeRequest({ confirmation: 'DELETE' }));

    expect(response.status).toBe(404);
    expect(mockWithDbSession).toHaveBeenCalledTimes(1);
    expect(mockWithDbSessionTx).not.toHaveBeenCalled();
  });

  it('scopes RLS to existence check then delete transaction (JOV-3048)', async () => {
    selectResults.queue.push([{ id: 'user_1', deletedAt: null }]);
    selectResults.queue.push([]);
    selectResults.queue.push([{ usernameNormalized: 'testartist' }]);

    const { POST } = await import('@/app/api/account/delete/route');
    await POST(makeRequest({ confirmation: 'DELETE' }));

    expect(mockWithDbSession).toHaveBeenCalledTimes(1);
    expect(mockWithDbSessionTx).toHaveBeenCalledTimes(2);
    expect(mockWithDbSession.mock.invocationCallOrder[0]).toBeLessThan(
      mockWithDbSessionTx.mock.invocationCallOrder[0]
    );
    expect(mockWithDbSession).toHaveBeenCalledWith(expect.any(Function), {
      clerkUserId: 'clerk_user_1',
    });
    expect(mockWithDbSessionTx).toHaveBeenCalledWith(expect.any(Function), {
      clerkUserId: 'clerk_user_1',
    });
  });

  it('retries idempotently when account was partially deleted', async () => {
    selectResults.queue.push([{ id: 'user_1', deletedAt: new Date() }]);
    selectResults.queue.push([]);
    selectResults.queue.push([{ usernameNormalized: 'testartist' }]);

    const { POST } = await import('@/app/api/account/delete/route');
    const response = await POST(makeRequest({ confirmation: 'DELETE' }));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(mockDbDelete).toHaveBeenCalledTimes(4);
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it('successfully deletes user and all associated data', async () => {
    // First select: find user by clerkId
    selectResults.queue.push([{ id: 'user_1', deletedAt: null }]);
    // Second select: retained founder-review media lookup.
    selectResults.queue.push([]);
    // Third select: find creator profiles for handle cache invalidation
    selectResults.queue.push([{ usernameNormalized: 'testartist' }]);

    const { POST } = await import('@/app/api/account/delete/route');
    const response = await POST(makeRequest({ confirmation: 'DELETE' }));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);

    // Verify the erasure fence is committed before dependent-row cleanup.
    expect(mockDbDelete).toHaveBeenCalledTimes(4);
    expect(mockDbUpdate).toHaveBeenCalled();
    expect(mockDbUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      mockDbDelete.mock.invocationCallOrder[0]
    );

    // Verify handle cache was invalidated
    expect(mockInvalidateHandleCache).toHaveBeenCalledWith('testartist');

    // Verify profile ISR cache was invalidated
    expect(mockInvalidateProfileCache).toHaveBeenCalledWith('testartist');
  });

  it('deletes retained founder audio before removing its database lookup', async () => {
    const { buildStoredFounderReviewContext, CreateFounderReviewSchema } =
      await import('@/lib/founder-review/contract');
    const blobUrl =
      'https://store.private.blob.vercel-storage.com/founder-review.webm';
    const review = CreateFounderReviewSchema.parse({
      sessionId: '11111111-1111-4111-8111-111111111111',
      segmentId: '22222222-2222-4222-8222-222222222222',
      target: {
        type: 'inbox-card',
        id: '33333333-3333-4333-8333-333333333333',
        title: 'Review thumbnail',
        sourceKind: 'youtube.thumbnail_candidate',
        category: 'suggestion',
      },
      decision: 'approved',
      transcript: 'Increase subject scale.',
      typedText: '',
      transcription: {
        provider: 'web-speech',
        status: 'complete',
        errorCode: null,
      },
      recording: {
        startedAt: '2026-09-01T18:00:00.000Z',
        endedAt: '2026-09-01T18:00:08.000Z',
        initiatedBy: 'button',
        status: 'captured-retained',
        retention: 'audio-and-transcript',
        durationMs: 8_000,
        media: {
          blobUrl,
          pathname: 'founder-inbox-reviews/user/session/segment/review.webm',
          contentType: 'audio/webm',
          sha256: 'a'.repeat(64),
          byteSize: 1_024,
          durationMs: 8_000,
        },
      },
      consent: {
        disclosureVersion: 1,
        contentUse: 'not-allowed',
        capturedAt: '2026-09-01T18:00:08.000Z',
      },
    });
    selectResults.queue.push([{ id: 'user_1', deletedAt: null }]);
    selectResults.queue.push([
      {
        context: buildStoredFounderReviewContext({
          review,
          pathname: '/app',
          userAgent: 'Ovie Desktop',
          capturedAt: '2026-09-01T18:00:08.000Z',
        }),
      },
    ]);
    selectResults.queue.push([{ usernameNormalized: 'testartist' }]);

    const { POST } = await import('@/app/api/account/delete/route');
    const response = await POST(makeRequest({ confirmation: 'DELETE' }));

    expect(response.status).toBe(200);
    expect(mockDeleteBlobs).toHaveBeenCalledWith([blobUrl]);
    expect(mockDeleteBlobs.mock.invocationCallOrder[0]).toBeLessThan(
      mockWithDbSessionTx.mock.invocationCallOrder[1]
    );
  });

  it.skip('handles Clerk deletion failure gracefully (retired: no Clerk delete path)', async () => {
    selectResults.queue.push([{ id: 'user_1', deletedAt: null }]);
    selectResults.queue.push([]);

    const clerkError = new Error('Clerk API error');
    mockClerkClient.mockResolvedValue({
      users: { deleteUser: vi.fn().mockRejectedValue(clerkError) },
    });

    const { POST } = await import('@/app/api/account/delete/route');
    const response = await POST(makeRequest({ confirmation: 'DELETE' }));

    // Should still succeed — Clerk failure is non-fatal
    expect(response.status).toBe(200);
    expect(mockCaptureError).toHaveBeenCalledWith(
      'Failed to delete Clerk user during account deletion',
      clerkError,
      expect.objectContaining({ route: '/api/account/delete' })
    );
  });
});
