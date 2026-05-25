import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCaptureError,
  mockClerkClient,
  mockConsumeStoredNativeExchangeCode,
  mockCreateAuthAnalyticsEvent,
  mockCreateRateLimitHeaders,
  mockGeneralLimiterLimit,
  mockGetClientIP,
  mockSessionsCreateSession,
  mockSessionsGetToken,
  mockSignInTokensCreateSignInToken,
  mockTrackServerEvent,
} = vi.hoisted(() => ({
  mockCaptureError: vi.fn(),
  mockClerkClient: vi.fn(),
  mockConsumeStoredNativeExchangeCode: vi.fn(),
  mockCreateAuthAnalyticsEvent: vi.fn(),
  mockCreateRateLimitHeaders: vi.fn(),
  mockGeneralLimiterLimit: vi.fn(),
  mockGetClientIP: vi.fn(),
  mockSessionsCreateSession: vi.fn(),
  mockSessionsGetToken: vi.fn(),
  mockSignInTokensCreateSignInToken: vi.fn(),
  mockTrackServerEvent: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: mockClerkClient,
}));

vi.mock('@jovie/auth-routing', () => ({
  createAuthAnalyticsEvent: mockCreateAuthAnalyticsEvent,
  isAuthClient: (client: unknown) => client === 'ios' || client === 'electron',
}));

vi.mock('@/lib/auth/routing-state.server', () => ({
  consumeStoredNativeExchangeCode: mockConsumeStoredNativeExchangeCode,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

vi.mock('@/lib/rate-limit', () => ({
  createRateLimitHeaders: mockCreateRateLimitHeaders,
  generalLimiter: {
    limit: mockGeneralLimiterLimit,
  },
  getClientIP: mockGetClientIP,
}));

vi.mock('@/lib/server-analytics', () => ({
  trackServerEvent: mockTrackServerEvent,
}));

function createExchangeRequest() {
  return new NextRequest('https://jov.ie/api/auth/native/exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client: 'ios',
      code: 'native_code',
      state: 'native_state',
      codeVerifier: 'native_verifier',
    }),
  });
}

function createElectronExchangeRequest() {
  return new NextRequest('https://jov.ie/api/auth/native/exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client: 'electron',
      code: 'desktop_code',
      state: 'desktop_state',
      codeVerifier: 'desktop_verifier',
    }),
  });
}

describe('POST /api/auth/native/exchange', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs();

    mockCaptureError.mockResolvedValue(undefined);
    mockCreateAuthAnalyticsEvent.mockReturnValue({});
    mockCreateRateLimitHeaders.mockReturnValue({});
    mockGeneralLimiterLimit.mockResolvedValue({
      success: true,
      limit: 100,
      remaining: 99,
      reset: new Date(Date.now() + 60_000),
    });
    mockGetClientIP.mockReturnValue('127.0.0.1');
    mockConsumeStoredNativeExchangeCode.mockResolvedValue({
      ok: true,
      returnTo: '/app',
      userId: 'user_native',
    });
    mockSignInTokensCreateSignInToken.mockResolvedValue({
      token: 'sign_in_ticket',
    });
    mockSessionsCreateSession.mockResolvedValue({
      id: 'sess_ios',
      userId: 'user_native',
    });
    mockSessionsGetToken.mockResolvedValue({
      jwt: 'ios_session_token',
    });
    mockClerkClient.mockResolvedValue({
      sessions: {
        createSession: mockSessionsCreateSession,
        getToken: mockSessionsGetToken,
      },
      signInTokens: {
        createSignInToken: mockSignInTokensCreateSignInToken,
      },
    });
    mockTrackServerEvent.mockResolvedValue(undefined);
  });

  it('does not allow the real-browser harness token to bypass rate limiting in production', async () => {
    vi.stubEnv('JOVIE_IOS_REAL_BROWSER_AUTH_TOKEN', 'test-token');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');
    mockGeneralLimiterLimit.mockResolvedValue({
      success: false,
      limit: 100,
      remaining: 0,
      reset: new Date(Date.now() + 60_000),
    });

    const { POST } = await import('@/app/api/auth/native/exchange/route');
    const response = await POST(createExchangeRequest());
    const data = await response.json();

    expect(response.status).toBe(429);
    expect(data.error).toBe('Too many auth exchange attempts');
    expect(mockGeneralLimiterLimit).toHaveBeenCalledTimes(1);
    expect(mockConsumeStoredNativeExchangeCode).not.toHaveBeenCalled();
  });

  it('keeps the real-browser harness bypass available for HTTPS preview testing', async () => {
    vi.stubEnv('JOVIE_IOS_REAL_BROWSER_AUTH_TOKEN', 'test-token');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'preview');
    mockGeneralLimiterLimit.mockResolvedValue({
      success: false,
      limit: 100,
      remaining: 0,
      reset: new Date(Date.now() + 60_000),
    });

    const { POST } = await import('@/app/api/auth/native/exchange/route');
    const response = await POST(createExchangeRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      returnTo: '/app',
      sessionToken: 'ios_session_token',
      sessionId: 'sess_ios',
      userId: 'user_native',
    });
    expect(mockGeneralLimiterLimit).not.toHaveBeenCalled();
    expect(mockConsumeStoredNativeExchangeCode).toHaveBeenCalledTimes(1);
  });

  it('returns a server-created session token for iOS native exchange', async () => {
    const { POST } = await import('@/app/api/auth/native/exchange/route');
    const response = await POST(createExchangeRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      returnTo: '/app',
      sessionToken: 'ios_session_token',
      sessionId: 'sess_ios',
      userId: 'user_native',
      expiresInSeconds: 43_200,
    });
    expect(mockSessionsCreateSession).toHaveBeenCalledWith({
      userId: 'user_native',
    });
    expect(mockSessionsGetToken).toHaveBeenCalledWith(
      'sess_ios',
      undefined,
      43_200
    );
    expect(mockSignInTokensCreateSignInToken).not.toHaveBeenCalled();
  });

  it('accepts the Mac OS native exchange client and passes through its PKCE verifier', async () => {
    const { POST } = await import('@/app/api/auth/native/exchange/route');
    const response = await POST(createElectronExchangeRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      returnTo: '/app',
      ticket: 'sign_in_ticket',
    });
    expect(mockConsumeStoredNativeExchangeCode).toHaveBeenCalledWith({
      client: 'electron',
      code: 'desktop_code',
      state: 'desktop_state',
      codeVerifier: 'desktop_verifier',
      createCodeChallenge: expect.any(Function),
    });
  });
});
