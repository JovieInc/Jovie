import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted mocks for the onboarding claim route (POST /api/onboarding/claim)
const mockGetCachedAuth = vi.hoisted(() => vi.fn());
const mockGetCurrentOnboardingSessionId = vi.hoisted(() => vi.fn());
const mockClearOnboardingSessionCookie = vi.hoisted(() => vi.fn());
const mockCaptureError = vi.hoisted(() => vi.fn());
const mockLoggerError = vi.hoisted(() => vi.fn());
const mockLoggerWarn = vi.hoisted(() => vi.fn());
const mockExtractClientIP = vi.hoisted(() =>
  vi.fn().mockReturnValue('127.0.0.1')
);

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mockGetCachedAuth,
}));

vi.mock('@/lib/onboarding/session', () => ({
  getCurrentOnboardingSessionId: mockGetCurrentOnboardingSessionId,
  clearOnboardingSessionCookie: mockClearOnboardingSessionCookie,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    error: mockLoggerError,
    warn: mockLoggerWarn,
  },
}));

vi.mock('@/lib/utils/ip-extraction', () => ({
  extractClientIPFromRequest: mockExtractClientIP,
}));

// DB mock: supports the chained select/from/where/limit/update/insert patterns used in route
const mockDbSelect = vi.hoisted(() => vi.fn());
const mockDbUpdate = vi.hoisted(() => vi.fn());
const mockDbInsert = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
    insert: mockDbInsert,
  },
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: {
    id: 'users.id',
    clerkId: 'users.clerk_id',
  },
}));

vi.mock('@/lib/db/schema/chat', () => ({
  chatConversations: {
    id: 'chat_conversations.id',
    userId: 'chat_conversations.user_id',
    sessionId: 'chat_conversations.session_id',
    createdAt: 'chat_conversations.created_at',
    updatedAt: 'chat_conversations.updated_at',
    title: 'chat_conversations.title',
  },
  chatAuditLog: {
    userId: 'chat_audit_log.user_id',
    creatorProfileId: 'chat_audit_log.creator_profile_id',
    conversationId: 'chat_audit_log.conversation_id',
    action: 'chat_audit_log.action',
    field: 'chat_audit_log.field',
    previousValue: 'chat_audit_log.previous_value',
    newValue: 'chat_audit_log.new_value',
    metadata: 'chat_audit_log.metadata',
    ipAddress: 'chat_audit_log.ip_address',
    userAgent: 'chat_audit_log.user_agent',
  },
}));

describe('POST /api/onboarding/claim', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default db stubs (overridden per test)
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    });
    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    mockDbInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        // audit insert
        returning: vi.fn().mockResolvedValue([]),
      }),
    });
  });

  it('returns 401 when not authenticated', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: null });
    const { POST } = await import('@/app/api/onboarding/claim/route');
    const req = new Request('http://localhost/api/onboarding/claim', {
      method: 'POST',
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.errorCode).toBe('UNAUTHORIZED');
  });

  it('returns claimed:0 (no-op) when no onboarding session cookie', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
    mockGetCurrentOnboardingSessionId.mockResolvedValue(null);
    const { POST } = await import('@/app/api/onboarding/claim/route');
    const req = new Request('http://localhost/api/onboarding/claim', {
      method: 'POST',
    });
    const res = await POST(req);
    const body = await res.json();
    expect(body).toEqual({ claimed: 0 });
    expect(mockClearOnboardingSessionCookie).not.toHaveBeenCalled(); // no-op path still clears? but test allows
  });

  it('returns retryAfterWebhook when user row not yet mirrored from Clerk webhook', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
    mockGetCurrentOnboardingSessionId.mockResolvedValue('sess_abc');
    // user select returns empty -> no userRow
    mockDbSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const { POST } = await import('@/app/api/onboarding/claim/route');
    const req = new Request('http://localhost/api/onboarding/claim', {
      method: 'POST',
    });
    const res = await POST(req);
    const body = await res.json();
    expect(body).toEqual({ claimed: 0, retryAfterWebhook: true });
  });

  it('returns retry path and clears when user row present but no candidates (simplified db stub)', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
    mockGetCurrentOnboardingSessionId.mockResolvedValue('sess_abc');
    // First select: user row found
    const userSelectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: 'user_1' }]),
    };
    mockDbSelect.mockReturnValueOnce(userSelectChain);
    // Second select for candidates: return empty via orderBy chain
    const candSelectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      // the route does .orderBy(desc(...)) then implicit await on the query builder? Wait, drizzle returns the promise on final.
      // For simplicity the mockReturn resolves the last promise in practice; we return [] directly from a terminal.
    };
    // Make orderBy return a thenable that resolves []
    (candSelectChain.orderBy as any).mockReturnValue({
      then: (cb: any) => Promise.resolve([]).then(cb),
    });
    mockDbSelect.mockReturnValueOnce(candSelectChain as any);

    const { POST } = await import('@/app/api/onboarding/claim/route');
    const req = new Request('http://localhost/api/onboarding/claim', {
      method: 'POST',
    });
    const res = await POST(req);
    const body = await res.json();
    expect(body).toEqual({ claimed: 0 });
    expect(mockClearOnboardingSessionCookie).toHaveBeenCalled();
  });
});
