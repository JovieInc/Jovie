import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe('performance-route-resolvers', () => {
  it('recovers when the release lookup hangs', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://test');
    vi.stubEnv('E2E_CLERK_USER_ID', 'clerk_test_user');
    vi.stubEnv('PERF_ROUTE_DB_TIMEOUT_MS', '10');

    const sqlMock = vi.fn((strings: TemplateStringsArray) => {
      const query = strings.join(' ');

      if (query.includes('from users u')) {
        return Promise.resolve([
          {
            id: 'profile_123',
            username_normalized: 'musicmaker',
          },
        ]);
      }

      if (query.includes('order by release_date desc nulls last')) {
        return new Promise<never>(() => undefined);
      }

      if (query.includes('and slug =')) {
        return Promise.resolve([] as Array<{ id: string }>);
      }

      if (query.includes('insert into discog_releases')) {
        return Promise.resolve([{ id: 'release_123' }]);
      }

      throw new Error(`Unexpected query: ${query}`);
    });

    vi.doMock('@neondatabase/serverless', () => ({
      neon: vi.fn(() => sqlMock),
    }));
    vi.doMock('@playwright/test', () => ({
      chromium: {
        launch: vi.fn(),
      },
    }));

    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const { resolveReleaseTasksPerfPath } = await import(
      '../../scripts/performance-route-resolvers'
    );

    const resolvedPath = await resolveReleaseTasksPerfPath(
      {
        id: 'route-qa-release-tasks',
        path: '/app/releases/[releaseId]/tasks',
      } as never,
      {
        authCookies: [],
        baseUrl: 'http://127.0.0.1:3000',
      } as never
    );

    expect(resolvedPath).toBe('/app/releases/release_123/tasks');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'resolveReleaseTasksPerfPath.select(profile_123) timed out'
      )
    );
  });
});
