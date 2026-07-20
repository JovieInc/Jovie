import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => vi.unstubAllEnvs());
it('caps Next build workers to the GitHub runner CPU quota', async () => {
  vi.stubEnv('GITHUB_ACTIONS', 'true');
  const nextConfig = await import('../../../next.config.js');
  expect((nextConfig.default ?? nextConfig).experimental.cpus).toBe(2);
});
