import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockBuildIosAuthCompleteUrl,
  mockBuildDevTestAuthCookieDescriptors,
  mockCreateStoredNativeExchangeCode,
  mockEnsureDevTestAuthActor,
  mockEnsureLiveDevTestAuthActor,
  mockGetCachedDevTestAuthSession,
  mockGetDevTestAuthAvailability,
  mockIsTrustedTestBypassRequest,
  mockParseDevTestAuthPersona,
  mockRevalidatePath,
  mockSanitizeReturnTo,
  mockSanitizeDevTestAuthRedirectPath,
  mockClerkClient,
  mockClerkGetUser,
  mockClerkGetUserList,
} = vi.hoisted(() => ({
  mockBuildIosAuthCompleteUrl: vi.fn(),
  mockBuildDevTestAuthCookieDescriptors: vi.fn(),
  mockCreateStoredNativeExchangeCode: vi.fn(),
  mockEnsureDevTestAuthActor: vi.fn(),
  mockEnsureLiveDevTestAuthActor: vi.fn(),
  mockGetCachedDevTestAuthSession: vi.fn(),
  mockGetDevTestAuthAvailability: vi.fn(),
  mockIsTrustedTestBypassRequest: vi.fn(),
  mockParseDevTestAuthPersona: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockSanitizeReturnTo: vi.fn(),
  mockSanitizeDevTestAuthRedirectPath: vi.fn(),
  mockClerkClient: vi.fn(),
  mockClerkGetUser: vi.fn(),
  mockClerkGetUserList: vi.fn(),
}));

vi.mock('@jovie/auth-routing', () => ({
  buildIosAuthCompleteUrl: mockBuildIosAuthCompleteUrl,
  sanitizeReturnTo: mockSanitizeReturnTo,
}));

vi.mock('@/lib/auth/dev-test-auth.server', () => ({
  buildDevTestAuthCookieDescriptors: mockBuildDevTestAuthCookieDescriptors,
  DEV_TEST_AUTH_COOKIE_NAMES: [
    '__e2e_test_mode',
    '__e2e_test_user_id',
    '__e2e_test_persona',
  ],
  ensureDevTestAuthActor: mockEnsureDevTestAuthActor,
  ensureLiveDevTestAuthActor: mockEnsureLiveDevTestAuthActor,
  getCachedDevTestAuthSession: mockGetCachedDevTestAuthSession,
  getDevTestAuthAvailability: mockGetDevTestAuthAvailability,
  parseDevTestAuthPersona: mockParseDevTestAuthPersona,
  sanitizeDevTestAuthRedirectPath: mockSanitizeDevTestAuthRedirectPath,
}));

vi.mock('@/lib/auth/routing-state.server', () => ({
  createStoredNativeExchangeCode: mockCreateStoredNativeExchangeCode,
}));

vi.mock('@/lib/auth/test-mode', () => ({
  isTrustedTestBypassRequest: mockIsTrustedTestBypassRequest,
}));

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: mockClerkClient,
}));

vi.mock('next/cache', () => ({
  revalidatePath: mockRevalidatePath,
}));

describe('dev test-auth routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubEnv('E2E_CLERK_USER_ID', '');
    vi.stubEnv('E2E_CLERK_USER_USERNAME', '');
    vi.stubEnv('JOVIE_IOS_LIVE_AUTH_CLERK_USER_ID', '');
    mockClerkClient.mockResolvedValue({
      users: {
        getUser: mockClerkGetUser,
        getUserList: mockClerkGetUserList,
      },
    });
    mockClerkGetUser.mockImplementation((userId: string) =>
      Promise.resolve({ id: userId })
    );
    mockClerkGetUserList.mockResolvedValue({
      data: [{ id: 'user_from_email' }],
    });

    mockGetDevTestAuthAvailability.mockReturnValue({
      enabled: true,
      trustedHost: true,
      reason: null,
    });
    mockIsTrustedTestBypassRequest.mockReturnValue(false);
    mockParseDevTestAuthPersona.mockImplementation(value =>
      value === 'admin' || value === 'creator' || value === 'creator-ready'
        ? value
        : null
    );
    mockSanitizeDevTestAuthRedirectPath.mockImplementation(value =>
      value?.startsWith('/') && !value.startsWith('//') ? value : null
    );
    mockSanitizeReturnTo.mockImplementation((client, value) =>
      client === 'ios' && typeof value === 'string' && value.startsWith('/app')
        ? value
        : null
    );
    mockBuildIosAuthCompleteUrl.mockImplementation(({ code, state }) => {
      const url = new URL('ie.jov.jovie://auth/complete');
      url.searchParams.set('code', code);
      url.searchParams.set('state', state);
      return url.toString();
    });
    mockCreateStoredNativeExchangeCode.mockResolvedValue({});
    mockEnsureDevTestAuthActor.mockResolvedValue({
      persona: 'creator',
      clerkUserId: 'user_creator',
      email: 'browse+clerk_test@jov.ie',
      username: 'browse-test-user',
      fullName: 'Browse Test User',
      isAdmin: false,
      profilePath: '/browse-test-user',
    });
    mockEnsureLiveDevTestAuthActor.mockResolvedValue({
      persona: 'creator',
      clerkUserId: 'user_creator',
      email: 'browse+clerk_test@jov.ie',
      username: 'browse-test-user',
      fullName: 'Browse Test User',
      isAdmin: false,
      profilePath: '/browse-test-user',
    });
    mockBuildDevTestAuthCookieDescriptors.mockReturnValue([
      {
        name: '__e2e_test_mode',
        value: 'bypass-auth',
        httpOnly: true,
        maxAge: 3600,
        path: '/',
        sameSite: 'lax',
        secure: false,
      },
      {
        name: '__e2e_test_user_id',
        value: 'user_creator',
        httpOnly: true,
        maxAge: 3600,
        path: '/',
        sameSite: 'lax',
        secure: false,
      },
      {
        name: '__e2e_test_persona',
        value: 'creator',
        httpOnly: true,
        maxAge: 3600,
        path: '/',
        sameSite: 'lax',
        secure: false,
      },
    ]);
    mockGetCachedDevTestAuthSession.mockResolvedValue(null);
  });

  it('reports availability and active session state from GET /session', async () => {
    mockGetCachedDevTestAuthSession.mockResolvedValue({
      persona: 'creator',
      clerkUserId: 'user_creator',
      email: 'browse+clerk_test@jov.ie',
      profilePath: '/browse-test-user',
    });

    const { GET } = await import('@/app/api/dev/test-auth/session/route');
    const response = await GET(
      new NextRequest('http://localhost:3000/api/dev/test-auth/session')
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      enabled: true,
      trustedHost: true,
      active: true,
      persona: 'creator',
      userId: 'user_creator',
      email: 'browse+clerk_test@jov.ie',
      profilePath: '/browse-test-user',
      reason: null,
    });
  });

  it('returns disabled introspection when the host is not trusted', async () => {
    mockGetDevTestAuthAvailability.mockReturnValue({
      enabled: true,
      trustedHost: false,
      reason: 'Only available on loopback and private dev hosts',
    });

    const { GET } = await import('@/app/api/dev/test-auth/session/route');
    const response = await GET(
      new NextRequest('https://preview.jov.ie/api/dev/test-auth/session')
    );

    expect(await response.json()).toEqual({
      enabled: true,
      trustedHost: false,
      active: false,
      persona: null,
      userId: null,
      email: null,
      profilePath: null,
      reason: 'Only available on loopback and private dev hosts',
    });
  });

  it('sets auth cookies on POST /session', async () => {
    const { POST } = await import('@/app/api/dev/test-auth/session/route');
    const response = await POST(
      new NextRequest('http://localhost:3000/api/dev/test-auth/session', {
        method: 'POST',
        body: JSON.stringify({ persona: 'creator' }),
        headers: {
          'Content-Type': 'application/json',
        },
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      persona: 'creator',
      userId: 'user_creator',
      email: 'browse+clerk_test@jov.ie',
      profilePath: '/browse-test-user',
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/app', 'layout');
    expect(response.headers.get('set-cookie')).toContain('__e2e_test_mode');
    expect(response.headers.get('set-cookie')).toContain('__e2e_test_user_id');
    expect(response.headers.get('set-cookie')).toContain('__e2e_test_persona');
  });

  it('accepts POST /session when the URL host is the server bind address but the request host is loopback', async () => {
    mockGetDevTestAuthAvailability.mockReturnValueOnce({
      enabled: true,
      trustedHost: false,
      reason: 'Only available on loopback and private dev hosts',
    });
    mockIsTrustedTestBypassRequest.mockReturnValueOnce(true);
    mockEnsureDevTestAuthActor.mockResolvedValueOnce({
      persona: 'creator-ready',
      clerkUserId: 'user_creator_ready',
      email: 'browse-ready+clerk_test@jov.ie',
      username: 'browse-ready-user',
      fullName: 'Browse Ready User',
      isAdmin: false,
      profilePath: '/browse-ready-user',
    });

    const { POST } = await import('@/app/api/dev/test-auth/session/route');
    const response = await POST(
      new NextRequest('http://0.0.0.0:3100/api/dev/test-auth/session', {
        method: 'POST',
        body: JSON.stringify({ persona: 'creator-ready' }),
        headers: {
          'Content-Type': 'application/json',
          Host: '127.0.0.1:3100',
        },
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      persona: 'creator-ready',
      userId: 'user_creator_ready',
      email: 'browse-ready+clerk_test@jov.ie',
      profilePath: '/browse-ready-user',
    });
    expect(mockIsTrustedTestBypassRequest).toHaveBeenCalled();
  });

  it('accepts GET /session when the URL host is the server bind address but the request host is loopback', async () => {
    mockGetDevTestAuthAvailability.mockReturnValueOnce({
      enabled: true,
      trustedHost: false,
      reason: 'Only available on loopback and private dev hosts',
    });
    mockIsTrustedTestBypassRequest.mockReturnValueOnce(true);

    const { GET } = await import('@/app/api/dev/test-auth/session/route');
    const response = await GET(
      new NextRequest('http://0.0.0.0:3100/api/dev/test-auth/session', {
        headers: {
          Host: '127.0.0.1:3100',
        },
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      enabled: true,
      trustedHost: true,
      active: false,
      persona: null,
      userId: null,
      email: null,
      profilePath: null,
      reason: null,
    });
    expect(mockIsTrustedTestBypassRequest).toHaveBeenCalled();
  });

  it('accepts DELETE /session when the URL host is the server bind address but the request host is loopback', async () => {
    mockGetDevTestAuthAvailability.mockReturnValueOnce({
      enabled: true,
      trustedHost: false,
      reason: 'Only available on loopback and private dev hosts',
    });
    mockIsTrustedTestBypassRequest.mockReturnValueOnce(true);

    const { DELETE } = await import('@/app/api/dev/test-auth/session/route');
    const response = await DELETE(
      new NextRequest('http://0.0.0.0:3100/api/dev/test-auth/session', {
        method: 'DELETE',
        headers: {
          Host: '127.0.0.1:3100',
        },
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('__e2e_test_persona=');
    expect(mockIsTrustedTestBypassRequest).toHaveBeenCalled();
  });

  it('accepts creator-ready on POST /session', async () => {
    mockEnsureDevTestAuthActor.mockResolvedValueOnce({
      persona: 'creator-ready',
      clerkUserId: 'user_creator_ready',
      email: 'browse-ready+clerk_test@jov.ie',
      username: 'browse-ready-user',
      fullName: 'Browse Ready User',
      isAdmin: false,
      profilePath: '/browse-ready-user',
    });
    mockBuildDevTestAuthCookieDescriptors.mockReturnValueOnce([
      {
        name: '__e2e_test_persona',
        value: 'creator-ready',
        httpOnly: true,
        maxAge: 3600,
        path: '/',
        sameSite: 'lax',
        secure: false,
      },
    ]);

    const { POST } = await import('@/app/api/dev/test-auth/session/route');
    const response = await POST(
      new NextRequest('http://localhost:3000/api/dev/test-auth/session', {
        method: 'POST',
        body: JSON.stringify({ persona: 'creator-ready' }),
        headers: {
          'Content-Type': 'application/json',
        },
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      persona: 'creator-ready',
      userId: 'user_creator_ready',
      email: 'browse-ready+clerk_test@jov.ie',
      profilePath: '/browse-ready-user',
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/app', 'layout');
    expect(response.headers.get('set-cookie')).toContain(
      '__e2e_test_persona=creator-ready'
    );
  });

  it('rejects non-string persona values on POST /session', async () => {
    const { POST } = await import('@/app/api/dev/test-auth/session/route');
    const response = await POST(
      new NextRequest('http://localhost:3000/api/dev/test-auth/session', {
        method: 'POST',
        body: JSON.stringify({ persona: 123 }),
        headers: {
          'Content-Type': 'application/json',
        },
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: 'Invalid persona',
    });
  });

  it('clears bypass cookies on DELETE /session', async () => {
    const { DELETE } = await import('@/app/api/dev/test-auth/session/route');
    const response = await DELETE(
      new NextRequest('http://localhost:3000/api/dev/test-auth/session', {
        method: 'DELETE',
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('__e2e_test_persona=');
  });

  it('rejects DELETE /session when the host is not trusted', async () => {
    mockGetDevTestAuthAvailability.mockReturnValue({
      enabled: true,
      trustedHost: false,
      reason: 'Only available on loopback and private dev hosts',
    });

    const { DELETE } = await import('@/app/api/dev/test-auth/session/route');
    const response = await DELETE(
      new NextRequest('https://preview.jov.ie/api/dev/test-auth/session', {
        method: 'DELETE',
      })
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      success: false,
      error: 'Only available on loopback and private dev hosts',
    });
  });

  it('redirects through the local auth bootstrap entrypoint', async () => {
    const { GET } = await import('@/app/api/dev/test-auth/enter/route');
    const response = await GET(
      new NextRequest(
        'http://localhost:3000/api/dev/test-auth/enter?persona=creator&redirect=/app/dashboard/earnings'
      )
    );

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/app/dashboard/earnings');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/app', 'layout');
    expect(response.headers.get('set-cookie')).toContain('__e2e_test_persona');
  });

  it('redirects through the local auth bootstrap entrypoint for creator-ready', async () => {
    mockEnsureDevTestAuthActor.mockResolvedValueOnce({
      persona: 'creator-ready',
      clerkUserId: 'user_creator_ready',
      email: 'browse-ready+clerk_test@jov.ie',
      username: 'browse-ready-user',
      fullName: 'Browse Ready User',
      isAdmin: false,
      profilePath: '/browse-ready-user',
    });
    mockBuildDevTestAuthCookieDescriptors.mockReturnValueOnce([
      {
        name: '__e2e_test_persona',
        value: 'creator-ready',
        httpOnly: true,
        maxAge: 3600,
        path: '/',
        sameSite: 'lax',
        secure: false,
      },
    ]);

    const { GET } = await import('@/app/api/dev/test-auth/enter/route');
    const response = await GET(
      new NextRequest(
        'http://localhost:3000/api/dev/test-auth/enter?persona=creator-ready&redirect=/app/dashboard/presence'
      )
    );

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/app/dashboard/presence');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/app', 'layout');
    expect(response.headers.get('set-cookie')).toContain(
      '__e2e_test_persona=creator-ready'
    );
  });

  it('rejects external redirect targets on the enter route', async () => {
    mockSanitizeDevTestAuthRedirectPath.mockReturnValue(null);

    const { GET } = await import('@/app/api/dev/test-auth/enter/route');
    const response = await GET(
      new NextRequest(
        'http://localhost:3000/api/dev/test-auth/enter?redirect=https://evil.example'
      )
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: 'Redirect must be app-relative',
    });
  });

  it('rejects protocol-relative redirect targets on the enter route', async () => {
    mockSanitizeDevTestAuthRedirectPath.mockReturnValue(null);

    const { GET } = await import('@/app/api/dev/test-auth/enter/route');
    const response = await GET(
      new NextRequest(
        'http://localhost:3000/api/dev/test-auth/enter?redirect=//evil.example'
      )
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: 'Redirect must be app-relative',
    });
  });

  // Smallest addition for fail-closed prod paths (RED 35.7 critical per register + PR):
  // exercises the !enabled / !trusted early returns (403 for enter/POST, disabled json for GET)
  // in route handlers when getDevTestAuthAvailability reports production-disabled.
  // This kills mutants on the disabled branches, outer json/error paths, 400/403 contracts.
  it('returns disabled (403) on POST /session when availability reports prod/not-enabled (fail-closed)', async () => {
    mockGetDevTestAuthAvailability.mockReturnValueOnce({
      enabled: false,
      trustedHost: false,
      reason: 'Not available in production',
    });

    const { POST } = await import('@/app/api/dev/test-auth/session/route');
    const response = await POST(
      new NextRequest('http://localhost:3000/api/dev/test-auth/session', {
        method: 'POST',
        body: JSON.stringify({ persona: 'creator' }),
        headers: { 'Content-Type': 'application/json' },
      })
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      success: false,
      error: 'Not available in production',
    });
  });

  it('returns disabled (403) on GET /enter when availability reports not-enabled (fail-closed)', async () => {
    mockGetDevTestAuthAvailability.mockReturnValueOnce({
      enabled: false,
      trustedHost: false,
      reason: 'Not available in production',
    });

    const { GET } = await import('@/app/api/dev/test-auth/enter/route');
    const response = await GET(
      new NextRequest(
        'http://localhost:3000/api/dev/test-auth/enter?persona=creator&redirect=/app'
      )
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      success: false,
      error: 'Not available in production',
    });
  });

  it('creates an iOS native callback for local simulator auth smoke tests', async () => {
    mockEnsureLiveDevTestAuthActor.mockResolvedValueOnce({
      persona: 'creator-ready',
      clerkUserId: 'user_creator_ready',
      email: 'browse-ready+clerk_test@jov.ie',
      username: 'browse-ready-user',
      fullName: 'Browse Ready User',
      isAdmin: false,
      profilePath: '/browse-ready-user',
    });
    const codeVerifier = 'test_code_verifier';

    const { POST } = await import(
      '@/app/api/dev/test-auth/mobile-callback/route'
    );
    const response = await POST(
      new NextRequest(
        'http://localhost:3000/api/dev/test-auth/mobile-callback',
        {
          method: 'POST',
          body: JSON.stringify({
            persona: 'creator-ready',
            codeVerifier,
            returnTo: '/app',
          }),
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      client: 'ios',
      callbackUrl: expect.stringMatching(
        /^ie\.jov\.jovie:\/\/auth\/complete\?code=.+&state=.+$/
      ),
      codeVerifier,
      state: expect.any(String),
      returnTo: '/app',
      persona: 'creator-ready',
      userId: 'user_creator_ready',
    });
    expect(mockEnsureLiveDevTestAuthActor).toHaveBeenCalledWith(
      'creator-ready'
    );
    expect(mockCreateStoredNativeExchangeCode).toHaveBeenCalledWith({
      code: expect.any(String),
      client: 'ios',
      state: body.state,
      userId: 'user_creator_ready',
      returnTo: '/app',
      codeChallenge: createHash('sha256')
        .update(codeVerifier)
        .digest('base64url'),
    });
  });

  it('rejects the iOS native callback route when dev auth is disabled', async () => {
    mockGetDevTestAuthAvailability.mockReturnValueOnce({
      enabled: false,
      trustedHost: false,
      reason: 'Not available in production',
    });

    const { POST } = await import(
      '@/app/api/dev/test-auth/mobile-callback/route'
    );
    const response = await POST(
      new NextRequest(
        'http://localhost:3000/api/dev/test-auth/mobile-callback',
        {
          method: 'POST',
          body: JSON.stringify({ codeVerifier: 'test_code_verifier' }),
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      success: false,
      error: 'Not available in production',
    });
    expect(mockCreateStoredNativeExchangeCode).not.toHaveBeenCalled();
  });

  it('rejects unsafe return paths on the iOS native callback route', async () => {
    const { POST } = await import(
      '@/app/api/dev/test-auth/mobile-callback/route'
    );
    const response = await POST(
      new NextRequest(
        'http://localhost:3000/api/dev/test-auth/mobile-callback',
        {
          method: 'POST',
          body: JSON.stringify({
            codeVerifier: 'test_code_verifier',
            returnTo: 'https://evil.example',
          }),
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: 'Invalid return_to',
    });
    expect(mockCreateStoredNativeExchangeCode).not.toHaveBeenCalled();
  });

  it('uses configured real Clerk user id for the iOS native callback route when present', async () => {
    vi.stubEnv('E2E_CLERK_USER_ID', 'user_live_clerk');

    const { POST } = await import(
      '@/app/api/dev/test-auth/mobile-callback/route'
    );
    const response = await POST(
      new NextRequest(
        'http://localhost:3000/api/dev/test-auth/mobile-callback',
        {
          method: 'POST',
          body: JSON.stringify({ codeVerifier: 'test_code_verifier' }),
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );

    expect(response.status).toBe(200);
    expect(mockClerkGetUser).toHaveBeenCalledWith('user_live_clerk');
    expect(mockEnsureDevTestAuthActor).not.toHaveBeenCalled();
    expect(mockEnsureLiveDevTestAuthActor).not.toHaveBeenCalled();
    expect(mockCreateStoredNativeExchangeCode).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_live_clerk',
      })
    );
    expect(await response.json()).toEqual(
      expect.objectContaining({
        userId: 'user_live_clerk',
        persona: 'creator-ready',
      })
    );
  });

  it('falls back to a provisioned actor when configured Clerk user id is stale', async () => {
    vi.stubEnv('E2E_CLERK_USER_ID', 'user_stale_clerk');
    mockClerkGetUser.mockRejectedValueOnce(new Error('Not Found'));
    mockEnsureLiveDevTestAuthActor.mockResolvedValueOnce({
      persona: 'creator-ready',
      clerkUserId: 'user_creator_ready',
      email: 'browse-ready+clerk_test@jov.ie',
      username: 'browse-ready-user',
      fullName: 'Browse Ready User',
      isAdmin: false,
      profilePath: '/browse-ready-user',
    });

    const { GET } = await import(
      '@/app/api/dev/test-auth/mobile-provider-complete/route'
    );
    const response = await GET(
      new NextRequest(
        'http://localhost:3000/api/dev/test-auth/mobile-provider-complete?persona=creator-ready&return_to=%2Fapp&code_challenge=challenge_123&code_challenge_method=S256'
      )
    );

    expect(response.status).toBe(307);
    expect(mockClerkGetUser).toHaveBeenCalledWith('user_stale_clerk');
    expect(mockEnsureLiveDevTestAuthActor).toHaveBeenCalledWith(
      'creator-ready'
    );
    expect(mockCreateStoredNativeExchangeCode).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_creator_ready',
      })
    );
  });

  it('redirects through the iOS custom scheme from the real browser provider-complete route', async () => {
    mockEnsureLiveDevTestAuthActor.mockResolvedValueOnce({
      persona: 'creator-ready',
      clerkUserId: 'user_creator_ready',
      email: 'browse-ready+clerk_test@jov.ie',
      username: 'browse-ready-user',
      fullName: 'Browse Ready User',
      isAdmin: false,
      profilePath: '/browse-ready-user',
    });

    const { GET } = await import(
      '@/app/api/dev/test-auth/mobile-provider-complete/route'
    );
    const response = await GET(
      new NextRequest(
        'http://localhost:3000/api/dev/test-auth/mobile-provider-complete?persona=creator-ready&return_to=%2Fapp&code_challenge=challenge_123&code_challenge_method=S256'
      )
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toMatch(
      /^ie\.jov\.jovie:\/\/auth\/complete\?code=.+&state=.+$/
    );
    expect(mockEnsureLiveDevTestAuthActor).toHaveBeenCalledWith(
      'creator-ready'
    );
    expect(mockCreateStoredNativeExchangeCode).toHaveBeenCalledWith({
      code: expect.any(String),
      client: 'ios',
      state: expect.any(String),
      userId: 'user_creator_ready',
      returnTo: '/app',
      codeChallenge: 'challenge_123',
    });
  });

  it('rejects the iOS provider-complete route without PKCE', async () => {
    const { GET } = await import(
      '@/app/api/dev/test-auth/mobile-provider-complete/route'
    );
    const response = await GET(
      new NextRequest(
        'http://localhost:3000/api/dev/test-auth/mobile-provider-complete?persona=creator-ready'
      )
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: 'Native auth requires PKCE',
    });
    expect(mockCreateStoredNativeExchangeCode).not.toHaveBeenCalled();
  });
});
