import { afterEach, describe, expect, it, vi } from 'vitest';

describe('billing plan keys (JOV-INV-046 no dead ends)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('hides the Max card unless NEXT_PUBLIC_FEATURE_MAX_PLAN is explicitly true', async () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_MAX_PLAN', undefined as unknown as string);
    vi.resetModules();
    const { PLAN_KEYS } = await import('./billing-constants');
    expect(PLAN_KEYS).toEqual(['free', 'pro']);
  });

  it('shows the Max card only when Max is explicitly enabled', async () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_MAX_PLAN', 'true');
    vi.resetModules();
    const { PLAN_KEYS } = await import('./billing-constants');
    expect(PLAN_KEYS).toEqual(['free', 'pro', 'max']);
  });
});
