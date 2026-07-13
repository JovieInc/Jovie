/**
 * GET /api/connectors/google/authorize
 *
 * Uses the REAL `signGoogleOAuthState`/`verifyGoogleOAuthState` helpers (only
 * `@/lib/env-server`, `@/lib/auth/cached`, `@/lib/db`, and `@/lib/error-tracking`
 * are mocked) so the state token produced by the route is verified through the
 * actual HMAC signing code, not a stand-in.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { verifyGoogleOAuthState } from '@/lib/connectors/google-calendar/oauth-state';

const hoisted = vi.hoisted(() => ({
  getCachedAuthMock: vi.fn(),
  dbSelectMock: vi.fn(),
  captureErrorMock: vi.fn().mockResolvedValue(undefined),
  mockEnv: {
    GOOGLE_OAUTH_CLIENT_ID: 'test-client-id.apps.googleusercontent.com' as
      | string
      | undefined,
    GOOGLE_OAUTH_CLIENT_SECRET: 'test-client-secret' as string | undefined,
    GOOGLE_OAUTH_REDIRECT_URI_BASE: undefined as string | undefined,
    TRACKING_TOKEN_SECRET: 'test-oauth-state-secret' as string | undefined,
    CRON_SECRET: undefined as string | undefined,
  },
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: hoisted.getCachedAuthMock,
}));

vi.mock('@/lib/db', () => ({
  db: { select: hoisted.dbSelectMock },
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: { id: 'users.id', clerkId: 'users.clerk_id' },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureErrorMock,
}));

vi.mock('@/lib/env-server', () => ({
  env: hoisted.mockEnv,
  isTestEnv: () => true,
}));

function selectReturns(rows: Array<{ id: string }>) {
  hoisted.dbSelectMock.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  });
}

function selectThrows(error: Error) {
  hoisted.dbSelectMock.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockRejectedValue(error),
      }),
    }),
  });
}

describe('GET /api/connectors/google/authorize', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.mockEnv.GOOGLE_OAUTH_CLIENT_ID =
      'test-client-id.apps.googleusercontent.com';
    hoisted.mockEnv.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret';
    hoisted.mockEnv.GOOGLE_OAUTH_REDIRECT_URI_BASE = undefined;
    hoisted.mockEnv.TRACKING_TOKEN_SECRET = 'test-oauth-state-secret';
    hoisted.mockEnv.CRON_SECRET = undefined;
    selectReturns([{ id: 'db-user-1' }]);
    hoisted.getCachedAuthMock.mockResolvedValue({ userId: 'clerk_1' });
  });

  it('falls back to the dev fixture seed route when GOOGLE_OAUTH_CLIENT_ID is missing (non-production)', async () => {
    hoisted.mockEnv.GOOGLE_OAUTH_CLIENT_ID = undefined;

    const { GET } = await import('@/app/api/connectors/google/authorize/route');
    const response = await GET(
      new Request('http://localhost/api/connectors/google/authorize')
    );

    expect(response.status).toBe(302);
    const location = response.headers.get('location');
    expect(location).toBe(
      'http://localhost/api/dev/connectors/seed-fixtures?returnTo=%2Fapp%2Fsettings%2Fconnectors'
    );
    // The mock-mode short-circuit happens before the auth check runs at all.
    expect(hoisted.getCachedAuthMock).not.toHaveBeenCalled();
    expect(hoisted.dbSelectMock).not.toHaveBeenCalled();
  });

  it('redirects to sign-in when unauthenticated', async () => {
    hoisted.getCachedAuthMock.mockResolvedValue({ userId: null });

    const { GET } = await import('@/app/api/connectors/google/authorize/route');
    const response = await GET(
      new Request('http://localhost/api/connectors/google/authorize')
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('http://localhost/sign-in');
    // No DB lookup or state signing should occur pre-auth.
    expect(hoisted.dbSelectMock).not.toHaveBeenCalled();
  });

  it('redirects with ?error=auth when the Clerk user has no DB row', async () => {
    selectReturns([]);

    const { GET } = await import('@/app/api/connectors/google/authorize/route');
    const response = await GET(
      new Request('http://localhost/api/connectors/google/authorize')
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      `http://localhost${APP_ROUTES.SETTINGS_CONNECTORS}?error=auth`
    );
  });

  it('builds a Google authorize URL with client_id, redirect_uri, readonly scopes, and a real verifiable state', async () => {
    const { GET } = await import('@/app/api/connectors/google/authorize/route');
    const response = await GET(
      new Request(
        'http://localhost/api/connectors/google/authorize?returnTo=%2Fapp%2Fcustom'
      )
    );

    expect(response.status).toBe(302);
    const location = response.headers.get('location');
    expect(location).toBeTruthy();
    const url = new URL(location as string);

    expect(url.origin + url.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth'
    );
    expect(url.searchParams.get('client_id')).toBe(
      'test-client-id.apps.googleusercontent.com'
    );
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost/api/connectors/google/callback'
    );
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');

    const scope = url.searchParams.get('scope');
    expect(scope).toBeTruthy();
    const scopes = (scope as string).split(' ');
    expect(scopes).toEqual(
      expect.arrayContaining([
        'https://www.googleapis.com/auth/calendar.events.readonly',
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/userinfo.email',
      ])
    );

    // The state must verify through the REAL signing/verification helper and
    // carry the resolved DB user id + the requested returnTo — not the Clerk id.
    const state = url.searchParams.get('state');
    expect(state).toBeTruthy();
    const decoded = verifyGoogleOAuthState(state as string);
    expect(decoded.userId).toBe('db-user-1');
    expect(decoded.returnTo).toBe('/app/custom');
  });

  it('uses GOOGLE_OAUTH_REDIRECT_URI_BASE when configured instead of request origin', async () => {
    hoisted.mockEnv.GOOGLE_OAUTH_REDIRECT_URI_BASE =
      'https://redirect.example.com/api/connectors/google';

    const { GET } = await import('@/app/api/connectors/google/authorize/route');
    const response = await GET(
      new Request('http://localhost/api/connectors/google/authorize')
    );

    const location = response.headers.get('location');
    const url = new URL(location as string);
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://redirect.example.com/api/connectors/google/callback'
    );
  });

  it('produces a state that a tampered signature fails to verify', async () => {
    const { GET } = await import('@/app/api/connectors/google/authorize/route');
    const response = await GET(
      new Request('http://localhost/api/connectors/google/authorize')
    );
    const url = new URL(response.headers.get('location') as string);
    const state = url.searchParams.get('state') as string;

    // Flip the last character of the signature portion to simulate tampering.
    const tampered = state.slice(0, -1) + (state.at(-1) === 'a' ? 'b' : 'a');

    expect(() => verifyGoogleOAuthState(tampered)).toThrow(
      /Invalid Google OAuth state signature/
    );
  });

  it('redirects with ?error=oauth_start and captures the error on unexpected failure', async () => {
    selectThrows(new Error('db unreachable'));

    const { GET } = await import('@/app/api/connectors/google/authorize/route');
    const response = await GET(
      new Request('http://localhost/api/connectors/google/authorize')
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      `http://localhost${APP_ROUTES.SETTINGS_CONNECTORS}?error=oauth_start`
    );
    expect(hoisted.captureErrorMock).toHaveBeenCalledWith(
      'Google OAuth authorize failed',
      expect.any(Error),
      expect.objectContaining({ route: '/api/connectors/google/authorize' })
    );
  });
});
