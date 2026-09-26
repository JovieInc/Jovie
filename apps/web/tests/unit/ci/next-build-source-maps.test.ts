import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function loadExperimental() {
  vi.resetModules();
  const nextConfig = await import('../../../next.config.js');
  return (nextConfig.default ?? nextConfig).experimental;
}

it('keeps Turbopack source maps on unless the CI-only flag is set', async () => {
  vi.stubEnv('JOVIE_CI_SKIP_TURBOPACK_SOURCE_MAPS', '');
  vi.stubEnv('VERCEL_ENV', 'production');
  const experimental = await loadExperimental();
  expect(experimental).not.toHaveProperty('turbopackSourceMaps');
});

it('drops Turbopack source maps only for the exact CI flag value', async () => {
  vi.stubEnv('JOVIE_CI_SKIP_TURBOPACK_SOURCE_MAPS', 'true');
  expect(await loadExperimental()).not.toHaveProperty('turbopackSourceMaps');

  vi.stubEnv('JOVIE_CI_SKIP_TURBOPACK_SOURCE_MAPS', '1');
  expect((await loadExperimental()).turbopackSourceMaps).toBe(false);
});
