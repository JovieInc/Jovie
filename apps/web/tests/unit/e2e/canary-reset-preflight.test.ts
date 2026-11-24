import { describe, expect, it } from 'vitest';
import {
  type CanaryResetSurfacePreflight,
  classifyCanaryResetSurfaceProbe,
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
