import { afterEach, describe, expect, it, vi } from 'vitest';

function environment(): Record<string, string> {
  return {
    BETTER_AUTH_SECRET: 'a'.repeat(32),
    SESSION_SECRET: 's'.repeat(32),
    URL_ENCRYPTION_KEY: 'fixture-url-key',
    STRIPE_SECRET_KEY: 'sk_test_fixture',
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('shared canonical configuration constraints', () => {
  it('preserves existing runtime secret and encryption classifications without adding strength rules', async () => {
    const { RUNTIME_VALIDATION_RULES } = await import(
      '@/lib/env-validation-rules'
    );
    const { ServerEnvSchema } = await import('@/lib/env-server-schema');
    const secretRule = RUNTIME_VALIDATION_RULES.find(
      rule => rule.name === 'checkBetterAuthSecret'
    );
    const encryptionRule = RUNTIME_VALIDATION_RULES.find(
      rule => rule.name === 'checkUrlEncryptionKey'
    );
    const stripeRule = RUNTIME_VALIDATION_RULES.find(
      rule => rule.name === 'checkStripeSecretFormat'
    );
    expect(secretRule).toBeDefined();
    expect(encryptionRule).toBeDefined();
    expect(stripeRule).toBeDefined();
    vi.spyOn(process, 'uptime').mockReturnValue(10);
    for (const mode of ['production', 'preview', 'development', 'test', '']) {
      const secure = mode === 'production' || mode === 'preview';
      for (const secret of [undefined, '', 'a'.repeat(31), 'a'.repeat(32)]) {
        const server = { ...environment(), BETTER_AUTH_SECRET: secret };
        const issue = secretRule!({
          server: server as Parameters<
            NonNullable<typeof secretRule>
          >[0]['server'],
          vercelEnv: mode,
        });
        expect(issue?.type ?? null).toBe(
          secure && (!secret || secret.length < 32) ? 'critical' : null
        );
      }
      for (const key of [
        undefined,
        '',
        'default-key-change-in-production-32-chars',
        'x',
      ]) {
        const server = { ...environment(), URL_ENCRYPTION_KEY: key };
        const issue = encryptionRule!({
          server: server as Parameters<
            NonNullable<typeof encryptionRule>
          >[0]['server'],
          vercelEnv: mode,
        });
        expect(issue?.type ?? null).toBe(
          secure &&
            (!key || key === 'default-key-change-in-production-32-chars')
            ? 'critical'
            : null
        );
      }
    }
    for (const key of [
      undefined,
      '',
      'rk_test_fixture',
      'malformed',
      'sk_test_fixture',
      'sk_live_fixture',
    ]) {
      const server = { ...environment(), STRIPE_SECRET_KEY: key };
      const issue = stripeRule!({
        server: server as Parameters<
          NonNullable<typeof stripeRule>
        >[0]['server'],
        vercelEnv: 'production',
      });
      expect(issue?.type ?? null).toBe(
        key && !key.startsWith('sk_') ? 'error' : null
      );
    }
    expect(
      ServerEnvSchema.shape.SESSION_SECRET.safeParse(undefined).success
    ).toBe(true);
    expect(
      ServerEnvSchema.shape.SESSION_SECRET.safeParse('s'.repeat(31)).success
    ).toBe(false);
    expect(
      ServerEnvSchema.shape.SESSION_SECRET.safeParse('s'.repeat(32)).success
    ).toBe(true);
  });

  it('preserves only the existing missing-auth-secret cold-start warning', async () => {
    const { RUNTIME_VALIDATION_RULES } = await import(
      '@/lib/env-validation-rules'
    );
    const secretRule = RUNTIME_VALIDATION_RULES.find(
      rule => rule.name === 'checkBetterAuthSecret'
    );
    expect(secretRule).toBeDefined();
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.spyOn(process, 'uptime').mockReturnValue(1);
    const server: Record<string, string | undefined> = {
      ...environment(),
      BETTER_AUTH_SECRET: undefined,
    };
    const result = secretRule!({
      server: server as Parameters<NonNullable<typeof secretRule>>[0]['server'],
      vercelEnv: 'preview',
    });
    expect(result).toEqual({
      type: 'warning',
      message: 'BETTER_AUTH_SECRET is missing (may be cold start timing issue)',
    });
    server.BETTER_AUTH_SECRET = 'a'.repeat(31);
    expect(
      secretRule!({
        server: server as Parameters<
          NonNullable<typeof secretRule>
        >[0]['server'],
        vercelEnv: 'preview',
      })?.type
    ).toBe('critical');
  });
});
