import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const FLAG = 'NEXT_PUBLIC_FEATURE_THEME_SWITCHING';
const ENV_KEYS = [FLAG, 'CI', 'BASE_URL', 'E2E_SKIP_WEB_SERVER'] as const;

describe('Playwright config theme-switching flag', () => {
  const saved: Partial<Record<(typeof ENV_KEYS)[number], string>> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    vi.resetModules();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    vi.resetModules();
  });

  it('mirrors the managed server flag into the worker env so light-mode scans run', async () => {
    await import('../../../playwright.config');
    expect(process.env[FLAG]).toBe('1');

    // Workers import the same route policy; with the flag it must match.
    const { isThemeRoute } = await import('@/lib/theme/route-policy');
    expect(isThemeRoute('/pricing')).toBe(true);
  });

  it('leaves the flag to the caller when the server is managed externally', async () => {
    process.env.E2E_SKIP_WEB_SERVER = '1';
    await import('../../../playwright.config');
    expect(process.env[FLAG]).toBeUndefined();
  });
});
