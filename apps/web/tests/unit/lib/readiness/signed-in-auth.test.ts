import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOSTNAME } from '@/constants/domains';
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
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY =
      'pk_live_production_example';
    process.env.CLERK_SECRET_KEY = 'sk_live_production_example';
    process.env.SESSION_SECRET = 'session-secret-example';
    process.env.DATABASE_URL = 'postgres://example';
    delete process.env.CLERK_PUBLISHABLE_KEY_STAGING;
    delete process.env.CLERK_SECRET_KEY_STAGING;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('resolves hostnames by target', () => {
    expect(resolveSignedInAuthHostname('local')).toBe('localhost');
    expect(resolveSignedInAuthHostname('stg')).toBe(`staging.${HOSTNAME}`);
    expect(resolveSignedInAuthHostname('prd')).toBe(HOSTNAME);
  });

  it('passes production config when required keys and routing are healthy', () => {
    const result = verifySignedInAuthConfig({
      env: process.env,
      target: 'prd',
      source: 'env',
    });

    expect(result.ok).toBe(true);
    expect(result.checks.some(check => check.id === 'clerk-key-routing')).toBe(
      true
    );
    expect(formatSignedInAuthReport(result)).toContain('status=passed');
  });

  it('fails staging config when production keys would be inherited', () => {
    const result = verifySignedInAuthConfig({
      env: process.env,
      target: 'stg',
      source: 'env',
    });

    expect(result.ok).toBe(false);
    expect(
      result.checks.find(check => check.id === 'clerk-key-routing')?.status
    ).toBe('fail');
  });

  it('passes staging config when explicit staging Clerk keys are configured', () => {
    const result = verifySignedInAuthConfig({
      env: {
        ...process.env,
        CLERK_PUBLISHABLE_KEY_STAGING: 'pk_test_staging_example',
        CLERK_SECRET_KEY_STAGING: 'sk_test_staging_example',
      },
      target: 'stg',
      source: 'env',
    });

    expect(result.ok).toBe(true);
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

  it('reports healthy Clerk key routing from deployment headers', async () => {
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
              headers: {
                'x-clerk-key-status': 'ok',
              },
            })
          );
        })
    );

    const result = await probeSignedInAuthDeployment('http://localhost:3000');

    expect(result.ok).toBe(true);
    expect(result.clerkKeyStatus).toBe('ok');
    expect(result.testAuthSessionOk).toBe(true);
    expect(formatSignedInAuthProbeReport(result)).toContain('status=passed');
  });

  it('fails when sign-in page renders auth-unavailable copy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<html>Authentication unavailable</html>', {
          status: 200,
          headers: {
            'x-clerk-key-status': 'ok',
          },
        })
      )
    );

    const result = await probeSignedInAuthDeployment('https://staging.jov.ie');

    expect(result.ok).toBe(false);
    expect(result.authUnavailable).toBe(true);
  });
});
