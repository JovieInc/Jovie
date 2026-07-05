import { describe, expect, it } from 'vitest';
import {
  assertPatchTargetAllowed,
  assertTestOrAllowedInstance,
  extractAuthRelevantConfigKeys,
  getDopplerForInstance,
  hasMatchingRedirect,
} from '../../../../../scripts/clerk-config';

describe('scripts/clerk-config.ts', () => {
  const sampleConfig = JSON.stringify({
    auth: {
      redirect_urls: ['https://jov.ie/*', 'myapp://callback'],
      oauth_providers: { google: { enabled: true } },
    },
    allowed_origins: ['https://staging.jov.ie'],
    native_applications: [{ scheme: 'jovie' }],
    connection_oauth_custom: { enabled: false },
    auth_sign_in_url: '/signin',
    unrelated_key: 'ignored',
  });

  it('maps wrapper instances to Doppler + Clerk app targets', () => {
    expect(getDopplerForInstance('dev')).toEqual({
      project: 'jovie-web',
      config: 'dev',
      appId: 'app_30k0dWZPrUoCQ51f2ix99TWosSg',
      clerkInstance: 'dev',
    });
    expect(getDopplerForInstance('staging')).toEqual({
      project: 'jovie-web',
      config: 'stg',
      appId: 'app_31OUB1NkwJoCRW4w0ka65SRZCGz',
      clerkInstance: 'prod',
    });
    expect(getDopplerForInstance('prod')).toEqual({
      project: 'jovie-web',
      config: 'prd',
      appId: 'app_30k0dWZPrUoCQ51f2ix99TWosSg',
      clerkInstance: 'prod',
    });
  });

  it('rejects unknown wrapper instances', () => {
    expect(() => getDopplerForInstance('qa')).toThrow(
      'Unknown instance "qa". Use dev|staging|prod.'
    );
  });

  it('extracts auth-relevant keys from Clerk config JSON', () => {
    const extracted = extractAuthRelevantConfigKeys(sampleConfig);

    expect(extracted.auth).toEqual({
      redirect_urls: ['https://jov.ie/*', 'myapp://callback'],
      oauth_providers: { google: { enabled: true } },
    });
    expect(extracted.allowed_origins).toEqual(['https://staging.jov.ie']);
    expect(extracted.native_applications).toEqual([{ scheme: 'jovie' }]);
    expect(extracted.connection_oauth_custom).toEqual({ enabled: false });
    expect(extracted['auth.redirect_urls']).toEqual([
      'https://jov.ie/*',
      'myapp://callback',
    ]);
    expect(extracted).not.toHaveProperty('unrelated_key');
  });

  it('returns parse diagnostics for invalid JSON', () => {
    const extracted = extractAuthRelevantConfigKeys('not-json');

    expect(extracted).toHaveProperty('parse_error');
    expect(extracted).toHaveProperty('raw_preview', 'not-json');
  });

  it('matches redirect patterns case-insensitively', () => {
    expect(hasMatchingRedirect(sampleConfig, 'MYAPP://')).toBe(true);
    expect(hasMatchingRedirect(sampleConfig, 'jov.ie')).toBe(true);
    expect(hasMatchingRedirect(sampleConfig, 'missing-scheme://')).toBe(false);
  });

  it('refuses production secret keys without --allow-prod', () => {
    expect(() => assertTestOrAllowedInstance('sk_live_secret', false)).toThrow(
      'SAFETY: Refusing to target production'
    );
    expect(() =>
      assertTestOrAllowedInstance('sk_test_secret', false)
    ).not.toThrow();
    expect(() =>
      assertTestOrAllowedInstance('sk_live_secret', true)
    ).not.toThrow();
  });

  it('refuses prod/staging patch targets without --allow-prod', () => {
    expect(() =>
      assertPatchTargetAllowed(getDopplerForInstance('staging'), false)
    ).toThrow('SAFETY: Refusing to patch the production Clerk app');
    expect(() =>
      assertPatchTargetAllowed(getDopplerForInstance('prod'), false)
    ).toThrow('SAFETY: Refusing to patch the production Clerk app');
    expect(() =>
      assertPatchTargetAllowed(getDopplerForInstance('dev'), false)
    ).not.toThrow();
    expect(() =>
      assertPatchTargetAllowed(getDopplerForInstance('staging'), true)
    ).not.toThrow();
  });
});
