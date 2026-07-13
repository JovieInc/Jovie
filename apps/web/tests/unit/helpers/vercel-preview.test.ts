import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildVercelBypassUrl } from '../../helpers/vercel-preview';

describe('vercel preview helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses the Playwright-specific bypass secret without requiring global bypass headers', () => {
    vi.stubEnv('PLAYWRIGHT_VERCEL_BYPASS_SECRET', 'preview-secret');

    const bypassUrl = buildVercelBypassUrl(
      'https://jovie-git-main.vercel.app',
      '/signin'
    );

    expect(bypassUrl).toBe(
      'https://jovie-git-main.vercel.app/signin?x-vercel-set-bypass-cookie=true&x-vercel-protection-bypass=preview-secret'
    );
  });

  it('does not append bypass params for non-preview hosts', () => {
    vi.stubEnv('PLAYWRIGHT_VERCEL_BYPASS_SECRET', 'preview-secret');

    expect(buildVercelBypassUrl('https://jov.ie', '/signin')).toBeNull();
  });
});
