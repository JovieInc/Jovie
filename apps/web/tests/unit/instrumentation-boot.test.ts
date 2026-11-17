import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/startup/db-host-guard', () => ({
  assertStagingDatabaseIsolation: vi.fn(),
}));
vi.mock('@/lib/music-resolver/musicfetch-gate', () => ({
  musicResolverCutoverReceipt: () => ({}),
}));
vi.mock('@/lib/observability/agnost', () => ({
  initAgnostTelemetry: vi.fn(),
}));

/**
 * JOV-12766: the shipped-fix deploy-time stamp moved off the public
 * /api/health/build-info request path (a monitor-read receipt must not touch
 * the database) onto the server boot hook. On Vercel a lambda boots only when
 * the new deployment first serves traffic, so boot is the release event; the
 * stamp itself is idempotent (setIfAbsent).
 *
 * The boot hook fires the stamp with a fetch to /api/internal/ovie/fix-deploy-stamp
 * instead of importing probes.server: instrumentation.ts is bundled into every
 * serverless function, and importing the recovery chain there traces the whole
 * database dependency graph into every function, which pushed auth/ios/complete
 * past Vercel's 250 MB uncompressed-function-size limit.
 */
describe('instrumentation boot: shipped-fix deploy stamp (JOV-12766)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.stubEnv('CI', 'true');
    vi.stubEnv('NODE_ENV', 'test');
  });

  it('stamps shipped fixes once on a production nodejs boot', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('CRON_SECRET', 'test-cron-secret');

    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}')));
    vi.stubGlobal('fetch', fetchMock);

    const { register } = await import('@/instrumentation');
    await register();

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toContain('/api/internal/ovie/fix-deploy-stamp');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      authorization: 'Bearer test-cron-secret',
    });
    expect(init.cache).toBe('no-store');
  });

  it('does not stamp outside production (preview/dev/CI boots)', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('CRON_SECRET', 'test-cron-secret');

    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}')));
    vi.stubGlobal('fetch', fetchMock);

    const { register } = await import('@/instrumentation');
    await register();
    // Flush the fire-and-forget boot chain before asserting.
    await new Promise(resolvePromise => setTimeout(resolvePromise, 0));
    await new Promise(resolvePromise => setTimeout(resolvePromise, 0));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips the stamp when the cron bearer secret is not configured', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('CRON_SECRET', '');

    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}')));
    vi.stubGlobal('fetch', fetchMock);

    const { register } = await import('@/instrumentation');
    await register();
    await new Promise(resolvePromise => setTimeout(resolvePromise, 0));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('instrumentation source contract: boot stays import-clean (JOV-12766)', () => {
  it('reaches the deploy stamp by fetch, never by importing the recovery/db chain', () => {
    const source = readFileSync(
      resolve(__dirname, '../../instrumentation.ts'),
      'utf8'
    );

    // The stamp is fired over HTTP at the internal route...
    expect(source).toContain('/api/internal/ovie/fix-deploy-stamp');
    // ...and instrumentation must not trace the database dependency graph
    // into every serverless function (Vercel 250 MB uncompressed limit).
    expect(source).not.toMatch(/['"]@\/lib\/recovery\/probes\.server['"]/);
    expect(source).not.toMatch(/['"]@\/lib\/db['"]/);
    expect(source).not.toMatch(/['"]@\/lib\/db\//);
  });
});
