import { describe, expect, it } from 'vitest';
import { ServerEnvSchema } from '@/lib/env-server-schema';
import { SUMMER_ORIGIN_ENV_ACCEPTED } from '@/lib/ovie/summer-eve-pin-schema';

const origin = ServerEnvSchema.shape.OVIE_SUMMER_EVE_DEPLOYMENT_ORIGIN;
const deploymentId =
  ServerEnvSchema.shape.OVIE_SUMMER_EVE_EXPECTED_DEPLOYMENT_ID;

describe('deprecated Summer deployment pin env', () => {
  it('keeps both pins optional so a leftover value does not fail boot', () => {
    expect(origin.parse(undefined)).toBeUndefined();
    expect(deploymentId.parse(undefined)).toBeUndefined();
    expect(origin.parse('')).toBe('');
    expect(deploymentId.parse('')).toBe('');
    expect(origin.parse('legacy-ignored')).toBe('legacy-ignored');
    expect(deploymentId.parse('legacy-ignored')).toBe('legacy-ignored');
  });

  it('accepts https://summer.jov.ie, which the immutable-deployment regex rejected', () => {
    expect(SUMMER_ORIGIN_ENV_ACCEPTED).toBe('https://summer.jov.ie');
    expect(origin.parse('https://summer.jov.ie')).toBe('https://summer.jov.ie');
    expect(origin.parse(SUMMER_ORIGIN_ENV_ACCEPTED)).toBe(
      'https://summer.jov.ie'
    );
  });

  it('keeps the eve-shadow bypass secret optional and distinct from the origin', () => {
    const secret =
      ServerEnvSchema.shape.OVIE_SUMMER_EVE_PROTECTION_BYPASS_SECRET;
    expect(secret.parse(undefined)).toBeUndefined();
    expect(secret.parse('eve-shadow-secret')).toBe('eve-shadow-secret');
  });
});
