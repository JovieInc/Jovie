import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  formatSignedInAuthProbeReport,
  formatSignedInAuthReport,
  hasAuthUnavailableCopy,
  probeSignedInAuthDeployment,
  resolveSignedInAuthHostname,
  verifySignedInAuthConfig,
} from '@/lib/readiness/signed-in-auth';

const ORIGINAL_ENV = { ...process.env };

describe('signed-in auth readiness', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL = 'https://jov.ie';
    process.env.BETTER_AUTH_SECRET = 'x'.repeat(40);
    process.env.SESSION_SECRET = 'session-secret-example';
    process.env.DATABASE_URL = 'postgres://example';
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('resolves target passthrough by target', () => {
    expect(resolveSignedInAuthHostname('local')).toBe('local');
    expect(resolveSignedInAuthHostname('stg')).toBe('stg');
    expect(resolveSignedInAuthHostname('prd')).toBe('prd');
  });

  it('passes production config when required keys are present', () => {
    const result = verifySignedInAuthConfig({
      env: process.env,
      target: 'prd',
      source: 'env',
    });

    expect(result.ok).toBe(true);
    expect(result.checks.some(check => check.id === 'better-auth-url')).toBe(
      true
    );
    expect(formatSignedInAuthReport(result)).toContain('status=passed');
  });

  it('fails production config when Better Auth URL is missing', () => {
    const result = verifySignedInAuthConfig({
      env: { ...process.env, NEXT_PUBLIC_BETTER_AUTH_URL: undefined },
      target: 'prd',
      source: 'env',
    });

    expect(result.ok).toBe(false);
    expect(
      result.checks.find(check => check.id === 'better-auth-url')?.status
    ).toBe('fail');
  });

  it('skips required env keys for local target', () => {
    const result = verifySignedInAuthConfig({
      env: {},
      target: 'local',
      source: 'env',
    });

    expect(
      result.checks.find(check => check.id === 'required-env-keys')?.status
    ).toBe('skip');
  });

  it('detects auth-unavailable copy', () => {
    expect(hasAuthUnavailableCopy('Authentication unavailable right now')).toBe(
      true
    );
    expect(hasAuthUnavailableCopy('Sign in to continue')).toBe(false);
  });
});

describe('signed-in auth deployment probe', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('reports healthy sign-in when test-auth session bootstraps', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input);
          if (url.includes('/api/dev/test-auth/session')) {
            return Promise.resolve(
              new Response(JSON.stringify({ userId: 'user_test_123' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              })
            );
          }

          return Promise.resolve(
            new Response('<html>Sign in</html>', {
              status: 200,
            })
          );
        })
    );

    const result = await probeSignedInAuthDeployment('http://localhost:3000');

    expect(result.ok).toBe(true);
    expect(result.testAuthSessionOk).toBe(true);
    expect(formatSignedInAuthProbeReport(result)).toContain('status=passed');
  });

  it('fails when sign-in page renders auth-unavailable copy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<html>Authentication unavailable</html>', {
          status: 200,
        })
      )
    );

    const result = await probeSignedInAuthDeployment('https://staging.jov.ie');

    expect(result.ok).toBe(false);
    expect(result.authUnavailable).toBe(true);
  });
});
