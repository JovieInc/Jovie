/**
 * GET /api/connectors/spotify/callback
 *
 * Mocks only `@/lib/db`, `@/lib/auth/cached`, `@/lib/http/server-fetch`,
 * `@/lib/env-server`, and `@/lib/error-tracking`. State verification
 * (`verifyGoogleOAuthState`) and token persistence (`storeTokens` → real
 * `encryptPII`) run for real, so a dropped signature check or a dropped
 * encryption call is caught by these assertions rather than by an inspected
 * mock call.
 *
 * `PII_ENCRYPTION_KEY` is left unset so the real `encryptPII` takes its cheap
 * dev/test plaintext-passthrough branch (no `scryptSync` cost).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { SPOTIFY_OAUTH_SCOPES } from '@/lib/connectors/spotify/scopes';

const hoisted = vi.hoisted(() => ({
  getCachedAuthMock: vi.fn(),
  dbInsertMock: vi.fn(),
  dbUpdateMock: vi.fn(),
  serverFetchMock: vi.fn(),
  captureErrorMock: vi.fn().mockResolvedValue(undefined),
  captureWarningMock: vi.fn().mockResolvedValue(undefined),
  mockEnv: {
    SPOTIFY_CLIENT_ID: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4' as string | undefined,
    SPOTIFY_CLIENT_SECRET: 'f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3' as
      | string
      | undefined,
    SPOTIFY_OAUTH_REDIRECT_URI_BASE: undefined as string | undefined,
    TRACKING_TOKEN_SECRET: 'test-oauth-state-secret' as string | undefined,
    CRON_SECRET: undefined as string | undefined,
    PII_ENCRYPTION_KEY: undefined as string | undefined,
    VERCEL_ENV: undefined as string | undefined,
    NODE_ENV: 'test',
  },
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: hoisted.getCachedAuthMock,
}));

vi.mock('@/lib/db', () => ({
  db: { insert: hoisted.dbInsertMock, update: hoisted.dbUpdateMock },
}));

vi.mock('@/lib/http/server-fetch', () => ({
  serverFetch: hoisted.serverFetchMock,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureErrorMock,
  captureWarning: hoisted.captureWarningMock,
}));

vi.mock('@/lib/env-server', () => ({
  env: hoisted.mockEnv,
  isTestEnv: () => true,
}));

import { signGoogleOAuthState } from '@/lib/connectors/google-calendar/oauth-state';

interface InsertCall {
  readonly values: Record<string, unknown>;
  readonly conflict: unknown;
}

interface UpdateCall {
  readonly set: Record<string, unknown>;
  readonly where: unknown;
}

function trackInserts(returnIds: string[]): InsertCall[] {
  const calls: InsertCall[] = [];
  let n = 0;
  hoisted.dbInsertMock.mockImplementation(() => ({
    values: (valuesArg: Record<string, unknown>) => ({
      onConflictDoUpdate: (conflictArg: unknown) => {
        calls.push({ values: valuesArg, conflict: conflictArg });
        const id = returnIds[n] ?? `mock-id-${n}`;
        n += 1;
        return { returning: () => Promise.resolve([{ id }]) };
      },
    }),
  }));
  return calls;
}

/**
 * `where()` must return a thenable (disconnect/mark paths await or `.catch`
 * it) that also exposes `.returning()` for `storeTokens`.
 */
function trackUpdates(): UpdateCall[] {
  const calls: UpdateCall[] = [];
  hoisted.dbUpdateMock.mockImplementation(() => ({
    set: (setArg: Record<string, unknown>) => ({
      where: (whereArg: unknown) => {
        calls.push({ set: setArg, where: whereArg });
        return Object.assign(Promise.resolve(undefined), {
          returning: () => Promise.resolve([{ id: 'updated' }]),
        });
      },
    }),
  }));
  return calls;
}

function tokenResponse(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      access_token: 'spotify-real-access-token',
      refresh_token: 'spotify-refresh-token',
      expires_in: 3600,
      token_type: 'Bearer',
      scope: SPOTIFY_OAUTH_SCOPES.join(' '),
      ...overrides,
    }),
  };
}

function profileResponse(id = 'spotify-user-123') {
  return {
    ok: true,
    status: 200,
    json: async () => ({ id, email: 'dj@example.com' }),
  };
}

function callbackRequest(params: Record<string, string>) {
  const url = new URL('http://localhost/api/connectors/spotify/callback');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new Request(url.toString());
}

function signedState(returnTo = APP_ROUTES.SETTINGS_CONNECTORS) {
  return signGoogleOAuthState({ userId: 'db-user-1', returnTo });
}

describe('GET /api/connectors/spotify/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.mockEnv.SPOTIFY_CLIENT_ID = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
    hoisted.mockEnv.SPOTIFY_CLIENT_SECRET = 'f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3';
    hoisted.mockEnv.SPOTIFY_OAUTH_REDIRECT_URI_BASE = undefined;
    hoisted.mockEnv.TRACKING_TOKEN_SECRET = 'test-oauth-state-secret';
    hoisted.mockEnv.CRON_SECRET = undefined;
    hoisted.mockEnv.PII_ENCRYPTION_KEY = undefined;
    hoisted.getCachedAuthMock.mockResolvedValue({ userId: 'db-user-1' });
  });

  it('redirects with ?error=spotify_oauth_denied when Spotify reports a provider error, without exchanging anything', async () => {
    const { GET } = await import('@/app/api/connectors/spotify/callback/route');
    const response = await GET(
      callbackRequest({ error: 'access_denied', code: 'x', state: 'y' })
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      `http://localhost${APP_ROUTES.SETTINGS_CONNECTORS}?error=spotify_oauth_denied`
    );
    expect(hoisted.serverFetchMock).not.toHaveBeenCalled();
    expect(hoisted.dbInsertMock).not.toHaveBeenCalled();
  });

  it('redirects with ?error=spotify_oauth_missing when code or state is absent', async () => {
    const { GET } = await import('@/app/api/connectors/spotify/callback/route');

    const missingCode = await GET(callbackRequest({ state: 'some-state' }));
    expect(missingCode.headers.get('location')).toBe(
      `http://localhost${APP_ROUTES.SETTINGS_CONNECTORS}?error=spotify_oauth_missing`
    );

    const missingState = await GET(callbackRequest({ code: 'some-code' }));
    expect(missingState.headers.get('location')).toBe(
      `http://localhost${APP_ROUTES.SETTINGS_CONNECTORS}?error=spotify_oauth_missing`
    );
    expect(hoisted.serverFetchMock).not.toHaveBeenCalled();
  });

  it('rejects a tampered state signature without exchanging the code or writing to the DB', async () => {
    const validState = signedState();
    const tampered =
      validState.slice(0, -1) + (validState.at(-1) === 'a' ? 'b' : 'a');

    const { GET } = await import('@/app/api/connectors/spotify/callback/route');
    const response = await GET(
      callbackRequest({ code: 'auth-code-123', state: tampered })
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      `http://localhost${APP_ROUTES.SETTINGS_CONNECTORS}?error=spotify_oauth_callback`
    );
    expect(hoisted.serverFetchMock).not.toHaveBeenCalled();
    expect(hoisted.dbInsertMock).not.toHaveBeenCalled();
    expect(hoisted.captureErrorMock).toHaveBeenCalledWith(
      'Spotify OAuth callback failed',
      expect.any(Error)
    );
  });

  it('redirects with ?error=spotify_session_changed when the session user differs from the state user', async () => {
    hoisted.getCachedAuthMock.mockResolvedValue({ userId: 'other-user' });

    const { GET } = await import('@/app/api/connectors/spotify/callback/route');
    const response = await GET(
      callbackRequest({ code: 'auth-code-123', state: signedState() })
    );

    expect(response.headers.get('location')).toBe(
      `http://localhost${APP_ROUTES.SETTINGS_CONNECTORS}?error=spotify_session_changed`
    );
    expect(hoisted.serverFetchMock).not.toHaveBeenCalled();
  });

  it('redirects with ?error=spotify_not_configured when Spotify credentials are missing', async () => {
    hoisted.mockEnv.SPOTIFY_CLIENT_SECRET = undefined;

    const { GET } = await import('@/app/api/connectors/spotify/callback/route');
    const response = await GET(
      callbackRequest({ code: 'auth-code-123', state: signedState() })
    );

    expect(response.headers.get('location')).toBe(
      `http://localhost${APP_ROUTES.SETTINGS_CONNECTORS}?error=spotify_not_configured`
    );
    expect(hoisted.serverFetchMock).not.toHaveBeenCalled();
  });

  it('does not write any connector rows when the token exchange fails', async () => {
    hoisted.serverFetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_grant' }),
    });

    const { GET } = await import('@/app/api/connectors/spotify/callback/route');
    const response = await GET(
      callbackRequest({ code: 'auth-code-123', state: signedState() })
    );

    expect(response.headers.get('location')).toBe(
      `http://localhost${APP_ROUTES.SETTINGS_CONNECTORS}?error=spotify_token_exchange`
    );
    expect(hoisted.serverFetchMock).toHaveBeenCalledTimes(1);
    expect(hoisted.dbInsertMock).not.toHaveBeenCalled();
  });

  it('does not write any connector rows when the token payload fails validation', async () => {
    hoisted.serverFetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ access_token: '' }),
    });

    const { GET } = await import('@/app/api/connectors/spotify/callback/route');
    const response = await GET(
      callbackRequest({ code: 'auth-code-123', state: signedState() })
    );

    expect(response.headers.get('location')).toBe(
      `http://localhost${APP_ROUTES.SETTINGS_CONNECTORS}?error=spotify_token_invalid`
    );
    expect(hoisted.dbInsertMock).not.toHaveBeenCalled();
  });

  it('redirects with ?error=spotify_scopes when a required scope was not granted', async () => {
    hoisted.serverFetchMock.mockResolvedValueOnce(
      tokenResponse({ scope: 'user-read-email user-read-private' })
    );

    const { GET } = await import('@/app/api/connectors/spotify/callback/route');
    const response = await GET(
      callbackRequest({ code: 'auth-code-123', state: signedState() })
    );

    expect(response.headers.get('location')).toBe(
      `http://localhost${APP_ROUTES.SETTINGS_CONNECTORS}?error=spotify_scopes`
    );
    expect(hoisted.dbInsertMock).not.toHaveBeenCalled();
  });

  it('redirects with ?error=spotify_oauth_callback when the profile fetch fails, before any account row exists', async () => {
    hoisted.serverFetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce({ ok: false, status: 401 });
    const updates = trackUpdates();

    const { GET } = await import('@/app/api/connectors/spotify/callback/route');
    const response = await GET(
      callbackRequest({ code: 'auth-code-123', state: signedState() })
    );

    expect(response.headers.get('location')).toBe(
      `http://localhost${APP_ROUTES.SETTINGS_CONNECTORS}?error=spotify_oauth_callback`
    );
    expect(hoisted.dbInsertMock).not.toHaveBeenCalled();
    // No accountId was minted, so no needs_reauth best-effort update runs.
    expect(updates).toHaveLength(0);
    expect(hoisted.captureErrorMock).toHaveBeenCalledWith(
      'Spotify OAuth callback failed',
      expect.any(Error)
    );
  });

  it('exchanges the code with Basic auth, writes a connected spotify row with capabilities, stores tokens, and honors returnTo', async () => {
    hoisted.serverFetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(profileResponse('spotify-user-123'));
    const inserts = trackInserts(['spotify-acct-id']);
    trackUpdates();

    const { GET } = await import('@/app/api/connectors/spotify/callback/route');
    const response = await GET(
      callbackRequest({
        code: 'auth-code-123',
        state: signedState('/app/custom-return'),
      })
    );

    // --- Exchange request payload ---
    expect(hoisted.serverFetchMock).toHaveBeenNthCalledWith(
      1,
      'https://accounts.spotify.com/api/token',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(
            'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4:f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3'
          ).toString('base64')}`,
        }),
      })
    );
    const exchangeBody = new URLSearchParams(
      (hoisted.serverFetchMock.mock.calls[0][1] as { body: string }).body
    );
    expect(exchangeBody.get('code')).toBe('auth-code-123');
    expect(exchangeBody.get('redirect_uri')).toBe(
      'http://localhost/api/connectors/spotify/callback'
    );
    expect(exchangeBody.get('grant_type')).toBe('authorization_code');

    // --- Profile request uses the exchanged access token ---
    expect(hoisted.serverFetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.spotify.com/v1/me',
      expect.objectContaining({
        headers: { Authorization: 'Bearer spotify-real-access-token' },
      })
    );

    // --- Connector row ---
    expect(inserts).toHaveLength(1);
    expect(inserts[0].values).toMatchObject({
      userId: 'db-user-1',
      provider: 'spotify',
      providerAccountId: 'spotify-user-123',
      scopes: SPOTIFY_OAUTH_SCOPES,
      capabilities: {
        canRead: true,
        canPublishPlaylists: true,
        canUploadImages: true,
      },
    });
    expect(JSON.stringify(inserts[0].values.status)).toContain('connected');

    // --- Redirect honors returnTo from the signed state ---
    expect(response.headers.get('location')).toBe(
      'http://localhost/app/custom-return?connected=spotify'
    );
  });

  it('marks the connector needs_reauth when token persistence fails after the account row was written', async () => {
    hoisted.serverFetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(profileResponse());
    trackInserts(['spotify-acct-id']);
    const updateCalls: UpdateCall[] = [];
    hoisted.dbUpdateMock.mockImplementation(() => ({
      set: (setArg: Record<string, unknown>) => ({
        where: (whereArg: unknown) => {
          updateCalls.push({ set: setArg, where: whereArg });
          return Object.assign(Promise.resolve(undefined), {
            // storeTokens sees zero rows → throws → catch marks needs_reauth
            returning: () => Promise.resolve([]),
          });
        },
      }),
    }));

    const { GET } = await import('@/app/api/connectors/spotify/callback/route');
    const response = await GET(
      callbackRequest({ code: 'auth-code-123', state: signedState() })
    );

    expect(response.headers.get('location')).toBe(
      `http://localhost${APP_ROUTES.SETTINGS_CONNECTORS}?error=spotify_oauth_callback`
    );

    // First update: storeTokens (failed). Second: best-effort needs_reauth.
    expect(updateCalls).toHaveLength(2);
    expect(JSON.stringify(updateCalls[1].set)).toContain('needs_reauth');
    expect(updateCalls[1].set).toEqual(
      expect.objectContaining({
        lastErrorCode: 'spotify_oauth_failed',
      })
    );
  });
});
