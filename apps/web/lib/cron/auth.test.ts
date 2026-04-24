import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('verifyCronRequest', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns null for a valid bearer token', async () => {
    vi.stubEnv('CRON_SECRET', 'test-secret');

    const { verifyCronRequest } = await import('@/lib/cron/auth');

    const result = verifyCronRequest(
      new Request('https://example.com/api/cron/test', {
        headers: { Authorization: 'Bearer test-secret' },
      }),
      { route: '/api/cron/test' }
    );

    expect(result).toBeNull();
  });

  it('returns 401 for an invalid bearer token', async () => {
    vi.stubEnv('CRON_SECRET', 'test-secret');

    const { verifyCronRequest } = await import('@/lib/cron/auth');

    const result = verifyCronRequest(
      new Request('https://example.com/api/cron/test', {
        headers: { Authorization: 'Bearer wrong-secret' },
      }),
      { route: '/api/cron/test' }
    );

    expect(result?.status).toBe(401);
  });

  it('returns 500 when the cron secret is missing', async () => {
    vi.stubEnv('CRON_SECRET', '');

    const { verifyCronRequest } = await import('@/lib/cron/auth');

    const result = verifyCronRequest(
      new Request('https://example.com/api/cron/test'),
      { route: '/api/cron/test' }
    );

    expect(result?.status).toBe(500);
  });

  it('rejects untrusted origins when required', async () => {
    vi.stubEnv('CRON_SECRET', 'test-secret');
    vi.stubEnv('NODE_ENV', 'production');

    const { verifyCronRequest } = await import('@/lib/cron/auth');

    const result = verifyCronRequest(
      new Request('https://example.com/api/cron/test', {
        headers: { Authorization: 'Bearer test-secret' },
      }),
      {
        route: '/api/cron/test',
        requireTrustedOrigin: true,
      }
    );

    expect(result?.status).toBe(403);
  });

  it('allows development bypass when explicitly enabled', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    const { verifyCronRequest } = await import('@/lib/cron/auth');

    const result = verifyCronRequest(
      new Request('https://example.com/api/cron/test'),
      {
        route: '/api/cron/test',
        allowDevelopmentBypass: true,
      }
    );

    expect(result).toBeNull();
  });
});

describe('verifyTrustedCronOrigin', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('trusts the current Vercel deployment host', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_URL', 'jovie-prod-123.vercel.app');

    const { verifyTrustedCronOrigin } = await import('@/lib/cron/auth');

    const trusted = verifyTrustedCronOrigin(
      new Request('https://example.com/api/cron/test', {
        headers: { 'x-forwarded-host': 'jovie-prod-123.vercel.app' },
      })
    );

    expect(trusted).toBe(true);
  });

  it('rejects spoofed x-vercel-cron headers without a trusted host', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_URL', 'jovie-prod-123.vercel.app');

    const { verifyTrustedCronOrigin } = await import('@/lib/cron/auth');

    const trusted = verifyTrustedCronOrigin(
      new Request('https://example.com/api/cron/test', {
        headers: {
          'x-vercel-cron': '1',
          'x-forwarded-host': 'attacker-project.vercel.app',
        },
      })
    );

    expect(trusted).toBe(false);
  });

  it('trusts production and staging jov.ie forwarded hosts', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const { verifyTrustedCronOrigin } = await import('@/lib/cron/auth');

    for (const host of ['jov.ie', 'www.jov.ie', 'staging.jov.ie']) {
      expect(
        verifyTrustedCronOrigin(
          new Request('https://example.com/api/cron/test', {
            headers: { 'x-forwarded-host': host },
          })
        )
      ).toBe(true);
    }
  });

  it('rejects attacker-controlled *.vercel.app forwarded hosts in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const { verifyTrustedCronOrigin } = await import('@/lib/cron/auth');

    for (const host of [
      'attacker-project.vercel.app',
      'some-random-preview.vercel.app',
      'jov-ie-lookalike.vercel.app',
    ]) {
      expect(
        verifyTrustedCronOrigin(
          new Request('https://example.com/api/cron/test', {
            headers: { 'x-forwarded-host': host },
          })
        )
      ).toBe(false);
    }
  });

  it('rejects spoofed jov.ie-lookalike forwarded hosts', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const { verifyTrustedCronOrigin } = await import('@/lib/cron/auth');

    for (const host of [
      'jov.ie.evil.com',
      'not-jov.ie',
      'evil.com',
      'fakejov.ie',
    ]) {
      expect(
        verifyTrustedCronOrigin(
          new Request('https://example.com/api/cron/test', {
            headers: { 'x-forwarded-host': host },
          })
        )
      ).toBe(false);
    }
  });

  it('honors CRON_TRUSTED_HOSTS allowlist for Jovie-owned previews', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv(
      'CRON_TRUSTED_HOSTS',
      'jovie-preview-abc.vercel.app, jovie-preview-xyz.vercel.app'
    );

    const { verifyTrustedCronOrigin } = await import('@/lib/cron/auth');

    expect(
      verifyTrustedCronOrigin(
        new Request('https://example.com/api/cron/test', {
          headers: { 'x-forwarded-host': 'jovie-preview-abc.vercel.app' },
        })
      )
    ).toBe(true);

    expect(
      verifyTrustedCronOrigin(
        new Request('https://example.com/api/cron/test', {
          headers: { 'x-forwarded-host': 'attacker-project.vercel.app' },
        })
      )
    ).toBe(false);
  });

  it('ignores ports and proxy chains when matching hosts', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const { verifyTrustedCronOrigin } = await import('@/lib/cron/auth');

    expect(
      verifyTrustedCronOrigin(
        new Request('https://example.com/api/cron/test', {
          headers: { 'x-forwarded-host': 'jov.ie:443' },
        })
      )
    ).toBe(true);

    expect(
      verifyTrustedCronOrigin(
        new Request('https://example.com/api/cron/test', {
          headers: { 'x-forwarded-host': 'jov.ie, internal-proxy:8080' },
        })
      )
    ).toBe(true);

    expect(
      verifyTrustedCronOrigin(
        new Request('https://example.com/api/cron/test', {
          headers: {
            'x-forwarded-host': 'attacker.vercel.app, jov.ie',
          },
        })
      )
    ).toBe(false);
  });

  it('falls back to allowing development when no header matches', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    const { verifyTrustedCronOrigin } = await import('@/lib/cron/auth');

    expect(
      verifyTrustedCronOrigin(new Request('https://example.com/api/cron/test'))
    ).toBe(true);
  });
});
