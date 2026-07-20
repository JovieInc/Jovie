import { type BetterAuthOptions, resolveBaseURL } from 'better-auth';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  betterAuth: vi.fn((options: BetterAuthOptions) => ({ options })),
  provisionAppUser: vi.fn().mockResolvedValue('app-user-id'),
  captureError: vi.fn().mockResolvedValue(undefined),
  loggerError: vi.fn(),
  env: {
    E2E_TEST_MODE: '0',
    VERCEL_ENV: 'preview',
    VERCEL_URL: 'jovie-preview-abc.vercel.app',
    VERCEL_BRANCH_URL: 'jovie-git-auth-jovie.vercel.app',
    BETTER_AUTH_URL: 'https://staging.jov.ie',
    BETTER_AUTH_SECRET: 'unit-test-secret',
  } as Record<string, string | undefined>,
}));

vi.mock('server-only', () => ({}));
vi.mock('@better-auth/oauth-provider', () => ({
  oauthProvider: vi.fn(() => ({ id: 'oauth-provider' })),
}));
vi.mock('better-auth', async importOriginal => ({
  ...(await importOriginal<typeof import('better-auth')>()),
  betterAuth: mocks.betterAuth,
}));
vi.mock('better-auth/adapters/drizzle', () => ({
  drizzleAdapter: vi.fn(() => ({ id: 'drizzle-adapter' })),
}));
vi.mock('better-auth/next-js', () => ({
  nextCookies: vi.fn(() => ({ id: 'next-cookies' })),
}));
vi.mock('better-auth/plugins', () => ({
  bearer: vi.fn(() => ({ id: 'bearer' })),
  emailOTP: vi.fn(() => ({ id: 'email-otp' })),
  jwt: vi.fn(() => ({ id: 'jwt' })),
  oneTap: vi.fn(() => ({ id: 'one-tap' })),
  oneTimeToken: vi.fn(() => ({ id: 'one-time-token' })),
}));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/db/schema/better-auth', () => ({
  baAccounts: {},
  baJwks: {},
  baOauthAccessTokens: {},
  baOauthClients: {},
  baOauthConsents: {},
  baOauthRefreshTokens: {},
  baSessions: {},
  baUsers: {},
  baVerifications: {},
}));
vi.mock('@/lib/env', () => ({ env: mocks.env }));
vi.mock('@/lib/env-public', () => ({ publicEnv: {} }));
vi.mock('@/lib/error-tracking', () => ({
  captureError: mocks.captureError,
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { error: mocks.loggerError },
}));
vi.mock('@/lib/auth/apple-client-secret', () => ({
  generateAppleClientSecret: vi.fn(() => 'apple-secret'),
}));
vi.mock('@/lib/auth/provision', () => ({
  provisionAppUser: mocks.provisionAppUser,
}));
vi.mock('@/lib/auth/rate-limit-rules', () => ({
  AUTH_RATE_LIMIT_RULES: {},
  isDeterministicTestOtpEmail: () => false,
}));
vi.mock('@/lib/auth/secondary-storage', () => ({
  secondaryStorage: {},
}));

await import('@/lib/auth/better-auth');

function getUserCreatedHook() {
  const options = mocks.betterAuth.mock.calls[0]?.[0];
  const hook = options?.databaseHooks?.user?.create?.after;
  expect(hook).toBeTypeOf('function');
  return hook!;
}

function getOptions() {
  const options = mocks.betterAuth.mock.calls[0]?.[0];
  expect(options).toBeDefined();
  return options!;
}

describe('Better Auth base URL', () => {
  it('derives request-specific URLs from exact trusted hosts', () => {
    expect(getOptions().baseURL).toEqual({
      allowedHosts: [
        'jov.ie',
        'www.jov.ie',
        'staging.jov.ie',
        'localhost:3100',
        'jovie-preview-abc.vercel.app',
        'jovie-git-auth-jovie.vercel.app',
      ],
      protocol: 'https',
    });
  });

  it('does not freeze the server to BETTER_AUTH_URL', () => {
    expect(getOptions().baseURL).not.toBe('https://staging.jov.ie');
  });

  it.each([
    'jovie-preview-abc.vercel.app',
    'jovie-git-auth-jovie.vercel.app',
  ])('resolves requests on the exact allowed host %s', host => {
    expect(
      resolveBaseURL(
        getOptions().baseURL,
        '/api/auth',
        new Request(`https://${host}/identity`),
        false
      )
    ).toBe(`https://${host}/api/auth`);
  });

  it('rejects requests on an unrelated Vercel host', () => {
    expect(() =>
      resolveBaseURL(
        getOptions().baseURL,
        '/api/auth',
        new Request('https://attacker-project.vercel.app/identity'),
        false
      )
    ).toThrow(/not in the allowed hosts list/i);
  });

  it('rejects a spoofed forwarded host', () => {
    expect(() =>
      resolveBaseURL(
        getOptions().baseURL,
        '/api/auth',
        new Request('https://jovie-preview-abc.vercel.app/identity', {
          headers: { 'x-forwarded-host': 'attacker-project.vercel.app' },
        }),
        false,
        true
      )
    ).toThrow(/not in the allowed hosts list/i);
  });

  it('uses the configured HTTP loopback URL in local production-mode CI', async () => {
    mocks.env.VERCEL_ENV = undefined;
    mocks.env.NODE_ENV = 'production';
    mocks.env.VERCEL_URL = undefined;
    mocks.env.VERCEL_BRANCH_URL = undefined;
    mocks.env.BETTER_AUTH_URL = 'http://127.0.0.1:3260';
    mocks.betterAuth.mockClear();
    vi.resetModules();

    await import('@/lib/auth/better-auth');

    expect(getOptions().baseURL).toEqual({
      allowedHosts: [
        'jov.ie',
        'www.jov.ie',
        'staging.jov.ie',
        'localhost:3100',
        '127.0.0.1:3260',
      ],
      protocol: 'http',
    });

    expect(
      resolveBaseURL(
        getOptions().baseURL,
        '/api/auth',
        new Request('http://127.0.0.1:3260/identity'),
        false
      )
    ).toBe('http://127.0.0.1:3260/api/auth');
  });
});

describe('Better Auth app-user provisioning hook', () => {
  beforeEach(() => {
    mocks.provisionAppUser.mockReset().mockResolvedValue('app-user-id');
    mocks.captureError.mockClear();
    mocks.loggerError.mockClear();
  });

  it('provisions the canonical app user after Better Auth creates an identity', async () => {
    await getUserCreatedHook()(
      {
        id: 'ba-user-123',
        email: 'artist@example.com',
        emailVerified: true,
        name: 'Artist',
        image: null,
        createdAt: new Date('2026-07-15T00:00:00Z'),
        updatedAt: new Date('2026-07-15T00:00:00Z'),
      },
      null
    );

    expect(mocks.provisionAppUser).toHaveBeenCalledExactlyOnceWith({
      betterAuthUserId: 'ba-user-123',
      email: 'artist@example.com',
      emailVerified: true,
      name: 'Artist',
    });
  });

  it('keeps signup fail-open and records an unexpected hook rejection', async () => {
    const error = new Error('provisioning rejected');
    mocks.provisionAppUser.mockRejectedValueOnce(error);

    await expect(
      getUserCreatedHook()(
        {
          id: 'ba-user-456',
          email: 'artist2@example.com',
          emailVerified: false,
          name: null,
          image: null,
          createdAt: new Date('2026-07-15T00:00:00Z'),
          updatedAt: new Date('2026-07-15T00:00:00Z'),
        },
        null
      )
    ).resolves.toBeUndefined();

    expect(mocks.loggerError).toHaveBeenCalledWith(
      '[auth] provision hook failed',
      error
    );
    expect(mocks.captureError).toHaveBeenCalledWith(
      'Better Auth provision hook failed',
      error,
      {
        betterAuthUserId: 'ba-user-456',
        operation: 'databaseHooks.user.create.after',
      }
    );
  });

  it('keeps signup fail-open when failure telemetry also rejects', async () => {
    const provisioningError = new Error('provisioning rejected');
    const telemetryError = new Error('telemetry unavailable');
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    mocks.provisionAppUser.mockRejectedValueOnce(provisioningError);
    mocks.captureError.mockRejectedValueOnce(telemetryError);

    await expect(
      getUserCreatedHook()(
        {
          id: 'ba-user-telemetry-failure',
          email: 'artist3@example.com',
          emailVerified: false,
          name: null,
          image: null,
          createdAt: new Date('2026-07-15T00:00:00Z'),
          updatedAt: new Date('2026-07-15T00:00:00Z'),
        },
        null
      )
    ).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalledWith(
      '[auth] provision hook telemetry failed',
      telemetryError
    );
    consoleError.mockRestore();
  });
});
