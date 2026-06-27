import { afterEach, describe, expect, it, vi } from 'vitest';

describe('agnost telemetry guards', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it('disables export in CI', async () => {
    process.env.CI = 'true';
    const { shouldEnableAgnost } = await import('@/lib/observability/agnost');
    expect(shouldEnableAgnost()).toBe(false);
  });

  it('disables export in local dev unless explicitly enabled', async () => {
    process.env.CI = 'false';
    process.env.NODE_ENV = 'development';
    delete process.env.JOVIE_ENABLE_AGNOST;
    const { shouldEnableAgnost } = await import('@/lib/observability/agnost');
    expect(shouldEnableAgnost()).toBe(false);
  });

  it('disables export in local E2E runtime', async () => {
    process.env.CI = 'false';
    process.env.NODE_ENV = 'test';
    process.env.NEXT_PUBLIC_E2E_MODE = '1';
    process.env.JOVIE_ENABLE_AGNOST = '1';
    const { shouldEnableAgnost } = await import('@/lib/observability/agnost');
    expect(shouldEnableAgnost()).toBe(false);
  });

  it('enables export in production with default org id', async () => {
    process.env.CI = 'false';
    process.env.NODE_ENV = 'production';
    delete process.env.AGNOST_ORG_ID;
    const { shouldEnableAgnost, getAgnostOrgId } = await import(
      '@/lib/observability/agnost'
    );
    expect(shouldEnableAgnost()).toBe(true);
    expect(getAgnostOrgId()).toBe('3e2d4388-5d86-41f5-8f67-4a3bac08d72f');
  });
});
