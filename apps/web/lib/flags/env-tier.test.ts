import { afterEach, describe, expect, it } from 'vitest';
import { FLAG_ENV_TIER_COLUMN, getFlagEnvTier } from './env-tier';

describe('getFlagEnvTier', () => {
  afterEach(() => {
    delete process.env.VERCEL_ENV;
  });

  it('maps VERCEL_ENV=production to prod', () => {
    process.env.VERCEL_ENV = 'production';
    expect(getFlagEnvTier()).toBe('prod');
  });

  it('maps VERCEL_ENV=preview (incl. staging alias) to staging', () => {
    process.env.VERCEL_ENV = 'preview';
    expect(getFlagEnvTier()).toBe('staging');
  });

  it('maps local/unset to dev', () => {
    delete process.env.VERCEL_ENV;
    expect(getFlagEnvTier()).toBe('dev');
    process.env.VERCEL_ENV = 'development';
    expect(getFlagEnvTier()).toBe('dev');
  });

  it('maps each tier to its column', () => {
    expect(FLAG_ENV_TIER_COLUMN.dev).toBe('devEnabled');
    expect(FLAG_ENV_TIER_COLUMN.staging).toBe('stagingEnabled');
    expect(FLAG_ENV_TIER_COLUMN.prod).toBe('prodEnabled');
  });
});
