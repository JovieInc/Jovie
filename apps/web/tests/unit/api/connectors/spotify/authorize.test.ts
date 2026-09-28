/**
 * GET /api/connectors/spotify/authorize
 *
 * Uses the REAL `signGoogleOAuthState`/`verifyGoogleOAuthState` helpers (only
 * `@/lib/env-server`, `@/lib/auth/cached`, and `@/lib/error-tracking` are
 * mocked) so the state token produced by the route is verified through the
 * actual HMAC signing code, not a stand-in.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { verifyGoogleOAuthState } from '@/lib/connectors/google-calendar/oauth-state';
import { SPOTIFY_OAUTH_SCOPES } from '@/lib/connectors/spotify/scopes';

const hoisted = vi.hoisted(() => ({
  getCachedAuthMock: vi.fn(),
  captureErrorMock: vi.fn().mockResolvedValue(undefined),
  mockEnv: {
    SPOTIFY_CLIENT_ID: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4' as string | undefined,
    SPOTIFY_CLIENT_SECRET: 'f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3' as
      | string
      | undefined,
    SPOTIFY_OAUTH_REDIRECT_URI_BASE: undefined as string | undefined,
    TRACKING_TOKEN_SECRET: 'test-oauth-state-secret' as string | undefined,
    CRON_SECRET: undefined as string | undefined,
  },
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: hoisted.getCachedAuthMock,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureErrorMock,
}));

vi.mock('@/lib/env-server', () => ({
  env: hoisted.mockEnv,
  isTestEnv: () => true,
}));

describe('GET /api/connectors/spotify/authorize', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.mockEnv.SPOTIFY_CLIENT_ID = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
    hoisted.mockEnv.SPOTIFY_CLIENT_SECRET = 'f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3';
    hoisted.mockEnv.SPOTIFY_OAUTH_REDIRECT_URI_BASE = undefined;
    hoisted.mockEnv.TRACKING_TOKEN_SECRET = 'test-oauth-state-secret';
    hoisted.mockEnv.CRON_SECRET = undefined;
    hoisted.getCachedAuthMock.mockResolvedValue({ userId: 'db-user-1' });
  });

  it('redirects to sign-in when unauthenticated', async () => {
    hoisted.getCachedAuthMock.mockResolvedValue({ userId: null });

    const { GET } = await import(
      '@/app/api/connectors/spotify/authorize/route'
    );
    const response = await GET(
      new Request('http://localhost/api/connectors/spotify/authorize')
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('http://localhost/sign-in');
  });

  it('redirects with ?error=spotify_not_configured when SPOTIFY_CLIENT_ID is missing', async () => {
    hoisted.mockEnv.SPOTIFY_CLIENT_ID = undefined;

    const { GET } = await import(
      '@/app/api/connectors/spotify/authorize/route'
    );
    const response = await GET(
      new Request('http://localhost/api/connectors/spotify/authorize')
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      `http://localhost${APP_ROUTES.SETTINGS_CONNECTORS}?error=spotify_not_configured`
    );
  });

  it('builds a Spotify authorize URL with client_id, redirect_uri, canonical scopes, and a real verifiable state', async () => {
    const { GET } = await import(
      '@/app/api/connectors/spotify/authorize/route'
    );
    const response = await GET(
      new Request(
        'http://localhost/api/connectors/spotify/authorize?returnTo=%2Fapp%2Fcustom'
      )
    );

    expect(response.status).toBe(302);
    const location = response.headers.get('location');
    expect(location).toBeTruthy();
    const url = new URL(location as string);

    expect(url.origin + url.pathname).toBe(
      'https://accounts.spotify.com/authorize'
    );
    expect(url.searchParams.get('client_id')).toBe(
      'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4'
    );
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost/api/connectors/spotify/callback'
    );
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('show_dialog')).toBe('true');

    const scope = url.searchParams.get('scope');
    expect(scope).toBeTruthy();
    const scopes = (scope as string).split(' ');
    for (const required of SPOTIFY_OAUTH_SCOPES) {
      expect(scopes).toContain(required);
    }

    const state = url.searchParams.get('state');
    expect(state).toBeTruthy();
    const decoded = verifyGoogleOAuthState(state as string);
    expect(decoded.userId).toBe('db-user-1');
    expect(decoded.returnTo).toBe('/app/custom');
  });

  it('falls back to the connectors settings route when returnTo is not an in-app path', async () => {
    const { GET } = await import(
      '@/app/api/connectors/spotify/authorize/route'
    );
    const response = await GET(
      new Request(
        'http://localhost/api/connectors/spotify/authorize?returnTo=https%3A%2F%2Fevil.example'
      )
    );

    const url = new URL(response.headers.get('location') as string);
    const state = url.searchParams.get('state') as string;
    const decoded = verifyGoogleOAuthState(state);
    expect(decoded.returnTo).toBe(APP_ROUTES.SETTINGS_CONNECTORS);
  });

  it('uses SPOTIFY_OAUTH_REDIRECT_URI_BASE when configured instead of the request origin', async () => {
    hoisted.mockEnv.SPOTIFY_OAUTH_REDIRECT_URI_BASE =
      'https://redirect.example.com/api/connectors/spotify';

    const { GET } = await import(
      '@/app/api/connectors/spotify/authorize/route'
    );
    const response = await GET(
      new Request('http://localhost/api/connectors/spotify/authorize')
    );

    const url = new URL(response.headers.get('location') as string);
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://redirect.example.com/api/connectors/spotify/callback'
    );
  });

  it('redirects with ?error=spotify_oauth_start and captures the error on unexpected failure', async () => {
    hoisted.getCachedAuthMock.mockRejectedValue(new Error('auth unavailable'));

    const { GET } = await import(
      '@/app/api/connectors/spotify/authorize/route'
    );
    const response = await GET(
      new Request('http://localhost/api/connectors/spotify/authorize')
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      `http://localhost${APP_ROUTES.SETTINGS_CONNECTORS}?error=spotify_oauth_start`
    );
    expect(hoisted.captureErrorMock).toHaveBeenCalledWith(
      'Spotify OAuth authorize failed',
      expect.any(Error)
    );
  });
});
