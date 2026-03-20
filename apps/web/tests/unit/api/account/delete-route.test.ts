import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---- hoisted mocks ----
const mockAuth = vi.hoisted(() => vi.fn());
const mockClerkClient = vi.hoisted(() => vi.fn());
const mockSetupDbSession = vi.hoisted(() => vi.fn());
const mockCaptureError = vi.hoisted(() => vi.fn());
const mockCheckAccountDeleteRateLimit = vi.hoisted(() => vi.fn());
const mockInvalidateHandleCache = vi.hoisted(() => vi.fn());

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
  clerkClient: mockClerkClient,
}));

vi.mock('@/lib/auth/session', () => ({
  setupDbSession: mockSetupDbSession,
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

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockImplementation(() => {
      const result =
        selectResults.queue.length > 0 ? selectResults.queue.shift() : [];
      return makeChain(result);
    }),
    update: mockDbUpdate.mockImplementation(() => makeChain()),
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
  feedbackItems: { userId: 'feedbackItems.userId' },
}));

vi.mock('@/lib/db/schema/suppression', () => ({
  emailSuppressions: { createdBy: 'emailSuppressions.createdBy' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a, b) => ({ field: a, value: b })),
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

    mockAuth.mockResolvedValue({ userId: 'clerk_user_1' });
    mockCheckAccountDeleteRateLimit.mockResolvedValue({ success: true });
    mockSetupDbSession.mockResolvedValue(undefined);
    mockClerkClient.mockResolvedValue({
      users: { deleteUser: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null });

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
  });

  it('returns 409 when already deleted', async () => {
    selectResults.queue.push([{ id: 'user_1', deletedAt: new Date() }]);

    const { POST } = await import('@/app/api/account/delete/route');
    const response = await POST(makeRequest({ confirmation: 'DELETE' }));

    expect(response.status).toBe(409);
  });

  it('successfully deletes user and all associated data', async () => {
    // First select: find user by clerkId
    selectResults.queue.push([{ id: 'user_1', deletedAt: null }]);
    // Second select: find creator profiles for handle cache invalidation
    selectResults.queue.push([{ usernameNormalized: 'testartist' }]);

    const { POST } = await import('@/app/api/account/delete/route');
    const response = await POST(makeRequest({ confirmation: 'DELETE' }));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);

    // Verify user was anonymized (update called)
    expect(mockDbUpdate).toHaveBeenCalled();

    // Verify deletes were called (creatorProfiles + preSaveTokens + feedbackItems + emailSuppressions = 4)
    expect(mockDbDelete).toHaveBeenCalledTimes(4);

    // Verify handle cache was invalidated
    expect(mockInvalidateHandleCache).toHaveBeenCalledWith('testartist');
  });

  it('handles Clerk deletion failure gracefully', async () => {
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
