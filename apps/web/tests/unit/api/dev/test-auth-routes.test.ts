import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockBuildDevTestAuthCookieDescriptors,
  mockEnsureDevTestAuthActor,
  mockGetCachedDevTestAuthSession,
  mockGetDevTestAuthAvailability,
  mockParseDevTestAuthPersona,
  mockRevalidatePath,
  mockSanitizeDevTestAuthRedirectPath,
} = vi.hoisted(() => ({
  mockBuildDevTestAuthCookieDescriptors: vi.fn(),
  mockEnsureDevTestAuthActor: vi.fn(),
  mockGetCachedDevTestAuthSession: vi.fn(),
  mockGetDevTestAuthAvailability: vi.fn(),
  mockParseDevTestAuthPersona: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockSanitizeDevTestAuthRedirectPath: vi.fn(),
}));

vi.mock('@/lib/auth/dev-test-auth.server', () => ({
  buildDevTestAuthCookieDescriptors: mockBuildDevTestAuthCookieDescriptors,
  DEV_TEST_AUTH_COOKIE_NAMES: [
    '__e2e_test_mode',
    '__e2e_test_user_id',
    '__e2e_test_persona',
  ],
  ensureDevTestAuthActor: mockEnsureDevTestAuthActor,
  getCachedDevTestAuthSession: mockGetCachedDevTestAuthSession,
  getDevTestAuthAvailability: mockGetDevTestAuthAvailability,
  parseDevTestAuthPersona: mockParseDevTestAuthPersona,
  sanitizeDevTestAuthRedirectPath: mockSanitizeDevTestAuthRedirectPath,
}));

vi.mock('next/cache', () => ({
  revalidatePath: mockRevalidatePath,
}));

describe('dev test-auth routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    mockGetDevTestAuthAvailability.mockReturnValue({
      enabled: true,
      trustedHost: true,
      reason: null,
    });
    mockParseDevTestAuthPersona.mockImplementation(value =>
      value === 'admin' || value === 'creator' || value === 'creator-ready'
        ? value
        : null
    );
    mockSanitizeDevTestAuthRedirectPath.mockImplementation(value =>
      value?.startsWith('/') && !value.startsWith('//') ? value : null
    );
    mockEnsureDevTestAuthActor.mockResolvedValue({
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
});
