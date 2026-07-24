import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockBuildIosAuthCompleteUrl,
  mockBuildDevTestAuthCookieDescriptors,
  mockCreateStoredNativeExchangeCode,
  mockEnsureDevTestAuthActor,
  mockEnsureExistingDevTestAuthActor,
  mockEnsureLiveDevTestAuthActor,
  mockGetCachedDevTestAuthSession,
  mockGetDevTestAuthAvailability,
  mockIsTrustedTestBypassRequest,
  mockParseDevTestAuthPersona,
  mockRevalidatePath,
  mockSanitizeReturnTo,
  mockSanitizeDevTestAuthRedirectPath,
  mockResolveConfiguredNativeTestBetterAuthUserId,
} = vi.hoisted(() => ({
  mockBuildIosAuthCompleteUrl: vi.fn(),
  mockBuildDevTestAuthCookieDescriptors: vi.fn(),
  mockCreateStoredNativeExchangeCode: vi.fn(),
  mockEnsureDevTestAuthActor: vi.fn(),
  mockEnsureExistingDevTestAuthActor: vi.fn(),
  mockEnsureLiveDevTestAuthActor: vi.fn(),
  mockGetCachedDevTestAuthSession: vi.fn(),
  mockGetDevTestAuthAvailability: vi.fn(),
  mockIsTrustedTestBypassRequest: vi.fn(),
  mockParseDevTestAuthPersona: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockSanitizeReturnTo: vi.fn(),
  mockSanitizeDevTestAuthRedirectPath: vi.fn(),
  mockResolveConfiguredNativeTestBetterAuthUserId: vi.fn(),
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
  ensureExistingDevTestAuthActor: mockEnsureExistingDevTestAuthActor,
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

vi.mock('@/lib/auth/native-test-clerk-user.server', () => ({
  resolveConfiguredNativeTestBetterAuthUserId:
    mockResolveConfiguredNativeTestBetterAuthUserId,
}));

vi.mock('next/cache', () => ({
  revalidatePath: mockRevalidatePath,
}));

describe('dev test-auth routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv('E2E_CLERK_USER_ID', '');
    vi.stubEnv('E2E_CLERK_USER_USERNAME', '');
    vi.stubEnv('JOVIE_IOS_LIVE_AUTH_CLERK_USER_ID', '');
    mockResolveConfiguredNativeTestBetterAuthUserId.mockResolvedValue(null);

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
    mockEnsureExistingDevTestAuthActor.mockResolvedValue({
      persona: 'creator',
      clerkUserId: 'ba-real-user',
      email: 'existing@test.jovie.com',
      username: 'existing-user',
      fullName: 'Existing User',
      isAdmin: false,
      profilePath: '/existing-user',
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

  it('validates an existing persisted actor before setting auth cookies', async () => {
    const { POST } = await import('@/app/api/dev/test-auth/session/route');
    const response = await POST(
      new NextRequest('http://localhost:3000/api/dev/test-auth/session', {
        method: 'POST',
        body: JSON.stringify({
          persona: 'creator',
          existingUserId: 'ba-real-user',
        }),
        headers: { 'Content-Type': 'application/json' },
      })
    );

    expect(response.status).toBe(200);
    expect(mockEnsureExistingDevTestAuthActor).toHaveBeenCalledWith(
      'ba-real-user',
      'creator'
    );
    expect(mockEnsureDevTestAuthActor).not.toHaveBeenCalled();
  });

  it('fails closed when an existing actor is not persisted', async () => {
    mockEnsureExistingDevTestAuthActor.mockResolvedValueOnce(null);
    const { POST } = await import('@/app/api/dev/test-auth/session/route');
    const response = await POST(
      new NextRequest('http://localhost:3000/api/dev/test-auth/session', {
        method: 'POST',
        body: JSON.stringify({
          persona: 'creator',
          existingUserId: 'synthetic-user',
        }),
        headers: { 'Content-Type': 'application/json' },
      })
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      success: false,
      error: 'Unknown Better Auth test user',
    });
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

  it('accepts GET /enter when URL host is the bind address but Host header is loopback', async () => {
    // Standalone Next can surface nextUrl.hostname as 0.0.0.0 / runner HOSTNAME
    // while Playwright still sends Host: localhost — same fallback as /session.
    mockGetDevTestAuthAvailability.mockReturnValueOnce({
      enabled: true,
      trustedHost: false,
      reason: 'Only available on loopback and private dev hosts',
    });
    mockIsTrustedTestBypassRequest.mockReturnValueOnce(true);

    const { GET } = await import('@/app/api/dev/test-auth/enter/route');
    const response = await GET(
      new NextRequest(
        'http://0.0.0.0:3100/api/dev/test-auth/enter?persona=creator&redirect=/app',
        {
          headers: {
            Host: 'localhost:3100',
          },
        }
      )
    );

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/app');
    expect(mockIsTrustedTestBypassRequest).toHaveBeenCalled();
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
      reason: 'Not available outside development',
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
      error: 'Not available outside development',
    });
  });

  it('returns disabled (403) on GET /enter when availability reports not-enabled (fail-closed)', async () => {
    mockGetDevTestAuthAvailability.mockReturnValueOnce({
      enabled: false,
      trustedHost: false,
      reason: 'Not available outside development',
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
      error: 'Not available outside development',
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
      reason: 'Not available outside development',
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
      error: 'Not available outside development',
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

  it('uses configured real Better Auth user id for the iOS native callback route when present', async () => {
    mockResolveConfiguredNativeTestBetterAuthUserId.mockResolvedValueOnce(
      'ba_live_user'
    );

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
    expect(mockResolveConfiguredNativeTestBetterAuthUserId).toHaveBeenCalled();
    expect(mockEnsureDevTestAuthActor).not.toHaveBeenCalled();
    expect(mockEnsureLiveDevTestAuthActor).not.toHaveBeenCalled();
    expect(mockCreateStoredNativeExchangeCode).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'ba_live_user',
      })
    );
    expect(await response.json()).toEqual(
      expect.objectContaining({
        userId: 'ba_live_user',
        persona: 'creator-ready',
      })
    );
  });

  it('falls back to a provisioned actor when configured Better Auth user id is unavailable', async () => {
    mockResolveConfiguredNativeTestBetterAuthUserId.mockResolvedValueOnce(null);
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
    expect(mockResolveConfiguredNativeTestBetterAuthUserId).toHaveBeenCalled();
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

  it('allows the iOS provider-complete route on HTTPS preview only with the configured test token', async () => {
    vi.stubEnv('JOVIE_IOS_REAL_BROWSER_AUTH_TOKEN', 'test-token');
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
        'https://preview.jov.ie/api/dev/test-auth/mobile-provider-complete?persona=creator-ready&return_to=%2Fapp&code_challenge=challenge_123&code_challenge_method=S256&test_token=test-token'
      )
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toMatch(
      /^ie\.jov\.jovie:\/\/auth\/complete\?code=.+&state=.+$/
    );
    expect(mockCreateStoredNativeExchangeCode).toHaveBeenCalledWith(
      expect.objectContaining({
        client: 'ios',
        userId: 'user_creator_ready',
        returnTo: '/app',
        codeChallenge: 'challenge_123',
      })
    );
    expect(mockGetDevTestAuthAvailability).not.toHaveBeenCalled();
  });

  it('rejects the iOS provider-complete token bypass on production deployments', async () => {
    vi.stubEnv('JOVIE_IOS_REAL_BROWSER_AUTH_TOKEN', 'test-token');
    vi.stubEnv('VERCEL_ENV', 'production');

    const { GET } = await import(
      '@/app/api/dev/test-auth/mobile-provider-complete/route'
    );
    const response = await GET(
      new NextRequest(
        'https://jov.ie/api/dev/test-auth/mobile-provider-complete?persona=creator-ready&return_to=%2Fapp&code_challenge=challenge_123&code_challenge_method=S256&test_token=test-token'
      )
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      success: false,
      error: 'Not available outside development',
    });
    expect(mockCreateStoredNativeExchangeCode).not.toHaveBeenCalled();
    expect(mockGetDevTestAuthAvailability).not.toHaveBeenCalled();
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
