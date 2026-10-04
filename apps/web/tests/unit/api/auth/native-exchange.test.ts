import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// Native exchange route tests (Clerk → Better Auth migration, commit ⑩)
// ============================================================================
// Rewritten to mock the Better Auth API surface (auth.api.verifyOneTimeToken,
// auth.$context.internalAdapter.createSession) instead of Clerk's
// sessions/signInTokens. Tests the native exchange matrix per plan Phase 9:
// - iOS success: fresh session token returned
// - Electron success: OTT (ticket) returned
// - Missing OTT → 401 ott_missing
// - Invalid client/code/state → 401
// - Rate limited → 429
// ============================================================================

const {
  mockCaptureError,
  mockConsumeStoredNativeExchangeCode,
  mockCreateAuthAnalyticsEvent,
  mockCreateRateLimitHeaders,
  mockGeneralLimiterLimit,
  mockGetClientIP,
  mockVerifyOneTimeToken,
  mockInternalAdapterCreateSession,
  mockAuthContext,
} = vi.hoisted(() => ({
  mockCaptureError: vi.fn(),
  mockConsumeStoredNativeExchangeCode: vi.fn(),
  mockCreateAuthAnalyticsEvent: vi.fn(),
  mockCreateRateLimitHeaders: vi.fn(),
  mockGeneralLimiterLimit: vi.fn(),
  mockGetClientIP: vi.fn(),
  mockVerifyOneTimeToken: vi.fn(),
  mockInternalAdapterCreateSession: vi.fn(),
  mockAuthContext: vi.fn(),
}));

vi.mock('@/lib/auth/better-auth', () => ({
  auth: {
    api: {
      verifyOneTimeToken: mockVerifyOneTimeToken,
    },
    get $context() {
      return mockAuthContext();
    },
  },
}));

vi.mock('@jovie/auth-routing', async importOriginal => ({
  ...(await importOriginal<typeof import('@jovie/auth-routing')>()),
  createAuthAnalyticsEvent: mockCreateAuthAnalyticsEvent,
}));

vi.mock('@/lib/auth/routing-state.server', () => ({
  consumeStoredNativeExchangeCode: mockConsumeStoredNativeExchangeCode,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

vi.mock('@/lib/rate-limit', () => ({
  allowIfRateLimitBackendDegraded: (result: {
    success: boolean;
    unavailable?: boolean;
    degraded?: boolean;
    reason?: string;
  }) =>
    !result.success && (result.unavailable || result.degraded)
      ? { ...result, success: true, reason: undefined }
      : result,
  createRateLimitHeaders: mockCreateRateLimitHeaders,
  generalLimiter: {
    limit: mockGeneralLimiterLimit,
  },
  getClientIP: mockGetClientIP,
}));

vi.mock('@/lib/server-analytics', () => ({
  trackServerEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/env', () => ({
  env: {
    VERCEL_ENV: 'development',
    NODE_ENV: 'development',
    JOVIE_IOS_REAL_BROWSER_AUTH_TOKEN: '',
  },
}));

function createExchangeRequest(
  client: 'ios' | 'electron' = 'ios',
  nativeAttempt?: unknown
) {
  return new NextRequest('https://jov.ie/api/auth/native/exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client,
      code: 'native_code',
      state: 'native_state',
      codeVerifier: 'native_verifier',
      ...(nativeAttempt !== undefined ? { nativeAttempt } : {}),
    }),
  });
}

function setupSuccessfulExchange(
  ott: string = 'ott_123',
  userId: string = 'user_ba_123'
) {
  mockConsumeStoredNativeExchangeCode.mockResolvedValue({
    ok: true,
    userId,
    returnTo: '/app',
    ott,
  });
  mockGeneralLimiterLimit.mockResolvedValue({ success: true });
  return { ott, userId };
}

function setupIosSessionCreation(
  sessionToken: string = 'session_token_abc',
  sessionId: string = 'sess_001'
) {
  mockAuthContext.mockResolvedValue({
    internalAdapter: {
      createSession: mockInternalAdapterCreateSession,
    },
  });
  mockInternalAdapterCreateSession.mockResolvedValue({
    token: sessionToken,
    id: sessionId,
  });
  mockVerifyOneTimeToken.mockResolvedValue({
    user: { id: 'user_ba_123' },
    session: { userId: 'user_ba_123' },
  });
}

describe('native auth exchange route (Better Auth)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGeneralLimiterLimit.mockResolvedValue({ success: true });
  });

  it('returns a fresh session token for iOS clients', async () => {
    setupSuccessfulExchange();
    setupIosSessionCreation();

    const request = createExchangeRequest('ios');
    const { POST } = await import('@/app/api/auth/native/exchange/route');
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.sessionToken).toBe('session_token_abc');
    expect(data.sessionId).toBe('sess_001');
    expect(data.userId).toBe('user_ba_123');
    expect(data.returnTo).toBe('/app');
    expect(mockVerifyOneTimeToken).toHaveBeenCalledWith({
      body: { token: 'ott_123' },
      request,
      asResponse: false,
    });
    expect(mockInternalAdapterCreateSession).toHaveBeenCalledWith(
      'user_ba_123'
    );
  });

  it('returns the OTT as ticket for Electron clients', async () => {
    setupSuccessfulExchange('ott_electron_456', 'user_ba_456');

    const { POST } = await import('@/app/api/auth/native/exchange/route');
    const response = await POST(createExchangeRequest('electron'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ticket).toBe('ott_electron_456');
    expect(data.userId).toBe('user_ba_456');
    expect(data.returnTo).toBe('/app');
    // Electron does NOT call verifyOneTimeToken or createSession
    expect(mockVerifyOneTimeToken).not.toHaveBeenCalled();
    expect(mockInternalAdapterCreateSession).not.toHaveBeenCalled();
  });

  it('returns 401 ott_missing when the exchange record has no OTT', async () => {
    mockConsumeStoredNativeExchangeCode.mockResolvedValue({
      ok: true,
      userId: 'user_ba_123',
      returnTo: '/app',
      ott: null,
    });
    mockGeneralLimiterLimit.mockResolvedValue({ success: true });

    const { POST } = await import('@/app/api/auth/native/exchange/route');
    const response = await POST(createExchangeRequest('ios'));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.reason).toBe('ott_missing');
    expect(data).not.toHaveProperty('exchangePhase');
  });

  it('returns 401 ott_user_mismatch when the OTT resolves to a different user', async () => {
    setupSuccessfulExchange('ott_123', 'user_ba_123');
    setupIosSessionCreation();
    mockVerifyOneTimeToken.mockResolvedValue({
      user: { id: 'user_other_999' },
      session: { userId: 'user_other_999' },
    });

    const { POST } = await import('@/app/api/auth/native/exchange/route');
    const response = await POST(createExchangeRequest('ios'));
    const data = await response.json();

    // Handled auth rejection — never a 500
    expect(response.status).toBe(401);
    expect(data.reason).toBe('ott_user_mismatch');
    expect(data).not.toHaveProperty('exchangePhase');
    // Guard preserved: the exchange is rejected, no fresh session is minted
    expect(mockInternalAdapterCreateSession).not.toHaveBeenCalled();
    // Handled failures are not reported as unhandled server errors
    expect(mockCaptureError).not.toHaveBeenCalled();
    // Telemetry mirrors the ott_missing event shape
    expect(mockCreateAuthAnalyticsEvent).toHaveBeenCalledWith(
      'auth_exchange_failed',
      {
        client: 'ios',
        intent: 'sign_in',
        result: 'failed',
        reason: 'ott_user_mismatch',
      }
    );
  });

  it('returns 401 ott_user_mismatch when the OTT resolves without a user', async () => {
    setupSuccessfulExchange('ott_123', 'user_ba_123');
    setupIosSessionCreation();
    mockVerifyOneTimeToken.mockResolvedValue(null);

    const { POST } = await import('@/app/api/auth/native/exchange/route');
    const response = await POST(createExchangeRequest('ios'));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.reason).toBe('ott_user_mismatch');
    expect(data).not.toHaveProperty('exchangePhase');
    expect(mockInternalAdapterCreateSession).not.toHaveBeenCalled();
    expect(mockCaptureError).not.toHaveBeenCalled();
  });

  it('returns 401 ott_invalid when OTT verification rejects the token', async () => {
    setupSuccessfulExchange();
    setupIosSessionCreation();
    const { APIError } = await import('better-auth/api');
    mockVerifyOneTimeToken.mockRejectedValue(
      new APIError('BAD_REQUEST', { message: 'Invalid token' })
    );

    const { POST } = await import('@/app/api/auth/native/exchange/route');
    const response = await POST(createExchangeRequest('ios'));
    const data = await response.json();

    // An unverifiable OTT is an auth rejection, not a server fault: the
    // client restarts sign-in from a handled 401 (JOV-4853).
    expect(response.status).toBe(401);
    expect(data.reason).toBe('ott_invalid');
    expect(data).not.toHaveProperty('exchangePhase');
    expect(mockInternalAdapterCreateSession).not.toHaveBeenCalled();
    expect(mockCaptureError).not.toHaveBeenCalled();
    expect(mockCreateAuthAnalyticsEvent).toHaveBeenCalledWith(
      'auth_exchange_failed',
      {
        client: 'ios',
        intent: 'sign_in',
        result: 'failed',
        reason: 'ott_invalid',
      }
    );
  });

  it('returns 401 ott_invalid when the OTT browser session is gone', async () => {
    setupSuccessfulExchange();
    setupIosSessionCreation();
    const { APIError } = await import('better-auth/api');
    mockVerifyOneTimeToken.mockRejectedValue(
      new APIError('BAD_REQUEST', { message: 'Session not found' })
    );

    const { POST } = await import('@/app/api/auth/native/exchange/route');
    const response = await POST(createExchangeRequest('ios'));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.reason).toBe('ott_invalid');
    expect(data).not.toHaveProperty('exchangePhase');
    expect(mockInternalAdapterCreateSession).not.toHaveBeenCalled();
    expect(mockCaptureError).not.toHaveBeenCalled();
  });

  it('keeps a non-API OTT verification failure as a captured 500', async () => {
    setupSuccessfulExchange();
    setupIosSessionCreation();
    mockVerifyOneTimeToken.mockRejectedValue(new Error('adapter down'));
    mockCaptureError.mockResolvedValue(undefined);

    const { POST } = await import('@/app/api/auth/native/exchange/route');
    const response = await POST(createExchangeRequest('ios'));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Native auth exchange failed');
    expect(data).not.toHaveProperty('exchangePhase');
    expect(mockCaptureError).toHaveBeenCalled();
  });

  it('keeps a genuine session-creation failure as a captured 500', async () => {
    setupSuccessfulExchange();
    setupIosSessionCreation();
    mockInternalAdapterCreateSession.mockResolvedValue(null);
    mockCaptureError.mockResolvedValue(undefined);

    const { POST } = await import('@/app/api/auth/native/exchange/route');
    const response = await POST(createExchangeRequest('ios'));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Native auth exchange failed');
    expect(data).not.toHaveProperty('exchangePhase');
    expect(mockCaptureError).toHaveBeenCalled();
  });

  it.each([undefined, 'preconsume'] as const)(
    'forwards only the explicit preliminary validation phase (%s)',
    async exchangePhase => {
      mockConsumeStoredNativeExchangeCode.mockResolvedValue({
        ok: false,
        reason: 'missing',
        ...(exchangePhase ? { exchangePhase } : {}),
      });
      const { POST } = await import('@/app/api/auth/native/exchange/route');
      const response = await POST(createExchangeRequest());
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: 'Invalid native auth exchange',
        reason: 'missing',
        ...(exchangePhase ? { exchangePhase } : {}),
      });
      expect(mockVerifyOneTimeToken).not.toHaveBeenCalled();
      expect(mockInternalAdapterCreateSession).not.toHaveBeenCalled();
      expect(response.headers.get('cache-control')).toContain('no-store');
    }
  );

  it('returns 401 with reason for invalid exchange (wrong_code)', async () => {
    mockConsumeStoredNativeExchangeCode.mockResolvedValue({
      ok: false,
      reason: 'wrong_code',
    });
    mockGeneralLimiterLimit.mockResolvedValue({ success: true });

    const { POST } = await import('@/app/api/auth/native/exchange/route');
    const response = await POST(createExchangeRequest('ios'));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.reason).toBe('wrong_code');
  });

  it('returns 429 when rate limited', async () => {
    mockGeneralLimiterLimit.mockResolvedValue({
      success: false,
      reset: Date.now() + 60_000,
      remaining: 0,
    });

    const { POST } = await import('@/app/api/auth/native/exchange/route');
    const response = await POST(createExchangeRequest('ios'));
    const data = await response.json();

    expect(response.status).toBe(429);
    expect(data.error).toContain('Too many');
  });

  it.each([
    { failure: 'unavailable', unavailable: true },
    { failure: 'degraded', degraded: true },
  ])(
    'completes the iOS exchange when Redis is $failure',
    async ({ unavailable, degraded }) => {
      setupSuccessfulExchange();
      setupIosSessionCreation();
      mockGeneralLimiterLimit.mockResolvedValue({
        success: false,
        unavailable,
        degraded,
        reason: 'redis_unavailable',
        reset: new Date(Date.now() + 60_000),
        remaining: 0,
        limit: 10,
      });

      const { POST } = await import('@/app/api/auth/native/exchange/route');
      const response = await POST(createExchangeRequest('ios'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.sessionToken).toBe('session_token_abc');
      expect(mockConsumeStoredNativeExchangeCode).toHaveBeenCalled();
    }
  );

  it('returns 400 for invalid request shape (missing code)', async () => {
    const request = new NextRequest('https://jov.ie/api/auth/native/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client: 'ios', state: 's' }),
    });
    mockGeneralLimiterLimit.mockResolvedValue({ success: true });

    const { POST } = await import('@/app/api/auth/native/exchange/route');
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('returns 500 on unexpected error', async () => {
    mockConsumeStoredNativeExchangeCode.mockRejectedValue(
      new Error('Redis down')
    );
    mockGeneralLimiterLimit.mockResolvedValue({ success: true });
    mockCaptureError.mockResolvedValue(undefined);

    const { POST } = await import('@/app/api/auth/native/exchange/route');
    const response = await POST(createExchangeRequest('ios'));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Native auth exchange failed');
    expect(data).not.toHaveProperty('exchangePhase');
    expect(mockCaptureError).toHaveBeenCalled();
  });
  it.each([undefined, 'preconsume'] as const)(
    'forwards wrong_attempt with only its actual phase (%s)',
    async exchangePhase => {
      mockConsumeStoredNativeExchangeCode.mockResolvedValue({
        ok: false,
        reason: 'wrong_attempt',
        ...(exchangePhase ? { exchangePhase } : {}),
      });
      const { POST } = await import('@/app/api/auth/native/exchange/route');
      const nativeAttempt = 'a'.repeat(43);
      const response = await POST(createExchangeRequest('ios', nativeAttempt));
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: 'Invalid native auth exchange',
        reason: 'wrong_attempt',
        ...(exchangePhase ? { exchangePhase } : {}),
      });
      expect(mockConsumeStoredNativeExchangeCode).toHaveBeenCalledWith(
        expect.objectContaining({ nativeAttempt })
      );
      expect(mockVerifyOneTimeToken).not.toHaveBeenCalled();
      expect(mockInternalAdapterCreateSession).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['ios', null],
    ['ios', ''],
    ['ios', 'short'],
    ['electron', 'a'.repeat(43)],
  ] as const)(
    'rejects malformed/non-iOS JSON correlation (%s, %s)',
    async (client, nativeAttempt) => {
      const { POST } = await import('@/app/api/auth/native/exchange/route');
      const response = await POST(createExchangeRequest(client, nativeAttempt));
      expect(response.status).toBe(400);
      expect(mockConsumeStoredNativeExchangeCode).not.toHaveBeenCalled();
    }
  );
});
