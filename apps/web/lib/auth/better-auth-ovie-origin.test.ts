import { type BetterAuthOptions, resolveBaseURL } from 'better-auth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('Better Auth independent Ovie origin integration', () => {
  beforeEach(() => {
    mocks.env.OVIE_WEB_ORIGIN = undefined;
    mocks.env.VERCEL_ENV = 'production';
    mocks.betterAuth.mockClear();
    vi.resetModules();
  });

  afterEach(() => {
    mocks.env.OVIE_WEB_ORIGIN = undefined;
  });

  it('opts in the private host without losing existing host or origin trust', async () => {
    mocks.env.OVIE_WEB_ORIGIN = 'https://ovie.example.test';
    const { resolveTrustedOrigins } = await import('./better-auth');
    const options = mocks.betterAuth.mock.calls[0]![0];
    expect(resolveTrustedOrigins()).toContain('https://ovie.example.test');
    expect(resolveTrustedOrigins()).toContain('https://jov.ie');
    expect(resolveTrustedOrigins()).not.toContain('https://other.example.test');
    expect(
      resolveBaseURL(
        options.baseURL,
        '/api/auth',
        new Request('https://ovie.example.test/sign-in'),
        false
      )
    ).toBe('https://ovie.example.test/api/auth');
    expect(
      resolveBaseURL(
        options.baseURL,
        '/api/auth',
        new Request('https://jov.ie/sign-in'),
        false
      )
    ).toBe('https://jov.ie/api/auth');
    expect(() =>
      resolveBaseURL(
        options.baseURL,
        '/api/auth',
        new Request('https://other.example.test/sign-in'),
        false
      )
    ).toThrow(/not in the allowed hosts list/i);
  });

  it('leaves private host trust disabled without configuration', async () => {
    const { resolveTrustedOrigins } = await import('./better-auth');
    const options = mocks.betterAuth.mock.calls[0]![0];
    expect(resolveTrustedOrigins()).not.toContain('https://ovie.example.test');
    expect(() =>
      resolveBaseURL(
        options.baseURL,
        '/api/auth',
        new Request('https://ovie.example.test/sign-in'),
        false
      )
    ).toThrow(/not in the allowed hosts list/i);
  });

  it('fails before creating auth when configured origin is unsafe', async () => {
    mocks.env.OVIE_WEB_ORIGIN = 'https://*.example.test';
    await expect(import('./better-auth')).rejects.toThrow('OVIE_WEB_ORIGIN');
    expect(mocks.betterAuth).not.toHaveBeenCalled();
  });
});
