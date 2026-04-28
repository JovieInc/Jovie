import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTestAuthAvailability } from '../../scripts/route-qa';

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('route-qa auth probe', () => {
  it('treats a failed auth bootstrap probe as inconclusive instead of blocking the sweep', async () => {
    vi.stubEnv('ROUTE_QA_TEST_AUTH_PROBE_TIMEOUT_MS', '50');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('probe timed out'))
    );

    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    await expect(getTestAuthAvailability()).resolves.toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Auth bootstrap probe failed')
    );
  });
});
