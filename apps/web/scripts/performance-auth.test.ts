import { describe, expect, it, vi } from 'vitest';
import {
  bootstrapPerformanceAuth,
  parsePerfAuthCliArgs,
  validatePerformanceAuthStorageState,
} from './performance-auth';

const storageState = {
  cookies: [
    {
      domain: '127.0.0.1',
      expires: -1,
      httpOnly: true,
      name: 'better-auth.session_token',
      path: '/',
      sameSite: 'Lax' as const,
      secure: false,
      value: 'session-token.signature',
    },
    {
      domain: '127.0.0.1',
      expires: -1,
      httpOnly: true,
      name: '__e2e_test_user_id',
      path: '/',
      sameSite: 'Lax' as const,
      secure: false,
      value: 'ba_user_123',
    },
    {
      domain: '127.0.0.1',
      expires: -1,
      httpOnly: true,
      name: '__e2e_test_persona',
      path: '/',
      sameSite: 'Lax' as const,
      secure: false,
      value: 'creator-ready',
    },
  ],
  origins: [],
};

describe('performance auth bootstrap', () => {
  it('parses explicit Better Auth bootstrap arguments', () => {
    expect(
      parsePerfAuthCliArgs([
        '--base-url',
        'http://127.0.0.1:4111',
        '--out',
        '.context/perf/auth/ready.json',
        '--persona',
        'creator-ready',
        '--json',
      ])
    ).toMatchObject({
      baseUrl: 'http://127.0.0.1:4111',
      json: true,
      persona: 'creator-ready',
    });
  });

  it.each([
    [['--base-url'], 'Missing value for --base-url'],
    [['--persona', 'member'], 'Missing or invalid value for --persona'],
    [['--legacy-clerk'], 'Unknown argument: --legacy-clerk'],
  ])('rejects invalid arguments %j', (args, message) => {
    expect(() => parsePerfAuthCliArgs(args)).toThrow(message);
  });

  it('uses the trusted enter route and persists validated Playwright state', async () => {
    const goto = vi.fn().mockResolvedValue({ status: () => 303 });
    const page = {
      evaluate: vi.fn().mockResolvedValue({
        status: 200,
        userId: 'ba_user_123',
      }),
      goto,
      url: vi.fn(() => 'http://127.0.0.1:4111/app/chat'),
    };
    const context = {
      close: vi.fn().mockResolvedValue(undefined),
      newPage: vi.fn().mockResolvedValue(page),
      storageState: vi.fn().mockResolvedValue(storageState),
    };
    const browser = {
      close: vi.fn().mockResolvedValue(undefined),
      newContext: vi.fn().mockResolvedValue(context),
    };
    const persistStorageState = vi.fn();

    await expect(
      bootstrapPerformanceAuth(
        {
          baseUrl: 'http://127.0.0.1:4111',
          json: false,
          outPath: '/tmp/perf-auth.json',
          persona: 'creator-ready',
        },
        {
          launchBrowser: vi.fn().mockResolvedValue(browser),
          persistStorageState,
        }
      )
    ).resolves.toMatchObject({
      authStatePath: '/tmp/perf-auth.json',
      betterAuthUserId: 'ba_user_123',
      cookieCount: 3,
      persona: 'creator-ready',
      sourcePath: '/api/dev/test-auth/enter',
    });

    expect(goto).toHaveBeenCalledWith(
      'http://127.0.0.1:4111/api/dev/test-auth/enter?persona=creator-ready&redirect=%2Fapp%2Fchat&session=better-auth',
      { timeout: 60_000, waitUntil: 'domcontentloaded' }
    );
    expect(persistStorageState).toHaveBeenCalledWith(
      '/tmp/perf-auth.json',
      storageState
    );
    expect(context.close).toHaveBeenCalledOnce();
    expect(browser.close).toHaveBeenCalledOnce();
  });

  it('fails when the enter route lands outside the authenticated target', async () => {
    const context = {
      close: vi.fn().mockResolvedValue(undefined),
      newPage: vi.fn().mockResolvedValue({
        evaluate: vi.fn().mockResolvedValue({
          status: 200,
          userId: 'ba_user_123',
        }),
        goto: vi.fn().mockResolvedValue({ status: () => 303 }),
        url: vi.fn(() => 'http://127.0.0.1:4111/signin'),
      }),
      storageState: vi.fn().mockResolvedValue(storageState),
    };
    const browser = {
      close: vi.fn().mockResolvedValue(undefined),
      newContext: vi.fn().mockResolvedValue(context),
    };

    await expect(
      bootstrapPerformanceAuth(
        {
          baseUrl: 'http://127.0.0.1:4111',
          json: false,
          outPath: '/tmp/perf-auth.json',
          persona: 'creator-ready',
        },
        {
          launchBrowser: vi.fn().mockResolvedValue(browser),
          persistStorageState: vi.fn(),
        }
      )
    ).rejects.toThrow(
      'Better Auth bootstrap landed on /signin instead of /app/chat.'
    );
  });

  it('fails when the trusted enter route rejects the bootstrap', async () => {
    const context = {
      close: vi.fn().mockResolvedValue(undefined),
      newPage: vi.fn().mockResolvedValue({
        evaluate: vi.fn().mockResolvedValue({
          status: 200,
          userId: 'ba_user_123',
        }),
        goto: vi.fn().mockResolvedValue({ status: () => 403 }),
        url: vi.fn(() => 'http://127.0.0.1:4111/api/dev/test-auth/enter'),
      }),
      storageState: vi.fn().mockResolvedValue(storageState),
    };
    const browser = {
      close: vi.fn().mockResolvedValue(undefined),
      newContext: vi.fn().mockResolvedValue(context),
    };

    await expect(
      bootstrapPerformanceAuth(
        {
          baseUrl: 'http://127.0.0.1:4111',
          json: false,
          outPath: '/tmp/perf-auth.json',
          persona: 'creator-ready',
        },
        {
          launchBrowser: vi.fn().mockResolvedValue(browser),
          persistStorageState: vi.fn(),
        }
      )
    ).rejects.toThrow('Better Auth bootstrap entry route returned HTTP 403.');
  });

  it('fails when the persisted state has no Better Auth identity cookie', () => {
    expect(() =>
      validatePerformanceAuthStorageState(
        { cookies: [], origins: [] },
        'creator-ready'
      )
    ).toThrow('Better Auth bootstrap produced an empty cookie state.');
  });

  it('fails when a non-empty state omits the Better Auth actor identity', () => {
    expect(() =>
      validatePerformanceAuthStorageState(
        {
          ...storageState,
          cookies: storageState.cookies.filter(
            cookie => cookie.name !== '__e2e_test_user_id'
          ),
        },
        'creator-ready'
      )
    ).toThrow('Better Auth bootstrap did not persist __e2e_test_user_id.');
  });

  it('rejects a bypass-mode cookie in the Better Auth performance state', () => {
    expect(() =>
      validatePerformanceAuthStorageState(
        {
          ...storageState,
          cookies: [
            ...storageState.cookies,
            {
              name: '__e2e_test_mode',
              value: 'bypass-auth',
            },
          ],
        },
        'creator-ready'
      )
    ).toThrow(
      'Better Auth bootstrap must not persist bypass cookie __e2e_test_mode.'
    );
  });

  it('fails when state omits the signed Better Auth session cookie', () => {
    expect(() =>
      validatePerformanceAuthStorageState(
        {
          ...storageState,
          cookies: storageState.cookies.filter(
            cookie => cookie.name !== 'better-auth.session_token'
          ),
        },
        'creator-ready'
      )
    ).toThrow(
      'Better Auth bootstrap did not persist a signed Better Auth session cookie.'
    );
  });

  it('fails when Better Auth resolves a different current user', async () => {
    const context = {
      close: vi.fn().mockResolvedValue(undefined),
      newPage: vi.fn().mockResolvedValue({
        evaluate: vi.fn().mockResolvedValue({
          status: 200,
          userId: 'ba_user_other',
        }),
        goto: vi.fn().mockResolvedValue({ status: () => 303 }),
        url: vi.fn(() => 'http://127.0.0.1:4111/app/chat'),
      }),
      storageState: vi.fn().mockResolvedValue(storageState),
    };
    const browser = {
      close: vi.fn().mockResolvedValue(undefined),
      newContext: vi.fn().mockResolvedValue(context),
    };

    await expect(
      bootstrapPerformanceAuth(
        {
          baseUrl: 'http://127.0.0.1:4111',
          json: false,
          outPath: '/tmp/perf-auth.json',
          persona: 'creator-ready',
        },
        {
          launchBrowser: vi.fn().mockResolvedValue(browser),
          persistStorageState: vi.fn(),
        }
      )
    ).rejects.toThrow(
      'Better Auth session resolved ba_user_other instead of ba_user_123.'
    );
  });
});
