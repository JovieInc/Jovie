import { afterEach, describe, expect, it, vi } from 'vitest';

describe('Playwright test discovery', () => {
  const originalBaseUrl = process.env.BASE_URL;

  afterEach(() => {
    if (originalBaseUrl === undefined) delete process.env.BASE_URL;
    else process.env.BASE_URL = originalBaseUrl;
  });

  it('collects browser specs without loading node:test utility suites', async () => {
    process.env.BASE_URL = 'http://localhost:3100';
    vi.resetModules();
    const { default: config } = await import('../../../playwright.config');

    expect(config.testMatch).toBe('**/*.spec.ts');
  });
});
