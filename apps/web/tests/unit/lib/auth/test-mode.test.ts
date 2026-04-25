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
    delete process.env.TEST_CLERK_USER_ID;
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

  it('allows bypass markers on private development hosts', () => {
    vi.stubEnv('E2E_USE_TEST_AUTH_BYPASS', '1');

    expect(
      resolveTestBypassUserId({
        get: (name: string) => {
          if (name === 'host') {
            return '192.168.1.10:3000';
          }
          if (name === TEST_MODE_HEADER) {
            return TEST_AUTH_BYPASS_MODE;
          }
          if (name === TEST_USER_ID_HEADER) {
            return 'user_private_host';
          }
          return null;
        },
      })
    ).toBe('user_private_host');
  });

  it('allows bypass markers on the standalone bind host', () => {
    vi.stubEnv('E2E_USE_TEST_AUTH_BYPASS', '1');

    expect(
      resolveTestBypassUserId({
        get: (name: string) => {
          if (name === 'host') {
            return '0.0.0.0:3100';
          }
          if (name === TEST_MODE_HEADER) {
            return TEST_AUTH_BYPASS_MODE;
          }
          if (name === TEST_USER_ID_HEADER) {
            return 'user_bind_host';
          }
          return null;
        },
      })
    ).toBe('user_bind_host');
  });

  it('allows bypass markers on trusted preview hosts', () => {
    vi.stubEnv('E2E_USE_TEST_AUTH_BYPASS', '1');

    expect(
      resolveTestBypassUserId({
        get: (name: string) => {
          if (name === 'host') {
            return 'jovie-git-feature-123-jovie.vercel.app';
          }
          if (name === TEST_MODE_HEADER) {
            return TEST_AUTH_BYPASS_MODE;
          }
          if (name === TEST_USER_ID_HEADER) {
            return 'user_preview_host';
          }
          return null;
        },
      })
    ).toBe('user_preview_host');
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

  it('ignores bypass markers on untrusted public hosts', () => {
    vi.stubEnv('E2E_USE_TEST_AUTH_BYPASS', '1');

    expect(
      resolveTestBypassUserId({
        get: (name: string) => {
          if (name === 'host') {
            return 'attacker.example.com';
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

  it('rejects hostnames that only look like private IPv4 prefixes', () => {
    vi.stubEnv('E2E_USE_TEST_AUTH_BYPASS', '1');

    expect(
      resolveTestBypassUserId({
        get: (name: string) => {
          if (name === 'host') {
            return '10.attacker.example';
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
