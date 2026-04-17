import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe('route-qa auth probe', () => {
  it('treats a failed auth bootstrap probe as inconclusive instead of blocking the sweep', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('probe timed out'))
    );

    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const { getTestAuthAvailability } = await import('../../scripts/route-qa');

    await expect(getTestAuthAvailability()).resolves.toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Auth bootstrap probe failed')
    );
  });
});
