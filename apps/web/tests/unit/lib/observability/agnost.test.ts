import { afterEach, describe, expect, it, vi } from 'vitest';

describe('agnost telemetry guards', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('disables export in CI', async () => {
    vi.stubEnv('CI', 'true');
    const { shouldEnableAgnost } = await import('@/lib/observability/agnost');
    expect(shouldEnableAgnost()).toBe(false);
  });

  it('disables export in local dev unless explicitly enabled', async () => {
    vi.stubEnv('CI', 'false');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('JOVIE_ENABLE_AGNOST', '');
    const { shouldEnableAgnost } = await import('@/lib/observability/agnost');
    expect(shouldEnableAgnost()).toBe(false);
  });

  it('disables export in local E2E runtime', async () => {
    vi.stubEnv('CI', 'false');
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXT_PUBLIC_E2E_MODE', '1');
    vi.stubEnv('JOVIE_ENABLE_AGNOST', '1');
    const { shouldEnableAgnost } = await import('@/lib/observability/agnost');
    expect(shouldEnableAgnost()).toBe(false);
  });

  it('enables export in production with default org id', async () => {
    vi.stubEnv('CI', 'false');
    vi.stubEnv('NODE_ENV', 'production');
    delete process.env.AGNOST_ORG_ID;
    const { shouldEnableAgnost, getAgnostOrgId, DEFAULT_AGNOST_ORG_ID } =
      await import('@/lib/observability/agnost');
    expect(shouldEnableAgnost()).toBe(true);
    expect(getAgnostOrgId()).toBe(DEFAULT_AGNOST_ORG_ID);
  });

  it('prefers AGNOST_ORG_ID when explicitly configured', async () => {
    const configuredOrgId = '384ebd06-d9a5-48dd-ba22-7a51e430c173';
    vi.stubEnv('CI', 'false');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AGNOST_ORG_ID', configuredOrgId);
    const { getAgnostOrgId } = await import('@/lib/observability/agnost');
    expect(getAgnostOrgId()).toBe(configuredOrgId);
  });
});
