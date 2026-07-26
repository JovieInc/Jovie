import { describe, expect, it } from 'vitest';
import {
  PRODUCTION_AUTH_SMOKE_EMAIL,
  resolveProductionAuthCredentials,
} from '../../e2e/utils/production-auth-credentials';

describe('production auth credential selection', () => {
  it('selects the primary Better Auth identity with a database OTP source', () => {
    expect(
      resolveProductionAuthCredentials({
        E2E_PROD_USER_EMAIL: PRODUCTION_AUTH_SMOKE_EMAIL,
        DATABASE_URL: 'postgresql://production.example/db',
        E2E_CLERK_USER_USERNAME: 'legacy@example.com',
        E2E_CLERK_USER_PASSWORD: 'legacy-password',
      })
    ).toEqual({
      source: 'primary',
      email: PRODUCTION_AUTH_SMOKE_EMAIL,
      password: '',
      verificationCode: '',
    });
  });

  it('accepts a fixed primary OTP without database access', () => {
    expect(
      resolveProductionAuthCredentials({
        E2E_PROD_USER_EMAIL: PRODUCTION_AUTH_SMOKE_EMAIL,
        E2E_PROD_USER_CODE: '123456',
      })
    ).toEqual({
      source: 'primary',
      email: PRODUCTION_AUTH_SMOKE_EMAIL,
      password: '',
      verificationCode: '123456',
    });
  });

  it('falls back only to a complete legacy pair', () => {
    expect(
      resolveProductionAuthCredentials({
        E2E_PROD_USER_EMAIL: 'orphan-primary@example.com',
        E2E_CLERK_USER_USERNAME: 'legacy@example.com',
        E2E_CLERK_USER_PASSWORD: 'legacy-password',
      })
    ).toEqual({
      source: 'legacy',
      email: 'legacy@example.com',
      password: 'legacy-password',
      verificationCode: '',
    });
  });

  it('never mixes credentials across named pairs', () => {
    expect(
      resolveProductionAuthCredentials({
        E2E_PROD_USER_EMAIL: 'primary@example.com',
        E2E_CLERK_USER_PASSWORD: 'legacy-password',
      })
    ).toBeNull();
  });

  it('refuses an unexpected primary identity even with a complete OTP source', () => {
    const adversarialEmail =
      '$(touch /tmp/jovie-should-not-exist) "quoted"\nnext@example.com';

    expect(
      resolveProductionAuthCredentials({
        E2E_PROD_USER_EMAIL: adversarialEmail,
        E2E_PROD_USER_CODE: ' 12 34 56 ',
      })
    ).toBeNull();
  });

  it.each([
    [{ E2E_PROD_USER_EMAIL: PRODUCTION_AUTH_SMOKE_EMAIL }],
    [
      {
        E2E_PROD_USER_EMAIL: PRODUCTION_AUTH_SMOKE_EMAIL,
        E2E_CLERK_USER_PASSWORD: 'legacy-password',
      },
    ],
    [
      {
        DATABASE_URL: 'postgresql://production.example/db',
        E2E_CLERK_USER_USERNAME: 'legacy@example.com',
      },
    ],
  ])('rejects incomplete cross-pair fixture %#', environment => {
    expect(resolveProductionAuthCredentials(environment)).toBeNull();
  });
});
