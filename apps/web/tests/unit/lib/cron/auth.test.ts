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
