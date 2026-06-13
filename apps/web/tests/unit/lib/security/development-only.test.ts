import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('development-only security helpers', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('isExplicitDevelopmentEnvironment', () => {
    it('returns true when NODE_ENV is development', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('VERCEL_ENV', '');

      const { isExplicitDevelopmentEnvironment } = await import(
        '@/lib/security/development-only'
      );

      expect(isExplicitDevelopmentEnvironment()).toBe(true);
    });

    it('returns true when VERCEL_ENV is development', async () => {
      vi.stubEnv('NODE_ENV', 'test');
      vi.stubEnv('VERCEL_ENV', 'development');

      const { isExplicitDevelopmentEnvironment } = await import(
        '@/lib/security/development-only'
      );

      expect(isExplicitDevelopmentEnvironment()).toBe(true);
    });

    it('returns false on Vercel preview deployments', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('VERCEL_ENV', 'preview');

      const { isExplicitDevelopmentEnvironment } = await import(
        '@/lib/security/development-only'
      );

      expect(isExplicitDevelopmentEnvironment()).toBe(false);
    });

    it('returns false on Vercel production deployments', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('VERCEL_ENV', 'production');

      const { isExplicitDevelopmentEnvironment } = await import(
        '@/lib/security/development-only'
      );

      expect(isExplicitDevelopmentEnvironment()).toBe(false);
    });
  });

  describe('developmentOnlyForbiddenJson', () => {
    it('returns a 403 JSON payload with the shared error copy', async () => {
      const { developmentOnlyForbiddenJson, DEVELOPMENT_ONLY_ERROR } =
        await import('@/lib/security/development-only');

      const response = developmentOnlyForbiddenJson();
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({
        success: false,
        error: DEVELOPMENT_ONLY_ERROR,
      });
    });
  });
});
