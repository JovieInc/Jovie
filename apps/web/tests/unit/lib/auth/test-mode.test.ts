import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isTestAuthBypassEnabled,
  resolveTestBypassUserId,
  TEST_AUTH_BYPASS_MODE,
  TEST_MODE_COOKIE,
  TEST_MODE_HEADER,
  TEST_USER_ID_COOKIE,
  TEST_USER_ID_HEADER,
} from '@/lib/auth/test-mode';

describe('test-mode auth bypass', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    delete process.env.E2E_USE_TEST_AUTH_BYPASS;
  });

  it('enables the bypass when the explicit E2E flag is set', () => {
    vi.stubEnv('E2E_USE_TEST_AUTH_BYPASS', '1');
    expect(isTestAuthBypassEnabled()).toBe(true);
  });

  it('returns null when bypass mode is absent', () => {
    expect(
      resolveTestBypassUserId({ get: () => null }, { get: () => undefined })
    ).toBeNull();
  });

  it('reads the bypass user id from cookies', () => {
    expect(
      resolveTestBypassUserId(
        { get: () => null },
        {
          get: (name: string) => {
            if (name === TEST_MODE_COOKIE) {
              return { value: TEST_AUTH_BYPASS_MODE };
            }
            if (name === TEST_USER_ID_COOKIE) {
              return { value: 'user_cookie' };
            }
            return undefined;
          },
        }
      )
    ).toBe('user_cookie');
  });

  it('reads the bypass user id from the raw cookie header', () => {
    expect(
      resolveTestBypassUserId({
        get: (name: string) =>
          name === 'cookie'
            ? `${TEST_MODE_COOKIE}=${TEST_AUTH_BYPASS_MODE}; ${TEST_USER_ID_COOKIE}=user_cookie_header`
            : null,
      })
    ).toBe('user_cookie_header');
  });

  it('prefers request headers over cookies when both are present', () => {
    expect(
      resolveTestBypassUserId(
        {
          get: (name: string) => {
            if (name === TEST_MODE_HEADER) {
              return TEST_AUTH_BYPASS_MODE;
            }
            if (name === TEST_USER_ID_HEADER) {
              return 'user_header';
            }
            return null;
          },
        },
        {
          get: (name: string) => {
            if (name === TEST_MODE_COOKIE) {
              return { value: TEST_AUTH_BYPASS_MODE };
            }
            if (name === TEST_USER_ID_COOKIE) {
              return { value: 'user_cookie' };
            }
            return undefined;
          },
        }
      )
    ).toBe('user_header');
  });
});
