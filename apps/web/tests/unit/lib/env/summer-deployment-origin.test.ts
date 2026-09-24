import { describe, expect, it } from 'vitest';
import { ServerEnvSchema } from '@/lib/env-server-schema';

const schema = ServerEnvSchema.shape.OVIE_SUMMER_EVE_DEPLOYMENT_ORIGIN;

describe('Summer immutable deployment origin', () => {
  it.each(['jovie-eve-shadow', 'summer-operations'])(
    'accepts %s immutable deployments in the existing team',
    prefix => {
      expect(schema.parse(`https://${prefix}-abc123-jovie.vercel.app`)).toBe(
        `https://${prefix}-abc123-jovie.vercel.app`
      );
    }
  );
  it('keeps an unconfigured integration optional', () => {
    expect(schema.parse(undefined)).toBeUndefined();
  });
  it('keeps the eve-shadow bypass secret optional and distinct from the origin', () => {
    const secret =
      ServerEnvSchema.shape.OVIE_SUMMER_EVE_PROTECTION_BYPASS_SECRET;
    expect(secret.parse(undefined)).toBeUndefined();
    expect(secret.parse('eve-shadow-secret')).toBe('eve-shadow-secret');
  });
  it.each([
    'http://summer-operations-abc123-jovie.vercel.app',
    'https://summer-operations-abc123-other.vercel.app',
    'https://summer-operations-abc123-jovie.vercel.app.evil.test',
    'https://summer-operations-abc123-jovie.vercel.app/path',
    'https://summer-operations-abc123-jovie.vercel.app/',
    'https://summer-operations-abc123-jovie.vercel.app?token=example',
    'https://summer-operations-abc123-jovie.vercel.app#fragment',
    'https://user@example-summer-operations-abc123-jovie.vercel.app',
    `https://${['user', 'password'].join(':')}@summer-operations-abc123-jovie.vercel.app`,
    'https://summer-operations.vercel.app',
    'https://summer-operations-git-main-jovie.vercel.app',
    'https://summer.jov.ie',
    'https://other-abc123-jovie.vercel.app',
    '',
  ])('rejects mutable, untrusted or non-origin URL %s', value => {
    expect(schema.safeParse(value).success).toBe(false);
  });
});
