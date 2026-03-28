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

  it('resolves the latest seeded release task route for the active creator profile', async () => {
    const route = {
      path: '/app/dashboard/releases/[releaseId]/tasks',
    } as PerfRouteDefinition;

    await expect(resolveReleaseTasksPerfPath(route)).resolves.toBe(
      '/app/dashboard/releases/release_456/tasks'
    );
  });
});
