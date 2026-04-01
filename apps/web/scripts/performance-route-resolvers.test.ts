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

  it('falls back to the authenticated releases UI when DB release lookup is unavailable', async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('DATABASE_URL', ''); // Doppler injects a real DATABASE_URL; explicitly clear to simulate unavailability

    const click = vi.fn().mockResolvedValue(undefined);
    const goto = vi.fn().mockResolvedValue(undefined);
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
          goto,
          url: vi.fn(
            () =>
              'http://127.0.0.1:4100/app/dashboard/releases/release_987/tasks'
          ),
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
    expect(waitForSelector).toHaveBeenNthCalledWith(
      1,
      '[data-testid="release-row"]',
      {
        timeout: 15_000,
      }
    );
    expect(waitForSelector).toHaveBeenNthCalledWith(
      2,
      '[data-testid="release-sidebar"]',
      {
        timeout: 15_000,
      }
    );
    expect(waitForSelector).toHaveBeenNthCalledWith(
      3,
      '[data-testid="release-tasks-card"]',
      {
        timeout: 15_000,
      }
    );
    expect(click).toHaveBeenNthCalledWith(1, '[data-testid="release-row"]');
    expect(click).toHaveBeenNthCalledWith(2, 'button:has-text("Tasks")');
    expect(click).toHaveBeenNthCalledWith(3, 'button:has-text("Open")');
    expect(waitForURL).toHaveBeenCalledWith('**/tasks', {
      timeout: 15_000,
    });
    expect(contextClose).toHaveBeenCalledOnce();
    expect(browserClose).toHaveBeenCalledOnce();
  });
});
