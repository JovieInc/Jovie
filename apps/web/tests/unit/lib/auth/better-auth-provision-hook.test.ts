import type { BetterAuthOptions } from 'better-auth';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  betterAuth: vi.fn((options: BetterAuthOptions) => ({ options })),
  provisionAppUser: vi.fn().mockResolvedValue('app-user-id'),
  captureError: vi.fn().mockResolvedValue(undefined),
  loggerError: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@better-auth/oauth-provider', () => ({
  oauthProvider: vi.fn(() => ({ id: 'oauth-provider' })),
}));
vi.mock('better-auth', () => ({ betterAuth: mocks.betterAuth }));
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
vi.mock('@/lib/env', () => ({
  env: {
    E2E_TEST_MODE: '0',
    VERCEL_ENV: 'preview',
    BETTER_AUTH_SECRET: 'unit-test-secret',
  },
}));
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
