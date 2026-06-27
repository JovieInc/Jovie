import { describe, expect, it } from 'vitest';
import {
  classifySessionSecret,
  configsNeedingProvision,
  generateSessionSecret,
  isValidSessionSecret,
  PRODUCTION_DOPPLER_CONFIG,
  resolveProvisionTargets,
  SESSION_SECRET_MIN_LENGTH,
  STAGING_DOPPLER_CONFIG,
} from '../../../../../scripts/session-secret-config';

describe('scripts/session-secret-config.ts', () => {
  it('requires SESSION_SECRET to be at least 32 characters', () => {
    expect(SESSION_SECRET_MIN_LENGTH).toBe(32);
    expect(isValidSessionSecret('a'.repeat(31))).toBe(false);
    expect(isValidSessionSecret('a'.repeat(32))).toBe(true);
  });

  it('generates secrets that satisfy the onboarding signing minimum', () => {
    const secret = generateSessionSecret();
    expect(secret.length).toBeGreaterThanOrEqual(SESSION_SECRET_MIN_LENGTH);
    expect(isValidSessionSecret(secret)).toBe(true);
  });

  it('resolves staging and production Doppler targets explicitly', () => {
    expect(resolveProvisionTargets('stg')).toEqual([STAGING_DOPPLER_CONFIG]);
    expect(resolveProvisionTargets('prd')).toEqual([PRODUCTION_DOPPLER_CONFIG]);
    expect(resolveProvisionTargets('all')).toEqual([
      STAGING_DOPPLER_CONFIG,
      PRODUCTION_DOPPLER_CONFIG,
    ]);
  });

  it('classifies missing, too-short, and valid secrets without leaking values', () => {
    expect(classifySessionSecret('stg', undefined)).toEqual({
      config: 'stg',
      status: 'missing',
    });
    expect(classifySessionSecret('prd', 'short-secret')).toEqual({
      config: 'prd',
      status: 'too_short',
    });
    expect(classifySessionSecret('prd', 'x'.repeat(32))).toEqual({
      config: 'prd',
      status: 'ok',
    });
  });

  it('reports only configs that still need provisioning', () => {
    expect(
      configsNeedingProvision([
        { config: 'stg', status: 'ok' },
        { config: 'prd', status: 'missing' },
      ])
    ).toEqual([PRODUCTION_DOPPLER_CONFIG]);
  });
});
