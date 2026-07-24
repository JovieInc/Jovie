import { describe, expect, it } from 'vitest';
import { resolveProductionAuthCredentials } from '../../e2e/utils/production-auth-credentials';

describe('production auth credential pairing', () => {
  it('selects the complete primary pair atomically', () => {
    expect(
      resolveProductionAuthCredentials({
        E2E_PROD_USER_EMAIL: 'primary@example.com',
        E2E_PROD_USER_PASSWORD: 'primary-password',
        E2E_PROD_USER_CODE: '123456',
        E2E_CLERK_USER_USERNAME: 'legacy@example.com',
        E2E_CLERK_USER_PASSWORD: 'legacy-password',
      })
    ).toEqual({
      source: 'primary',
      email: 'primary@example.com',
      password: 'primary-password',
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

  it('preserves adversarial values as inert data while selecting one complete pair', () => {
    const adversarialEmail =
      '$(touch /tmp/jovie-should-not-exist) "quoted"\nnext@example.com';
    const adversarialPassword =
      "`touch /tmp/jovie-also-should-not-exist` $PATH 'single'";

    expect(
      resolveProductionAuthCredentials({
        E2E_PROD_USER_EMAIL: adversarialEmail,
        E2E_PROD_USER_PASSWORD: adversarialPassword,
        E2E_PROD_USER_CODE: ' 12 34 56 ',
        E2E_CLERK_USER_USERNAME: 'legacy@example.com',
        E2E_CLERK_USER_PASSWORD: 'legacy-password',
      })
    ).toEqual({
      source: 'primary',
      email: adversarialEmail,
      password: adversarialPassword,
      verificationCode: ' 12 34 56 ',
    });
  });

  it.each([
    [{ E2E_PROD_USER_EMAIL: 'primary@example.com' }],
    [{ E2E_PROD_USER_PASSWORD: 'primary-password' }],
    [
      {
        E2E_PROD_USER_EMAIL: 'primary@example.com',
        E2E_CLERK_USER_PASSWORD: 'legacy-password',
      },
    ],
    [
      {
        E2E_PROD_USER_PASSWORD: 'primary-password',
        E2E_CLERK_USER_USERNAME: 'legacy@example.com',
      },
    ],
  ])('rejects incomplete cross-pair fixture %#', environment => {
    expect(resolveProductionAuthCredentials(environment)).toBeNull();
  });
});
