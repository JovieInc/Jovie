import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PerfRouteDefinition } from './performance-route-manifest';

const resolverMocks = vi.hoisted(() => {
  const sql = vi.fn();
  return {
    chromiumLaunch: vi.fn(),
    neon: vi.fn(() => sql),
    sql,
  };
});

vi.mock('@neondatabase/serverless', () => ({
  neon: resolverMocks.neon,
}));

vi.mock('@playwright/test', () => ({
  chromium: {
    launch: resolverMocks.chromiumLaunch,
  },
}));

import {
  resolveChatConversationPerfPath,
  resolveReleaseTasksPerfPath,
  resolveSeededProfilePath,
} from './performance-route-resolvers';

describe('performance route resolvers', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('DATABASE_URL', 'postgres://example');
    vi.stubEnv('E2E_CLERK_USER_ID', 'user_test_123');
    vi.stubEnv('PERF_ROUTE_MUSIC_HANDLE', 'dualipa');

    resolverMocks.chromiumLaunch.mockReset();
    resolverMocks.neon.mockClear();
    resolverMocks.sql.mockReset();
    resolverMocks.chromiumLaunch.mockResolvedValue({
      close: vi.fn().mockResolvedValue(undefined),
      newContext: vi.fn().mockResolvedValue({
        addCookies: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        newPage: vi.fn().mockResolvedValue({
          evaluate: vi.fn(),
          goto: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    });
    resolverMocks.sql.mockImplementation(
      async (
        strings: TemplateStringsArray,
        ...values: readonly unknown[]
      ): Promise<readonly Record<string, string>[]> => {
        const query = strings.join(' ').replace(/\s+/g, ' ').trim();

        if (query.includes('from creator_profiles')) {
          const handle = String(values[0] ?? '');
          if (handle === 'tim') {
            return [];
          }

          return [{ username_normalized: handle }];
        }

        if (query.includes('from users u')) {
          return [{ id: 'profile_123', username_normalized: 'musicmaker' }];
        }

        if (query.includes('from chat_conversations')) {
          return [{ id: 'conv_123' }];
        }

        if (query.includes('from discog_releases')) {
          return [{ id: 'release_456' }];
        }

        return [];
      }
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('falls back to the canonical music handle when the founder profile is missing', async () => {
    const route = {
      path: '/[username]/about',
      seedProfile: 'tim',
    } as PerfRouteDefinition;

    await expect(resolveSeededProfilePath(route)).resolves.toBe(
      '/dualipa/about'
    );
  });

  it('resolves an existing chat thread for the active creator profile', async () => {
    const route = {
      path: '/app/chat/[id]',
    } as PerfRouteDefinition;

    await expect(
      resolveChatConversationPerfPath(route, {
        authCookies: [],
        baseUrl: 'http://127.0.0.1:4100',
      })
    ).resolves.toBe('/app/chat/conv_123');
  });

  it('uses the auth bypass cookie when E2E_CLERK_USER_ID is missing for chat routes', async () => {
    vi.stubEnv('E2E_CLERK_USER_ID', '');
    const route = {
      path: '/app/chat/[id]',
    } as PerfRouteDefinition;
    await expect(
      resolveChatConversationPerfPath(route, {
        authCookies: [
          {
            domain: '127.0.0.1',
            name: '__e2e_test_user_id',
            path: '/',
            value: 'user_cookie_123',
          },
        ],
        baseUrl: 'http://127.0.0.1:4100',
      })
    ).resolves.toBe('/app/chat/conv_123');
  });

  it('creates a chat thread via an authenticated app page when no thread exists yet', async () => {
    resolverMocks.sql.mockImplementation(
      async (
        strings: TemplateStringsArray,
        ...values: readonly unknown[]
      ): Promise<readonly Record<string, string>[]> => {
        const query = strings.join(' ').replace(/\s+/g, ' ').trim();

        if (query.includes('from users u')) {
          return [{ id: 'profile_123', username_normalized: 'musicmaker' }];
        }

        if (query.includes('from chat_conversations')) {
          return [];
        }

        return [];
      }
    );

    const evaluate = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('conv_created');
    const goto = vi.fn().mockResolvedValue(undefined);
    const addCookies = vi.fn().mockResolvedValue(undefined);
    const contextClose = vi.fn().mockResolvedValue(undefined);
    const browserClose = vi.fn().mockResolvedValue(undefined);

    resolverMocks.chromiumLaunch.mockResolvedValue({
      close: browserClose,
      newContext: vi.fn().mockResolvedValue({
        addCookies,
        close: contextClose,
        newPage: vi.fn().mockResolvedValue({
          evaluate,
          goto,
        }),
      }),
    });

    const route = {
      path: '/app/chat/[id]',
    } as PerfRouteDefinition;

    await expect(
      resolveChatConversationPerfPath(route, {
        authCookies: [
          {
            domain: '127.0.0.1',
            name: 'session',
            path: '/',
            value: 'cookie',
          },
        ],
        baseUrl: 'http://127.0.0.1:4100',
      })
    ).resolves.toBe('/app/chat/conv_created');

    expect(addCookies).toHaveBeenCalledOnce();
    expect(goto).toHaveBeenCalledWith('http://127.0.0.1:4100/app/chat', {
      waitUntil: 'domcontentloaded',
    });
    expect(evaluate).toHaveBeenCalledTimes(2);
    expect(contextClose).toHaveBeenCalledOnce();
    expect(browserClose).toHaveBeenCalledOnce();
  });

  it('resolves the latest seeded release task route for the active creator profile', async () => {
    const route = {
      path: '/app/dashboard/releases/[releaseId]/tasks',
    } as PerfRouteDefinition;

    await expect(
      resolveReleaseTasksPerfPath(route, {
        authCookies: [],
        baseUrl: 'http://127.0.0.1:4100',
      })
    ).resolves.toBe('/app/dashboard/releases/release_456/tasks');
  });

  it('uses the auth bypass cookie when E2E_CLERK_USER_ID is missing for release task routes', async () => {
    vi.stubEnv('E2E_CLERK_USER_ID', '');
    const route = {
      path: '/app/dashboard/releases/[releaseId]/tasks',
    } as PerfRouteDefinition;
    await expect(
      resolveReleaseTasksPerfPath(route, {
        authCookies: [
          {
            domain: '127.0.0.1',
            name: '__e2e_test_user_id',
            path: '/',
            value: 'user_cookie_123',
          },
        ],
        baseUrl: 'http://127.0.0.1:4100',
      })
    ).resolves.toBe('/app/dashboard/releases/release_456/tasks');
  });

  it('creates a lightweight perf release when the active profile has no releases yet', async () => {
    resolverMocks.sql.mockImplementation(
      async (
        strings: TemplateStringsArray
      ): Promise<readonly Record<string, string>[]> => {
        const query = strings.join(' ').replace(/\s+/g, ' ').trim();

        if (query.includes('from users u')) {
          return [{ id: 'profile_123', username_normalized: 'musicmaker' }];
        }

        if (
          query.includes('from discog_releases') ||
          query.includes('where creator_profile_id')
        ) {
          return [];
        }

        if (query.includes('insert into discog_releases')) {
          return [{ id: 'release_perf_123' }];
        }

        return [];
      }
    );

    const route = {
      path: '/app/dashboard/releases/[releaseId]/tasks',
    } as PerfRouteDefinition;

    await expect(
      resolveReleaseTasksPerfPath(route, {
        authCookies: [],
        baseUrl: 'http://127.0.0.1:4100',
      })
    ).resolves.toBe('/app/dashboard/releases/release_perf_123/tasks');
  });

  it('falls back to the authenticated releases UI when DB release lookup is unavailable', async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('DATABASE_URL', ''); // Doppler injects a real DATABASE_URL; explicitly clear to simulate unavailability

    const click = vi.fn().mockResolvedValue(undefined);
    const goto = vi.fn().mockResolvedValue(undefined);
    const getAttribute = vi
      .fn()
      .mockResolvedValue('mobile-release-row-release_987');
    const locator = vi.fn(() => ({
      first: () => ({
        getAttribute,
      }),
    }));
    const setViewportSize = vi.fn().mockResolvedValue(undefined);
    const viewportSize = vi.fn(() => ({ width: 1280, height: 720 }));
    const waitForLoadState = vi.fn().mockResolvedValue(undefined);
    const waitForSelector = vi.fn().mockResolvedValue(undefined);
    const waitForURL = vi.fn().mockResolvedValue(undefined);
    const addCookies = vi.fn().mockResolvedValue(undefined);
    const contextClose = vi.fn().mockResolvedValue(undefined);
    const browserClose = vi.fn().mockResolvedValue(undefined);

    resolverMocks.chromiumLaunch.mockResolvedValue({
      close: browserClose,
      newContext: vi.fn().mockResolvedValue({
        addCookies,
        close: contextClose,
        newPage: vi.fn().mockResolvedValue({
          click,
          evaluate: vi.fn().mockResolvedValue(null),
          goto,
          locator,
          setViewportSize,
          url: vi.fn(
            () =>
              'http://127.0.0.1:4100/app/dashboard/releases/release_987/tasks'
          ),
          viewportSize,
          waitForLoadState,
          waitForSelector,
          waitForURL,
        }),
      }),
    });

    const route = {
      path: '/app/dashboard/releases/[releaseId]/tasks',
    } as PerfRouteDefinition;

    await expect(
      resolveReleaseTasksPerfPath(route, {
        authCookies: [
          {
            domain: '127.0.0.1',
            name: 'session',
            path: '/',
            value: 'cookie',
          },
        ],
        baseUrl: 'http://127.0.0.1:4100',
      })
    ).resolves.toBe('/app/dashboard/releases/release_987/tasks');

    expect(addCookies).toHaveBeenCalledOnce();
    expect(goto).toHaveBeenCalledWith(
      'http://127.0.0.1:4100/app/dashboard/releases',
      {
        waitUntil: 'domcontentloaded',
      }
    );
    expect(waitForLoadState).toHaveBeenCalledWith('domcontentloaded', {
      timeout: 10_000,
    });
    expect(setViewportSize).toHaveBeenNthCalledWith(1, {
      width: 390,
      height: 720,
    });
    expect(locator).toHaveBeenCalledWith(
      '[data-testid^="mobile-release-row-"]'
    );
    expect(setViewportSize).toHaveBeenNthCalledWith(2, {
      width: 1280,
      height: 720,
    });
    expect(click).not.toHaveBeenCalled();
    expect(waitForSelector).not.toHaveBeenCalled();
    expect(waitForURL).not.toHaveBeenCalled();
    expect(contextClose).toHaveBeenCalledOnce();
    expect(browserClose).toHaveBeenCalledOnce();
  });

  it('fails closed when the app fallback cannot resolve a release tasks route', async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('DATABASE_URL', '');

    const addCookies = vi.fn().mockResolvedValue(undefined);
    const contextClose = vi.fn().mockResolvedValue(undefined);
    const browserClose = vi.fn().mockResolvedValue(undefined);

    resolverMocks.chromiumLaunch.mockResolvedValue({
      close: browserClose,
      newContext: vi.fn().mockResolvedValue({
        addCookies,
        close: contextClose,
        newPage: vi.fn().mockResolvedValue({
          goto: vi.fn().mockResolvedValue(undefined),
          locator: vi.fn(() => ({
            first: () => ({
              getAttribute: vi.fn().mockResolvedValue(null),
            }),
          })),
          setViewportSize: vi.fn().mockResolvedValue(undefined),
          url: vi.fn(() => 'http://127.0.0.1:4100/app/dashboard/releases'),
          viewportSize: vi.fn(() => ({ width: 1280, height: 720 })),
          waitForLoadState: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    });

    const route = {
      path: '/app/dashboard/releases/[releaseId]/tasks',
    } as PerfRouteDefinition;

    await expect(
      resolveReleaseTasksPerfPath(route, {
        authCookies: [
          {
            domain: '127.0.0.1',
            name: 'session',
            path: '/',
            value: 'cookie',
          },
        ],
        baseUrl: 'http://127.0.0.1:4100',
      })
    ).rejects.toThrow(
      'Release tasks require either DATABASE_URL with a resolvable active profile or authenticated authCookies for the app fallback.'
    );

    expect(addCookies).toHaveBeenCalledOnce();
    expect(contextClose).toHaveBeenCalledOnce();
    expect(browserClose).toHaveBeenCalledOnce();
  });
});
