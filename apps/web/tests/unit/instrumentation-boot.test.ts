import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRecordShippedFixDeploys = vi.hoisted(() => vi.fn());

vi.mock('@/lib/recovery/probes.server', () => ({
  recordShippedFixDeploys: mockRecordShippedFixDeploys,
}));
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
 */
describe('instrumentation boot: shipped-fix deploy stamp (JOV-12766)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv('CI', 'true');
    vi.stubEnv('NODE_ENV', 'test');
  });

  it('stamps shipped fixes once on a production nodejs boot', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('VERCEL_ENV', 'production');

    const { register } = await import('@/instrumentation');
    await register();
    await vi.waitFor(() => {
      expect(mockRecordShippedFixDeploys).toHaveBeenCalledTimes(1);
    });
  });

  it('does not stamp outside production (preview/dev/CI boots)', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('VERCEL_ENV', 'preview');

    const { register } = await import('@/instrumentation');
    await register();
    // Flush the fire-and-forget dynamic-import chain before asserting.
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(mockRecordShippedFixDeploys).not.toHaveBeenCalled();
  });
});
