import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ALLOW_PRODUCTION_UPSTASH_ENV,
  isLocalRedisUrl,
  isProductionRedisRuntime,
  isProductionUpstashHost,
  PRODUCTION_UPSTASH_HOST,
  productionUpstashCredentials,
  resetRedisStoreWarningForTests,
  selectRedisStore,
} from './redis-store';

const PROD_URL = `https://${PRODUCTION_UPSTASH_HOST}`;

afterEach(() => {
  resetRedisStoreWarningForTests();
  vi.restoreAllMocks();
});

describe('selectRedisStore', () => {
  it('keeps Upstash in production even when E2E and CI flags are set', () => {
    const decision = selectRedisStore({
      NODE_ENV: 'test',
      VERCEL_ENV: 'production',
      CI: 'true',
      E2E_TEST_MODE: '1',
      UPSTASH_REDIS_REST_URL: PROD_URL,
      UPSTASH_REDIS_REST_TOKEN: 'token',
      REDIS_URL: 'redis://127.0.0.1:6379',
    });

    expect(
      isProductionRedisRuntime({
        NODE_ENV: 'test',
        VERCEL_ENV: 'production',
        CI: 'true',
        E2E_TEST_MODE: '1',
      })
    ).toBe(true);
    expect(decision.kind).toBe('upstash');
    expect(decision.blockProductionUpstash).toBe(false);
    expect(decision.warning).toBeUndefined();
  });

  it('keeps Upstash for a production Node runtime that is not CI, preview, or E2E', () => {
    expect(
      selectRedisStore({
        NODE_ENV: 'production',
        UPSTASH_REDIS_REST_URL: PROD_URL,
      }).kind
    ).toBe('upstash');
  });

  it.each([
    { NODE_ENV: 'test' },
    { NODE_ENV: 'development' },
    { NODE_ENV: 'production', CI: 'true' },
    { NODE_ENV: 'production', CI: '1' },
    { NODE_ENV: 'production', E2E_TEST_MODE: '1' },
    { NODE_ENV: 'production', E2E_TEST_MODE: 'true' },
    { NODE_ENV: 'production', VITEST: 'true' },
    { NODE_ENV: 'production', VERCEL_ENV: 'preview' },
    { NODE_ENV: 'production', VERCEL_ENV: 'development' },
  ])('uses memory outside production for %j', env => {
    const decision = selectRedisStore({
      ...env,
      UPSTASH_REDIS_REST_URL: PROD_URL,
      UPSTASH_REDIS_REST_TOKEN: 'token',
    });

    expect(decision.kind).toBe('memory');
    expect(decision.blockProductionUpstash).toBe(true);
    expect(decision.warning).toContain(PRODUCTION_UPSTASH_HOST);
    expect(decision.warning).toContain('in-memory');
    expect(decision.warning).toContain(ALLOW_PRODUCTION_UPSTASH_ENV);
  });

  it('uses local Redis when REDIS_URL is loopback and still refuses the prod host', () => {
    const decision = selectRedisStore({
      NODE_ENV: 'development',
      UPSTASH_REDIS_REST_URL: PROD_URL,
      REDIS_URL: 'redis://127.0.0.1:6379/0',
    });

    expect(decision.kind).toBe('local-redis');
    expect(decision.localRedisUrl).toBe('redis://127.0.0.1:6379/0');
    expect(decision.blockProductionUpstash).toBe(true);
    expect(decision.warning).toContain('127.0.0.1:6379');
    expect(decision.warning).not.toContain('token');
  });

  it('ignores a remote REDIS_URL outside production', () => {
    const decision = selectRedisStore({
      NODE_ENV: 'development',
      REDIS_URL: 'redis://example.com:6379',
    });

    expect(decision.kind).toBe('memory');
    expect(decision.localRedisUrl).toBeUndefined();
    expect(decision.warning).toBeUndefined();
  });

  it('lets the override use production Upstash outside production', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const decision = selectRedisStore({
      NODE_ENV: 'development',
      UPSTASH_REDIS_REST_URL: PROD_URL,
      UPSTASH_REDIS_REST_TOKEN: 'secret-token',
      JOVIE_ALLOW_PRODUCTION_UPSTASH: '1',
    });

    expect(decision.kind).toBe('upstash');
    expect(decision.blockProductionUpstash).toBe(false);
    expect(decision.warning).toContain(ALLOW_PRODUCTION_UPSTASH_ENV);
    expect(decision.warning).not.toContain('secret-token');

    const credentials = productionUpstashCredentials({
      NODE_ENV: 'development',
      UPSTASH_REDIS_REST_URL: PROD_URL,
      UPSTASH_REDIS_REST_TOKEN: 'secret-token',
      JOVIE_ALLOW_PRODUCTION_UPSTASH: '1',
    });
    expect(credentials).toEqual({ url: PROD_URL, token: 'secret-token' });
    expect(warn).toHaveBeenCalledOnce();
  });

  it('does not return Upstash credentials outside production', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(
      productionUpstashCredentials({
        NODE_ENV: 'test',
        UPSTASH_REDIS_REST_URL: PROD_URL,
        UPSTASH_REDIS_REST_TOKEN: 'secret-token',
      })
    ).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe('host checks', () => {
  it('recognizes the production Upstash host and loopback Redis URLs', () => {
    expect(isProductionUpstashHost(`  ${PROD_URL}/`)).toBe(true);
    expect(isProductionUpstashHost('https://other.upstash.io')).toBe(false);
    expect(isLocalRedisUrl('redis://localhost:6379')).toBe(true);
    expect(isLocalRedisUrl('rediss://[::1]:6379')).toBe(true);
    expect(isLocalRedisUrl('redis://localhost.evil.com:6379')).toBe(false);
    expect(isLocalRedisUrl('http://127.0.0.1:6379')).toBe(false);
  });
});
