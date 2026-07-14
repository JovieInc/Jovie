/**
 * GET /api/connectors/google/callback
 *
 * Mocks only `@/lib/db`, `@/lib/http/server-fetch`, `@/lib/env-server`, and
 * `@/lib/error-tracking`. State verification (`verifyGoogleOAuthState`) and
 * token persistence (`storeTokens` → real `encryptPII`/`decryptPII`) run for
 * real, so a dropped signature check or a dropped encryption call is caught
 * by these assertions rather than by an inspected mock call.
 *
 * `PII_ENCRYPTION_KEY` is left unset for most tests (real `encryptPII` then
 * takes its cheap dev/test plaintext-passthrough branch — no `scryptSync`
 * cost). Exactly one test ("persists AES-256-GCM encrypted tokens...") sets a
 * real key to exercise the full AES-256-GCM path; that test is intentionally
 * isolated and slower (~2 real KDF-backed encrypt/decrypt round trips).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';

const hoisted = vi.hoisted(() => ({
  dbInsertMock: vi.fn(),
  dbUpdateMock: vi.fn(),
  serverFetchMock: vi.fn(),
  captureErrorMock: vi.fn().mockResolvedValue(undefined),
  captureWarningMock: vi.fn().mockResolvedValue(undefined),
  mockEnv: {
    GOOGLE_OAUTH_CLIENT_ID: 'test-client-id.apps.googleusercontent.com' as
      | string
      | undefined,
    GOOGLE_OAUTH_CLIENT_SECRET: 'test-client-secret' as string | undefined,
    GOOGLE_OAUTH_REDIRECT_URI_BASE: undefined as string | undefined,
    TRACKING_TOKEN_SECRET: 'test-oauth-state-secret' as string | undefined,
    CRON_SECRET: undefined as string | undefined,
    PII_ENCRYPTION_KEY: undefined as string | undefined,
    VERCEL_ENV: undefined as string | undefined,
    NODE_ENV: 'test',
  },
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
import { decryptPII } from '@/lib/utils/pii-encryption';

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

function trackUpdates(): UpdateCall[] {
  const calls: UpdateCall[] = [];
  hoisted.dbUpdateMock.mockImplementation(() => ({
    set: (setArg: Record<string, unknown>) => ({
      where: (whereArg: unknown) => {
        calls.push({ set: setArg, where: whereArg });
        return { returning: () => Promise.resolve([{ id: 'updated' }]) };
      },
    }),
  }));
  return calls;
}

function tokenResponse(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    ok: true,
    status: 200,
    text: async () => 'unused',
    json: async () => ({
      access_token: 'ya29.real-access-token',
      refresh_token: 'refresh-token-value',
      expires_in: 3600,
      token_type: 'Bearer',
      scope: [
        'https://www.googleapis.com/auth/calendar.events.readonly',
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/userinfo.email',
      ].join(' '),
      ...overrides,
    }),
  };
}

function userInfoResponse(email = 'dj@example.com') {
  return {
    ok: true,
    status: 200,
    json: async () => ({ email, sub: 'google-sub-123' }),
  };
}

function callbackRequest(params: Record<string, string>) {
  const url = new URL('http://localhost/api/connectors/google/callback');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new Request(url.toString());
}

describe('GET /api/connectors/google/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.mockEnv.GOOGLE_OAUTH_CLIENT_ID =
      'test-client-id.apps.googleusercontent.com';
    hoisted.mockEnv.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret';
    hoisted.mockEnv.GOOGLE_OAUTH_REDIRECT_URI_BASE = undefined;
    hoisted.mockEnv.TRACKING_TOKEN_SECRET = 'test-oauth-state-secret';
    hoisted.mockEnv.CRON_SECRET = undefined;
    // Unset by default so encryptPII/decryptPII take the cheap dev/test
    // plaintext-passthrough branch (no scryptSync). One test below opts in.
    hoisted.mockEnv.PII_ENCRYPTION_KEY = undefined;
  });

  it('redirects with ?error=oauth_denied when Google reports a provider error, without exchanging anything', async () => {
    const { GET } = await import('@/app/api/connectors/google/callback/route');
    const response = await GET(
      callbackRequest({ error: 'access_denied', code: 'x', state: 'y' })
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      `http://localhost${APP_ROUTES.SETTINGS_CONNECTORS}?error=oauth_denied`
    );
    expect(hoisted.serverFetchMock).not.toHaveBeenCalled();
    expect(hoisted.dbInsertMock).not.toHaveBeenCalled();
  });

  it('redirects with ?error=oauth_missing_params when code or state is absent', async () => {
    const { GET } = await import('@/app/api/connectors/google/callback/route');

    const missingCode = await GET(callbackRequest({ state: 'some-state' }));
    expect(missingCode.headers.get('location')).toBe(
      `http://localhost${APP_ROUTES.SETTINGS_CONNECTORS}?error=oauth_missing_params`
    );

    const missingState = await GET(callbackRequest({ code: 'some-code' }));
    expect(missingState.headers.get('location')).toBe(
      `http://localhost${APP_ROUTES.SETTINGS_CONNECTORS}?error=oauth_missing_params`
    );
    expect(hoisted.serverFetchMock).not.toHaveBeenCalled();
  });

  it('rejects a tampered state signature without exchanging the code or writing to the DB', async () => {
    const validState = signGoogleOAuthState({
      userId: 'db-user-1',
      returnTo: '/app/settings/connectors',
    });
    const tampered =
      validState.slice(0, -1) + (validState.at(-1) === 'a' ? 'b' : 'a');

    const { GET } = await import('@/app/api/connectors/google/callback/route');
    const response = await GET(
      callbackRequest({ code: 'auth-code-123', state: tampered })
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      `http://localhost${APP_ROUTES.SETTINGS_CONNECTORS}?error=oauth_callback`
    );
    expect(hoisted.serverFetchMock).not.toHaveBeenCalled();
    expect(hoisted.dbInsertMock).not.toHaveBeenCalled();
    expect(hoisted.captureErrorMock).toHaveBeenCalledWith(
      'Google OAuth callback failed',
      expect.any(Error),
      expect.objectContaining({ route: '/api/connectors/google/callback' })
    );
  });

  it('rejects an expired (>15 min old) state without exchanging the code', async () => {
    const now = Date.now();
    const validState = signGoogleOAuthState({
      userId: 'db-user-1',
      returnTo: '/app/settings/connectors',
    });

    vi.useFakeTimers();
    vi.setSystemTime(now + 16 * 60 * 1000);
    try {
      const { GET } = await import(
        '@/app/api/connectors/google/callback/route'
      );
      const response = await GET(
        callbackRequest({ code: 'auth-code-123', state: validState })
      );

      expect(response.headers.get('location')).toBe(
        `http://localhost${APP_ROUTES.SETTINGS_CONNECTORS}?error=oauth_callback`
      );
      expect(hoisted.serverFetchMock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not write any connector rows when token exchange fails', async () => {
    const validState = signGoogleOAuthState({
      userId: 'db-user-1',
      returnTo: '/app/settings/connectors',
    });
    hoisted.serverFetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => 'invalid_grant',
    });

    const { GET } = await import('@/app/api/connectors/google/callback/route');
    const response = await GET(
      callbackRequest({ code: 'auth-code-123', state: validState })
    );

    expect(response.headers.get('location')).toBe(
      `http://localhost${APP_ROUTES.SETTINGS_CONNECTORS}?error=token_exchange`
    );
    expect(hoisted.serverFetchMock).toHaveBeenCalledTimes(1);
    expect(hoisted.dbInsertMock).not.toHaveBeenCalled();
  });

  it('does not write any connector rows when the userinfo fetch fails', async () => {
    const validState = signGoogleOAuthState({
      userId: 'db-user-1',
      returnTo: '/app/settings/connectors',
    });
    hoisted.serverFetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce({ ok: false, status: 401 });

    const { GET } = await import('@/app/api/connectors/google/callback/route');
    const response = await GET(
      callbackRequest({ code: 'auth-code-123', state: validState })
    );

    expect(response.headers.get('location')).toBe(
      `http://localhost${APP_ROUTES.SETTINGS_CONNECTORS}?error=userinfo`
    );
    expect(hoisted.serverFetchMock).toHaveBeenCalledTimes(2);
    expect(hoisted.dbInsertMock).not.toHaveBeenCalled();
  });

  it('exchanges the code with the correct payload and persists gmail + google_calendar rows', async () => {
    const validState = signGoogleOAuthState({
      userId: 'db-user-1',
      returnTo: '/app/custom-return',
    });
    hoisted.serverFetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(userInfoResponse('dj@example.com'));
    const inserts = trackInserts(['gmail-acct-id', 'calendar-acct-id']);
    trackUpdates();

    const { GET } = await import('@/app/api/connectors/google/callback/route');
    const response = await GET(
      callbackRequest({ code: 'auth-code-123', state: validState })
    );

    // --- Exchange request payload ---
    expect(hoisted.serverFetchMock).toHaveBeenNthCalledWith(
      1,
      'https://oauth2.googleapis.com/token',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
    );
    const exchangeBody = new URLSearchParams(
      (hoisted.serverFetchMock.mock.calls[0][1] as { body: string }).body
    );
    expect(exchangeBody.get('code')).toBe('auth-code-123');
    expect(exchangeBody.get('client_id')).toBe(
      'test-client-id.apps.googleusercontent.com'
    );
    expect(exchangeBody.get('client_secret')).toBe('test-client-secret');
    expect(exchangeBody.get('redirect_uri')).toBe(
      'http://localhost/api/connectors/google/callback'
    );
    expect(exchangeBody.get('grant_type')).toBe('authorization_code');

    // --- Userinfo request uses the exchanged access token ---
    expect(hoisted.serverFetchMock).toHaveBeenNthCalledWith(
      2,
      'https://www.googleapis.com/oauth2/v3/userinfo',
      expect.objectContaining({
        headers: { Authorization: 'Bearer ya29.real-access-token' },
      })
    );

    // --- Both connector rows written, correctly identified ---
    expect(inserts).toHaveLength(2);
    expect(inserts[0].values).toMatchObject({
      provider: 'gmail',
      providerAccountId: 'dj@example.com',
      capabilities: { canRead: true },
    });
    expect(inserts[1].values).toMatchObject({
      provider: 'google_calendar',
      providerAccountId: 'dj@example.com',
      // calendar.events (write) scope was granted in tokenResponse() defaults.
      capabilities: { canRead: true, canWrite: true },
    });

    // --- Redirect honors returnTo from the signed state ---
    expect(response.headers.get('location')).toBe(
      'http://localhost/app/custom-return?connected=google'
    );
  });

  it('does not grant canWrite capability when the calendar.events (write) scope was not granted', async () => {
    const validState = signGoogleOAuthState({
      userId: 'db-user-1',
      returnTo: '/app/settings/connectors',
    });
    hoisted.serverFetchMock
      .mockResolvedValueOnce(
        tokenResponse({
          scope: [
            'https://www.googleapis.com/auth/calendar.events.readonly',
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/userinfo.email',
          ].join(' '),
        })
      )
      .mockResolvedValueOnce(userInfoResponse('readonly-dj@example.com'));
    const inserts = trackInserts(['gmail-acct-id', 'calendar-acct-id']);
    trackUpdates();

    const { GET } = await import('@/app/api/connectors/google/callback/route');
    await GET(callbackRequest({ code: 'auth-code-123', state: validState }));

    expect(inserts).toHaveLength(2);
    expect(inserts[1].values).toMatchObject({
      provider: 'google_calendar',
      capabilities: { canRead: true, canWrite: false },
    });
  });

  it('persists AES-256-GCM encrypted tokens that are not plaintext and decrypt back to the original values', async () => {
    hoisted.mockEnv.PII_ENCRYPTION_KEY =
      'a-real-32-byte-plus-test-key-for-gcm-checks';
    const validState = signGoogleOAuthState({
      userId: 'db-user-1',
      returnTo: '/app/settings/connectors',
    });
    hoisted.serverFetchMock
      .mockResolvedValueOnce(
        tokenResponse({
          access_token: 'ya29.super-secret-access-token',
          refresh_token: undefined, // keep this test to 2 real KDF calls
        })
      )
      .mockResolvedValueOnce(userInfoResponse('encrypted-dj@example.com'));
    trackInserts(['gmail-acct-id', 'calendar-acct-id']);
    const updates = trackUpdates();

    const { GET } = await import('@/app/api/connectors/google/callback/route');
    const response = await GET(
      callbackRequest({ code: 'auth-code-123', state: validState })
    );

    expect(response.headers.get('location')).toBe(
      'http://localhost/app/settings/connectors?connected=google'
    );
    expect(updates).toHaveLength(2);

    for (const update of updates) {
      const encrypted = update.set.encryptedAccessToken as string;
      expect(encrypted).toBeTruthy();
      expect(encrypted).not.toBe('ya29.super-secret-access-token');
      // AES-256-GCM combined format: iv:authTag:ciphertext.
      expect(encrypted.split(':')).toHaveLength(3);
    }

    // The two stored ciphertexts must differ (random IV per encryption) even
    // though both accounts were granted the identical access token.
    expect(updates[0].set.encryptedAccessToken).not.toBe(
      updates[1].set.encryptedAccessToken
    );

    // Round-trip through the REAL decryptPII to prove this is genuine
    // AES-256-GCM, not a base64/no-op stand-in.
    expect(decryptPII(updates[0].set.encryptedAccessToken as string)).toBe(
      'ya29.super-secret-access-token'
    );
    expect(updates[0].set.encryptedRefreshToken).toBeNull();
  }, 15_000);
});
