import { createHash } from 'node:crypto';
import { oauthProvider } from '@better-auth/oauth-provider';
import {
  type BetterAuthPlugin,
  betterAuth,
  type OAuthProvider,
} from 'better-auth';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { oauthProviderErrorReturn } from './oauth-provider-error-return';

const ORIGIN = 'https://auth.test';
const AUTH_BASE = `${ORIGIN}/api/auth`;
const CLIENT_ID = 'logyourbody-ios';
const REDIRECT_URI = 'ie.jov.jovie://auth/complete';
const CALLER_ERROR_REDIRECT = 'ie.jov.jovie://auth/caller-controlled-error';
const OUTER_STATE = 'ios-outer-state';
const CODE_VERIFIER = 'v'.repeat(64);
const CODE_CHALLENGE = createHash('sha256')
  .update(CODE_VERIFIER)
  .digest('base64url');

type ClientMutation = 'deleted' | 'disabled';

type Harness = Awaited<ReturnType<typeof createHarness>>;

function cookieFrom(response: Response): string {
  const setCookie = response.headers.get('set-cookie');
  if (!setCookie) throw new Error('Expected OAuth state cookie');
  return setCookie.split(';', 1)[0] ?? '';
}

function locationFrom(response: Response): URL {
  const location = response.headers.get('location');
  if (!location) throw new Error('Expected redirect Location');
  return new URL(location, AUTH_BASE);
}

function fakeApplePlugin(
  validateAuthorizationCode: OAuthProvider['validateAuthorizationCode']
): BetterAuthPlugin {
  const provider: OAuthProvider = {
    id: 'apple',
    name: 'Fake Apple',
    createAuthorizationURL: ({ state }) => {
      const url = new URL('https://apple.test/authorize');
      url.searchParams.set('state', state);
      return url;
    },
    validateAuthorizationCode,
    getUserInfo: async () => ({
      user: {
        id: 'apple-user-1',
        name: 'Test User',
        email: 'oauth-return@example.com',
        emailVerified: true,
      },
      data: {},
    }),
  };

  return {
    id: 'fake-apple-provider',
    init: _context => ({
      context: { socialProviders: [provider] },
    }),
  };
}

async function createHarness() {
  const validateAuthorizationCode = vi.fn(
    async ({ code }: { code: string }) => {
      if (code !== 'valid-apple-code') {
        throw new Error('provider token exchange detail');
      }
      return {};
    }
  );

  const auth = betterAuth({
    baseURL: ORIGIN,
    secret: 'better-auth-test-secret-at-least-thirty-two-characters',
    account: { storeAccountCookie: false },
    session: { cookieCache: { enabled: false } },
    logger: { disabled: true },
    rateLimit: { enabled: false },
    telemetry: { enabled: false },
    plugins: [
      oauthProvider({
        loginPage: '/identity',
        consentPage: '/identity',
        signup: { page: '/identity' },
        scopes: ['openid', 'profile', 'email', 'offline_access'],
        grantTypes: ['authorization_code', 'refresh_token'],
        disableJwtPlugin: true,
        allowDynamicClientRegistration: false,
        allowUnauthenticatedClientRegistration: false,
        storeTokens: 'hashed',
      }) as BetterAuthPlugin,
      oauthProviderErrorReturn(),
      fakeApplePlugin(validateAuthorizationCode),
    ],
  });

  const context = await auth.$context;
  await context.adapter.create({
    model: 'oauthClient',
    data: {
      clientId: CLIENT_ID,
      disabled: false,
      skipConsent: true,
      scopes: ['openid', 'profile', 'email', 'offline_access'],
      redirectUris: [REDIRECT_URI],
      tokenEndpointAuthMethod: 'none',
      grantTypes: ['authorization_code', 'refresh_token'],
      responseTypes: ['code'],
      public: true,
      type: 'native',
      requirePKCE: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  return { auth, context, validateAuthorizationCode };
}

async function beginAuthorization(
  harness: Harness,
  additionalData: Record<string, unknown> = {}
) {
  const authorizeURL = new URL(`${AUTH_BASE}/oauth2/authorize`);
  authorizeURL.searchParams.set('response_type', 'code');
  authorizeURL.searchParams.set('client_id', CLIENT_ID);
  authorizeURL.searchParams.set('redirect_uri', REDIRECT_URI);
  authorizeURL.searchParams.set('scope', 'openid profile email offline_access');
  authorizeURL.searchParams.set('state', OUTER_STATE);
  authorizeURL.searchParams.set('code_challenge', CODE_CHALLENGE);
  authorizeURL.searchParams.set('code_challenge_method', 'S256');

  const authorizeResponse = await harness.auth.handler(
    new Request(authorizeURL)
  );
  expect(authorizeResponse.status).toBe(302);
  const identityURL = locationFrom(authorizeResponse);
  expect(identityURL.pathname).toBe('/identity');

  const signInResponse = await harness.auth.handler(
    new Request(`${AUTH_BASE}/sign-in/social`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'apple',
        oauth_query: identityURL.searchParams.toString(),
        errorCallbackURL: CALLER_ERROR_REDIRECT,
        additionalData,
      }),
    })
  );
  expect(signInResponse.status).toBe(200);
  const signInBody = (await signInResponse.json()) as { url: string };
  const providerURL = new URL(signInBody.url);
  const innerState = providerURL.searchParams.get('state');
  if (!innerState) throw new Error('Expected Better Auth provider state');

  return {
    cookie: cookieFrom(signInResponse),
    innerState,
  };
}

async function callback(
  harness: Harness,
  flow: Awaited<ReturnType<typeof beginAuthorization>>,
  params: Record<string, string>
): Promise<Response> {
  const url = new URL(`${AUTH_BASE}/callback/apple`);
  for (const [key, value] of Object.entries({
    ...params,
    state: flow.innerState,
  })) {
    url.searchParams.set(key, value);
  }
  return harness.auth.handler(
    new Request(url, {
      headers: {
        accept: 'text/html',
        cookie: flow.cookie,
        'sec-fetch-mode': 'navigate',
      },
    })
  );
}

async function expectNoSessionOrAuthorizationCode(harness: Harness) {
  const [sessions, verifications] = await Promise.all([
    harness.context.adapter.findMany({ model: 'session' }),
    harness.context.adapter.findMany({ model: 'verification' }),
  ]);
  expect(sessions).toHaveLength(0);
  expect(verifications).toHaveLength(0);
}

function expectSafeNativeError(response: Response, error: string) {
  expect(response.status).toBe(302);
  const location = locationFrom(response);
  expect(location.protocol).toBe('ie.jov.jovie:');
  expect(location.host).toBe('auth');
  expect(location.pathname).toBe('/complete');
  expect(location.searchParams.get('error')).toBe(error);
  expect(location.searchParams.get('state')).toBe(OUTER_STATE);
  expect(location.searchParams.get('iss')).toBe(AUTH_BASE);
  expect(location.searchParams.has('error_description')).toBe(false);
  expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
}

afterEach(() => {
  vi.useRealTimers();
});

describe('oauthProviderErrorReturn', () => {
  it('preserves the real OAuth-provider success flow and PKCE exchange', async () => {
    const harness = await createHarness();
    const flow = await beginAuthorization(harness);

    const success = await callback(harness, flow, {
      code: 'valid-apple-code',
    });
    const redirect = locationFrom(success);
    expect(redirect.protocol, redirect.toString()).toBe('ie.jov.jovie:');
    expect(redirect.searchParams.get('state')).toBe(OUTER_STATE);
    expect(redirect.searchParams.get('iss')).toBe(AUTH_BASE);
    expect(redirect.searchParams.has('error')).toBe(false);
    const code = redirect.searchParams.get('code');
    expect(code).toBeTruthy();

    const tokenResponse = await harness.auth.handler(
      new Request(`${AUTH_BASE}/oauth2/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: CLIENT_ID,
          code: code ?? '',
          code_verifier: CODE_VERIFIER,
          redirect_uri: REDIRECT_URI,
        }),
      })
    );
    expect(tokenResponse.status).toBe(200);
    await expect(tokenResponse.json()).resolves.toMatchObject({
      token_type: 'Bearer',
      scope: 'openid profile email offline_access',
    });
  });

  it('returns GET denial to iOS without provider-controlled detail', async () => {
    const harness = await createHarness();
    const flow = await beginAuthorization(harness, {
      query:
        'client_id=evil&redirect_uri=https%3A%2F%2Fevil.test%2Fsteal&response_type=code&code_challenge=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA&code_challenge_method=S256&state=evil',
      jovieOAuthProviderReturn: {
        version: 1,
        expiresAt: Number.MAX_SAFE_INTEGER,
        issuer: 'https://evil.test',
      },
    });

    const denied = await callback(harness, flow, {
      error: 'access_denied',
      error_description: 'private provider diagnostic',
    });

    expectSafeNativeError(denied, 'access_denied');
    expect(denied.headers.get('location')).not.toContain('evil.test');
    expect(denied.headers.get('location')).not.toContain('diagnostic');
    await expectNoSessionOrAuthorizationCode(harness);
  });

  it('returns form_post denial through the built-in GET normalization', async () => {
    const harness = await createHarness();
    const flow = await beginAuthorization(harness);
    const formPost = await harness.auth.handler(
      new Request(`${AUTH_BASE}/callback/apple`, {
        method: 'POST',
        headers: {
          cookie: flow.cookie,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          error: 'access_denied',
          error_description: 'private provider diagnostic',
          state: flow.innerState,
        }),
      })
    );

    expect(formPost.status).toBe(302);
    expect(locationFrom(formPost).pathname).toBe('/api/auth/callback/apple');
    const normalized = await harness.auth.handler(
      new Request(locationFrom(formPost), {
        headers: { cookie: flow.cookie },
      })
    );
    expectSafeNativeError(normalized, 'access_denied');
    await expectNoSessionOrAuthorizationCode(harness);
  });

  it('collapses an invalid provider code to server_error', async () => {
    const harness = await createHarness();
    const flow = await beginAuthorization(harness);

    const failed = await callback(harness, flow, { code: 'invalid-code' });

    expectSafeNativeError(failed, 'server_error');
    expect(failed.headers.get('location')).not.toContain('invalid_code');
    expect(failed.headers.get('location')).not.toContain('provider');
    await expectNoSessionOrAuthorizationCode(harness);
  });

  it('fails closed when Better Auth state is tampered with', async () => {
    const harness = await createHarness();
    const flow = await beginAuthorization(harness);
    flow.innerState = `${flow.innerState}-tampered`;

    const failed = await callback(harness, flow, {
      error: 'access_denied',
    });

    expect(locationFrom(failed).origin).toBe(ORIGIN);
    expect(locationFrom(failed).pathname).toBe('/api/auth/error');
    await expectNoSessionOrAuthorizationCode(harness);
  });

  it('fails closed when Better Auth state is expired', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-19T12:00:00Z'));
    const harness = await createHarness();
    const flow = await beginAuthorization(harness);
    vi.advanceTimersByTime(11 * 60 * 1000);

    const failed = await callback(harness, flow, {
      error: 'access_denied',
    });

    expect(locationFrom(failed).origin).toBe(ORIGIN);
    expect(locationFrom(failed).pathname).toBe('/api/auth/error');
    await expectNoSessionOrAuthorizationCode(harness);
  });

  it.each<ClientMutation>([
    'deleted',
    'disabled',
  ])('fails closed when the OAuth client is %s after login starts', async mutation => {
    const harness = await createHarness();
    const flow = await beginAuthorization(harness);
    const where = [{ field: 'clientId', value: CLIENT_ID }];
    if (mutation === 'deleted') {
      await harness.context.adapter.deleteMany({
        model: 'oauthClient',
        where,
      });
    } else {
      await harness.context.adapter.update({
        model: 'oauthClient',
        where,
        update: { disabled: true },
      });
    }

    const failed = await callback(harness, flow, {
      error: 'access_denied',
    });

    expect(locationFrom(failed).origin).toBe(ORIGIN);
    expect(locationFrom(failed).pathname).toBe('/api/auth/error');
    await expectNoSessionOrAuthorizationCode(harness);
  });

  it('fails closed when the exact registered redirect changes', async () => {
    const harness = await createHarness();
    const flow = await beginAuthorization(harness);
    await harness.context.adapter.update({
      model: 'oauthClient',
      where: [{ field: 'clientId', value: CLIENT_ID }],
      update: { redirectUris: ['ie.jov.jovie://auth/other'] },
    });

    const failed = await callback(harness, flow, {
      error: 'access_denied',
    });

    expect(locationFrom(failed).origin).toBe(ORIGIN);
    expect(locationFrom(failed).pathname).toBe('/api/auth/error');
    await expectNoSessionOrAuthorizationCode(harness);
  });
});
