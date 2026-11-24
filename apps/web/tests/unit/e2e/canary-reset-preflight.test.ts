import type { APIRequestContext } from '@playwright/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertCanaryResetSurfaceReady,
  CanaryResetRateLimitedError,
  type CanaryResetSurfacePreflight,
  classifyCanaryResetSurfaceProbe,
  resetClaimCanary,
} from '@/tests/e2e/helpers/canary-reset-client';

describe('classifyCanaryResetSurfaceProbe', () => {
  it('is ready when the surface Redis probe passes', () => {
    const verdict = classifyCanaryResetSurfaceProbe(
      200,
      JSON.stringify({ status: 'ok', latency: 12 })
    );
    expect(verdict.ready).toBe(true);
  });

  it('is not ready with the named preview-memory-store reason on a 503 not_configured', () => {
    const verdict = classifyCanaryResetSurfaceProbe(
      503,
      JSON.stringify({
        error: 'Redis is unavailable',
        failureKind: 'not_configured',
      })
    );
    expect(verdict.ready).toBe(false);
    if (!verdict.ready) {
      expect(verdict.detail).toContain('no Redis');
      expect(verdict.detail).toContain('JOV-9826');
    }
  });

  it('names the CRON_SECRET mismatch on a bearer rejection', () => {
    const verdict = classifyCanaryResetSurfaceProbe(
      401,
      JSON.stringify({ error: 'Unauthorized. Please sign in.' })
    );
    expect(verdict.ready).toBe(false);
    if (!verdict.ready) {
      expect(verdict.detail).toContain('CRON_SECRET');
    }
  });

  it('defers to the reset endpoint on builds predating the health route', () => {
    for (const status of [404, 405]) {
      const verdict: CanaryResetSurfacePreflight =
        classifyCanaryResetSurfaceProbe(status, '');
      expect(verdict.ready).toBe(true);
    }
  });

  it('fails closed with the status named on unexpected responses', () => {
    const verdict = classifyCanaryResetSurfaceProbe(500, 'boom');
    expect(verdict.ready).toBe(false);
    if (!verdict.ready) {
      expect(verdict.detail).toContain('500');
    }
  });
});

describe('assertCanaryResetSurfaceReady', () => {
  const previousSecret = process.env.CRON_SECRET;
  const previousBypass = process.env.PLAYWRIGHT_VERCEL_BYPASS_SECRET;

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousSecret;
    if (previousBypass === undefined) {
      delete process.env.PLAYWRIGHT_VERCEL_BYPASS_SECRET;
    } else {
      process.env.PLAYWRIGHT_VERCEL_BYPASS_SECRET = previousBypass;
    }
  });

  function mockRequest(status: number, body: string) {
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    // Test seam: only .get is exercised; cast to the full
    // APIRequestContext the helper's signature requires.
    const request = {
      get: async (url: string, init?: { headers?: Record<string, string> }) => {
        calls.push({ url, headers: init?.headers ?? {} });
        return { status: () => status, text: async () => body };
      },
    } as unknown as APIRequestContext;
    return {
      calls,
      request,
      origin: 'https://staging.jov.ie',
    };
  }

  it('sends the cron bearer (and bypass header when held) and returns the verdict when ready', async () => {
    process.env.CRON_SECRET = 'cron-secret-value';
    process.env.PLAYWRIGHT_VERCEL_BYPASS_SECRET = 'bypass-value';
    const probe = mockRequest(200, '{"status":"ok"}');
    const verdict = await assertCanaryResetSurfaceReady({
      request: probe.request,
      origin: probe.origin,
    });
    expect(verdict.ready).toBe(true);
    expect(probe.calls).toHaveLength(1);
    expect(probe.calls[0].url).toBe('https://staging.jov.ie/api/health/redis');
    expect(probe.calls[0].headers.authorization).toBe(
      'Bearer cron-secret-value'
    );
    expect(probe.calls[0].headers['x-vercel-protection-bypass']).toBe(
      'bypass-value'
    );
  });

  it('throws the named preflight error when the surface has no Redis', async () => {
    process.env.CRON_SECRET = 'cron-secret-value';
    delete process.env.PLAYWRIGHT_VERCEL_BYPASS_SECRET;
    const probe = mockRequest(
      503,
      JSON.stringify({
        error: 'Redis is unavailable',
        failureKind: 'not_configured',
      })
    );
    await expect(
      assertCanaryResetSurfaceReady({
        request: probe.request,
        origin: probe.origin,
      })
    ).rejects.toThrow(/cannot run the JOV-9826 walk.*no Redis/su);
    expect(
      probe.calls[0].headers['x-vercel-protection-bypass']
    ).toBeUndefined();
  });

  it('defers to the reset endpoint when the build predates the health route', async () => {
    process.env.CRON_SECRET = 'cron-secret-value';
    const probe = mockRequest(405, '');
    const verdict = await assertCanaryResetSurfaceReady({
      request: probe.request,
      origin: probe.origin,
    });
    expect(verdict.ready).toBe(true);
  });

  it('fails fast when CRON_SECRET is absent from the run', async () => {
    delete process.env.CRON_SECRET;
    const probe = mockRequest(200, '{}');
    await expect(
      assertCanaryResetSurfaceReady({
        request: probe.request,
        origin: probe.origin,
      })
    ).rejects.toThrow('CRON_SECRET is not provided to this run');
    expect(probe.calls).toHaveLength(0);
  });
});

describe('resetClaimCanary 429 classification', () => {
  const previousEnv = { ...process.env };

  afterEach(() => {
    process.env.CRON_SECRET = previousEnv.CRON_SECRET;
    process.env.SYNTHETIC_PASSAGE_KEY = previousEnv.SYNTHETIC_PASSAGE_KEY;
    vi.restoreAllMocks();
  });

  it('names the hourly budget condition on a 429 instead of a generic error', async () => {
    process.env.CRON_SECRET = 'cron-secret-value';
    process.env.SYNTHETIC_PASSAGE_KEY = 'passage-key-value';
    const request = {
      post: async () => ({
        status: () => 429,
        headers: () => ({ 'content-type': 'application/json' }),
        text: async () => '{"error":"Canary reset rate limit exceeded"}',
      }),
    } as unknown as APIRequestContext;
    const error = await resetClaimCanary({
      request,
      origin: 'https://staging.jov.ie',
      runTag: 'run-429',
    }).then(
      () => null,
      (e: unknown) => e
    );
    expect(error).toBeInstanceOf(CanaryResetRateLimitedError);
    expect(String(error)).toContain('canary reset HTTP 429');
    expect(String(error)).toContain('Canary reset rate limit exceeded');
  });
});
