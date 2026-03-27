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
  });

  it('enables the bypass when the explicit E2E flag is set', () => {
    vi.stubEnv('E2E_USE_TEST_AUTH_BYPASS', '1');
    expect(isTestAuthBypassEnabled()).toBe(true);
  });

  it('does not enable the bypass for a plain test environment', () => {
    vi.stubEnv('NODE_ENV', 'test');
    expect(isTestAuthBypassEnabled()).toBe(false);
  });

  it('returns null when bypass mode is absent', () => {
    expect(
      resolveTestBypassUserId({ get: () => null }, { get: () => undefined })
    ).toBeNull();
  });

  it('ignores a user id when no test-mode marker is present', () => {
    vi.stubEnv('E2E_USE_TEST_AUTH_BYPASS', '1');

    expect(
      resolveTestBypassUserId({
        get: (name: string) => {
          if (name === 'host') {
            return 'localhost:3100';
          }
          if (name === TEST_USER_ID_HEADER) {
            return 'user_header_only';
          }
          return null;
        },
      })
    ).toBeNull();
  });

  it('reads the bypass user id from cookies', () => {
    vi.stubEnv('E2E_USE_TEST_AUTH_BYPASS', '1');
    expect(
      resolveTestBypassUserId(
        {
          get: (name: string) => (name === 'host' ? 'localhost:3100' : null),
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
    ).toBe('user_cookie');
  });

  it('reads the bypass user id from the raw cookie header', () => {
    vi.stubEnv('E2E_USE_TEST_AUTH_BYPASS', '1');
    expect(
      resolveTestBypassUserId({
        get: (name: string) =>
          name === 'cookie'
            ? `${TEST_MODE_COOKIE}=${TEST_AUTH_BYPASS_MODE}; ${TEST_USER_ID_COOKIE}=user_cookie_header`
            : name === 'host'
              ? 'localhost:3100'
              : null,
      })
    ).toBe('user_cookie_header');
  });

  it('prefers request headers over cookies when both are present', () => {
    vi.stubEnv('E2E_USE_TEST_AUTH_BYPASS', '1');
    expect(
      resolveTestBypassUserId(
        {
          get: (name: string) => {
            if (name === 'host') {
              return 'localhost:3100';
            }
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

  it('ignores a bypass user id when the bypass flag is off', () => {
    expect(
      resolveTestBypassUserId({
        get: (name: string) => {
          if (name === 'host') {
            return 'localhost:3100';
          }
          if (name === TEST_MODE_HEADER) {
            return TEST_AUTH_BYPASS_MODE;
          }
          if (name === TEST_USER_ID_HEADER) {
            return 'user_header';
          }
          return null;
        },
      })
    ).toBeNull();
  });

  it('ignores bypass markers on non-loopback hosts', () => {
    vi.stubEnv('E2E_USE_TEST_AUTH_BYPASS', '1');

    expect(
      resolveTestBypassUserId({
        get: (name: string) => {
          if (name === 'host') {
            return 'preview.jov.ie';
          }
          if (name === TEST_MODE_HEADER) {
            return TEST_AUTH_BYPASS_MODE;
          }
          if (name === TEST_USER_ID_HEADER) {
            return 'user_header';
          }
          return null;
        },
      })
    ).toBeNull();
  });
});
