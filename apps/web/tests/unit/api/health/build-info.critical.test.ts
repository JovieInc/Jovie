import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/env', () => ({
  env: new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (typeof prop !== 'string') return undefined;
        if (prop === 'NODE_ENV') return process.env.NODE_ENV ?? 'development';
        return process.env[prop];
      },
    }
  ),
}));

const mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
let cwdSpy: ReturnType<typeof vi.spyOn> | undefined;

describe('@critical GET /api/health/build-info', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs();
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/__missing-build-id__');
  });

  afterEach(() => {
    cwdSpy?.mockRestore();
    cwdSpy = undefined;
    vi.unstubAllEnvs();
  });

  it('logs warning and returns fallback when build info read fails in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const { GET } = await import('@/app/api/health/build-info/route');
    const response = GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.buildId).toBe('unknown');
    expect(mockConsoleWarn).toHaveBeenCalledWith(
      '[build-info] BUILD_ID not found — using fallback'
    );
  });

  it('prefers build-time commit sha when available in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_BUILD_SHA', 'abcdef1234567890');
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', '1234567890abcdef');

    const { GET } = await import('@/app/api/health/build-info/route');
    const response = GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.commitSha).toBe('abcdef1');
  });

  it('marks build info as no-store so desktop reload polling sees fresh deploys', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_BUILD_SHA', 'abcdef1');

    const { GET } = await import('@/app/api/health/build-info/route');
    const response = GET();

    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('returns development build id without warning in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    const { GET } = await import('@/app/api/health/build-info/route');
    const response = GET();
    expect(response.status).toBe(200);
    expect(mockConsoleWarn).not.toHaveBeenCalled();

    const body = await response.json();
    expect(body.buildId).toBe('development');
  });

  it('returns the build-time app version instead of the 0.0.0 fallback (JOV-3459)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '26.6.61');

    const { GET } = await import('@/app/api/health/build-info/route');
    const response = GET();
    const body = await response.json();

    expect(body.version).toBe('26.6.61');
    expect(body.version).not.toBe('0.0.0');
  });

  it('falls back to 0.0.0 only when no app version is configured', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '');

    const { GET } = await import('@/app/api/health/build-info/route');
    const response = GET();
    const body = await response.json();

    expect(body.version).toBe('0.0.0');
  });
});
