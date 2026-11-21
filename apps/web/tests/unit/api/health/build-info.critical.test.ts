import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockRecordShippedFixDeploys = vi.hoisted(() =>
  vi.fn(() => Promise.resolve())
);

vi.mock('@/lib/recovery/probes.server', () => ({
  recordShippedFixDeploys: mockRecordShippedFixDeploys,
}));

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

  it('never touches the recovery/DB hooks on the request path (JOV-12766)', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const { GET } = await import('@/app/api/health/build-info/route');
    const response = await GET();
    expect(response.status).toBe(200);

    // The public identity receipt is read by monitors on every probe; its
    // request path must not kick off database work (the recovery deploy-time
    // stamp runs from the instrumentation boot hook instead).
    expect(mockRecordShippedFixDeploys).not.toHaveBeenCalled();
  });

  it('logs warning and returns fallback when build info read fails in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const { GET } = await import('@/app/api/health/build-info/route');
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.buildId).toBe('unknown');
    expect(mockConsoleWarn).toHaveBeenCalledWith(
      '[build-info] BUILD_ID not found — using fallback'
    );
  });

  it('prefers build-time commit sha when available in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_BUILD_SHA', 'a'.repeat(40));
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'b'.repeat(40));

    const { GET } = await import('@/app/api/health/build-info/route');
    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.commitSha).toBe('a'.repeat(40));
  });

  it('falls back to GITHUB_SHA on standalone GitHub-hosted servers', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_BUILD_SHA', '');
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', '');
    vi.stubEnv('GITHUB_SHA', 'c'.repeat(40));

    const { GET } = await import('@/app/api/health/build-info/route');
    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.commitSha).toBe('c'.repeat(40));
  });

  it('publishes the immutable Vercel deployment identity', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_DEPLOYMENT_ID', 'dpl_exactStaging123');

    const { GET } = await import('@/app/api/health/build-info/route');
    const body = await (await GET()).json();

    expect(body.deploymentId).toBe('dpl_exactStaging123');
  });

  it('does not publish an abbreviated commit as exact production identity', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_BUILD_SHA', 'abcdef1');
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', '');
    // GITHUB_SHA is genuinely set on hosted runners; exclude it so this case
    // measures only the abbreviated build-time value.
    vi.stubEnv('GITHUB_SHA', '');

    const { GET } = await import('@/app/api/health/build-info/route');
    const body = await (await GET()).json();

    expect(body.commitSha).toBeUndefined();
  });

  it('marks build info as no-store at browser and CDN layers (JOV-1958)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_BUILD_SHA', 'abcdef1');

    const { BUILD_INFO_CACHE_HEADERS, GET } = await import(
      '@/app/api/health/build-info/route'
    );
    const response = await GET();

    expect(response.headers.get('cache-control')).toBe(
      BUILD_INFO_CACHE_HEADERS['cache-control']
    );
    expect(response.headers.get('cdn-cache-control')).toBe('no-store');
    expect(response.headers.get('vercel-cdn-cache-control')).toBe('no-store');
    expect(response.headers.get('pragma')).toBe('no-cache');
    expect(response.headers.get('expires')).toBe('0');
    // Must never advertise a positive shared cache lifetime.
    expect(response.headers.get('cache-control')).not.toMatch(/s-maxage=\d+/);
    expect(response.headers.get('cache-control')).not.toMatch(/max-age=[1-9]/);
  });

  it('returns development build id without warning in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    const { GET } = await import('@/app/api/health/build-info/route');
    const response = await GET();
    expect(response.status).toBe(200);
    expect(mockConsoleWarn).not.toHaveBeenCalled();

    const body = await response.json();
    expect(body.buildId).toBe('development');
  });

  it('returns the build-time app version instead of the 0.0.0 fallback (JOV-3459)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '26.6.61');

    const { GET } = await import('@/app/api/health/build-info/route');
    const response = await GET();
    const body = await response.json();

    expect(body.version).toBe('26.6.61');
    expect(body.version).not.toBe('0.0.0');
  });

  it('falls back to bundled version.json when env version is empty (JOV-3459)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '');

    const { GET } = await import('@/app/api/health/build-info/route');
    const response = await GET();
    const body = await response.json();

    expect(body.version).not.toBe('0.0.0');
    expect(body.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('falls back to bundled version.json when env version is the placeholder', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '0.0.0');

    const { GET } = await import('@/app/api/health/build-info/route');
    const response = await GET();
    const body = await response.json();

    expect(body.version).not.toBe('0.0.0');
    expect(body.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('does not report the request time as deployedAt (JOV-8658)', async () => {
    const requestNow = 1_700_000_000_000;
    const laterRequestNow = 1_700_000_000_500;
    const now = vi.spyOn(Date, 'now');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_DEPLOYMENT_TIME', '');
    vi.stubEnv('JOVIE_BUILD_DEPLOYED_AT', '');

    try {
      const { GET } = await import('@/app/api/health/build-info/route');
      now.mockReturnValue(requestNow);
      const first = await (await GET()).json();
      now.mockReturnValue(laterRequestNow);
      const second = await (await GET()).json();

      expect(first.deployedAt).not.toBe(requestNow);
      expect(second.deployedAt).not.toBe(laterRequestNow);
      expect(first.deployedAt).toBe(second.deployedAt);
      expect(first.deployedAt).toBeNull();
    } finally {
      now.mockRestore();
    }
  });

  it('returns an explicit deploy stamp instead of the request clock (JOV-8658)', async () => {
    const requestNow = 1_700_000_000_000;
    const buildStamp = 1_762_000_000_000;
    const now = vi.spyOn(Date, 'now').mockReturnValue(requestNow);
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_DEPLOYMENT_TIME', '');
    vi.stubEnv('JOVIE_BUILD_DEPLOYED_AT', String(buildStamp));

    try {
      const { GET } = await import('@/app/api/health/build-info/route');
      const body = await (await GET()).json();

      expect(body.deployedAt).toBe(buildStamp);
      expect(body.deployedAt).not.toBe(requestNow);
    } finally {
      now.mockRestore();
    }
  });

  it('keeps Date.now out of the build-info request path (JOV-8658)', () => {
    const source = readFileSync(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        '../../../../lib/observability/build-info.ts'
      ),
      'utf8'
    );
    expect(source).not.toMatch(/Date\.now\s*\(/);
  });
});
