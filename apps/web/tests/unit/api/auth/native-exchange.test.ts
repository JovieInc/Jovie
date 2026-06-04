import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCaptureError,
  mockClerkClient,
  mockCreateClerkClient,
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
  mockCreateClerkClient: vi.fn(),
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

vi.mock('@clerk/backend', () => ({
  createClerkClient: mockCreateClerkClient,
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

function createStagingExchangeRequest() {
  return new NextRequest('https://staging.jov.ie/api/auth/native/exchange', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      host: 'staging.jov.ie',
      'x-forwarded-host': 'staging.jov.ie',
    },
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
    const clerkApi = {
      sessions: {
        createSession: mockSessionsCreateSession,
        getToken: mockSessionsGetToken,
      },
      signInTokens: {
        createSignInToken: mockSignInTokensCreateSignInToken,
      },
    };
    mockClerkClient.mockResolvedValue(clerkApi);
    mockCreateClerkClient.mockReturnValue(clerkApi);
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
    expect(mockSessionsGetToken).toHaveBeenCalledWith('sess_ios', '', 43_200);
    expect(mockSignInTokensCreateSignInToken).not.toHaveBeenCalled();
  });

  it('falls back to a sign-in ticket for iOS preview exchange when Sessions API is unavailable', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'preview');
    const unavailableError = new Error('session unavailable');
    Object.assign(unavailableError, { status: 404 });
    mockSessionsCreateSession.mockRejectedValue(unavailableError);

    const { POST } = await import('@/app/api/auth/native/exchange/route');
    const response = await POST(createExchangeRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      returnTo: '/app',
      ticket: 'sign_in_ticket',
      userId: 'user_native',
      expiresInSeconds: 60,
    });
    expect(mockSignInTokensCreateSignInToken).toHaveBeenCalledWith({
      userId: 'user_native',
      expiresInSeconds: 60,
    });
    expect(mockSessionsGetToken).not.toHaveBeenCalled();
  });

  it('falls back to a sign-in ticket for iOS production exchange when Clerk rejects server-created sessions', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');
    const unavailableError = new Error('Bad Request');
    Object.assign(unavailableError, {
      status: 400,
      errors: [
        {
          code: 'request_invalid_for_environment',
          message: 'Invalid request for environment',
          longMessage: 'Request only valid for development instances.',
        },
      ],
    });
    mockSessionsCreateSession.mockRejectedValue(unavailableError);

    const { POST } = await import('@/app/api/auth/native/exchange/route');
    const response = await POST(createExchangeRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      returnTo: '/app',
      ticket: 'sign_in_ticket',
      userId: 'user_native',
      expiresInSeconds: 60,
    });
    expect(mockSignInTokensCreateSignInToken).toHaveBeenCalledWith({
      userId: 'user_native',
      expiresInSeconds: 60,
    });
    expect(mockSessionsGetToken).not.toHaveBeenCalled();
    expect(mockCaptureError).not.toHaveBeenCalled();
  });

  it('uses staging Clerk keys for iOS native exchange on staging hosts', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'pk_live_production');
    vi.stubEnv('CLERK_SECRET_KEY', 'sk_live_production');
    vi.stubEnv('CLERK_PUBLISHABLE_KEY_STAGING', 'pk_live_staging');
    vi.stubEnv('CLERK_SECRET_KEY_STAGING', 'sk_live_staging');
    const unavailableError = new Error('Bad Request');
    Object.assign(unavailableError, {
      status: 400,
      errors: [{ code: 'request_invalid_for_environment' }],
    });
    mockSessionsCreateSession.mockRejectedValue(unavailableError);

    const { POST } = await import('@/app/api/auth/native/exchange/route');
    const response = await POST(createStagingExchangeRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      returnTo: '/app',
      ticket: 'sign_in_ticket',
      userId: 'user_native',
      expiresInSeconds: 60,
    });
    expect(mockCreateClerkClient).toHaveBeenCalledWith({
      publishableKey: 'pk_live_staging',
      secretKey: 'sk_live_staging',
    });
    expect(mockClerkClient).not.toHaveBeenCalled();
  });

  it('accepts the Mac OS native exchange client and passes through its PKCE verifier', async () => {
    const { POST } = await import('@/app/api/auth/native/exchange/route');
    const response = await POST(createElectronExchangeRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      returnTo: '/app',
      ticket: 'sign_in_ticket',
      userId: 'user_native',
    });
    expect(mockConsumeStoredNativeExchangeCode).toHaveBeenCalledWith({
      client: 'electron',
      code: 'desktop_code',
      state: 'desktop_state',
      codeVerifier: 'desktop_verifier',
      createCodeChallenge: expect.any(Function),
    });
  });

  it('returns a clear desktop auth error when Clerk sign-in tokens are unavailable', async () => {
    const unavailableError = new Error('sign-in token unavailable');
    Object.assign(unavailableError, { status: 404 });
    mockSignInTokensCreateSignInToken.mockRejectedValue(unavailableError);

    const { POST } = await import('@/app/api/auth/native/exchange/route');
    const response = await POST(createElectronExchangeRequest());
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data).toEqual({
      error: 'Desktop native auth unavailable',
      reason: 'desktop_sign_in_token_unavailable',
    });
    expect(mockSessionsCreateSession).not.toHaveBeenCalled();
    expect(mockSessionsGetToken).not.toHaveBeenCalled();
  });
});
