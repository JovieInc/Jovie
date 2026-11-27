import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  profileId: 'profile-A',
  contextReads: 0,
  executions: [] as unknown[],
}));
vi.mock('@/lib/redis', () => ({ getRedis: () => null }));
vi.mock('@/lib/error-tracking', () => ({ captureWarning: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({ addBreadcrumb: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({
  getSessionContext: async () => {
    state.contextReads++;
    return {
      user: { id: '11111111-1111-4111-8111-111111111111' },
      profile: {
        id: state.profileId,
        userId: '11111111-1111-4111-8111-111111111111',
      },
    };
  },
  setupDbSession: vi.fn(),
}));
vi.mock('@/lib/db/query-timeout', () => ({
  dashboardQuery: async (operation: () => Promise<unknown>) => operation(),
  apiQuery: async (operation: () => Promise<unknown>) => operation(),
}));
vi.mock('@/lib/db', () => {
  const builder = {
    from: () => builder,
    leftJoin: () => builder,
    where: (predicate: unknown) => {
      if (predicate) state.executions.push(predicate);
      return builder;
    },
    orderBy: () => builder,
    limit: async () => {
      return [
        {
          userId: '11111111-1111-4111-8111-111111111111',
          profileId: state.profileId,
          profileSettings: {},
        },
      ];
    },
  };
  return {
    db: {
      select: () => builder,
      execute: async (query: unknown) => {
        state.executions.push(query);
        return { rows: [{ total_views: 101 }] };
      },
    },
    doesTableExist: async () => true,
    TABLE_NAMES: { dailyProfileViews: 'daily_profile_views' },
    applyRlsSessionUser: vi.fn(),
    applyRlsTransactionUser: vi.fn(),
    getRlsTransactionSessionSetSql: vi.fn(),
    resetRlsSession: vi.fn(),
  };
});

beforeEach(() => {
  vi.resetModules();
  state.profileId = 'profile-A';
  state.contextReads = 0;
  state.executions = [];
});

it('the actual dashboard domain loader uses the captured profile without resolving active profile again', async () => {
  const { resolveAuthorizedAnalyticsProfile } = await import(
    '@/lib/analytics/authorized-profile'
  );
  const scope = await resolveAuthorizedAnalyticsProfile(
    '11111111-1111-4111-8111-111111111111'
  );
  state.profileId = 'profile-B';
  state.executions = [];
  const { getDashboardAnalyticsForProfile } = await import(
    '@/lib/db/queries/analytics'
  );
  expect(
    (await getDashboardAnalyticsForProfile(scope, '30d', 'traffic'))
      .profile_views
  ).toBe(101);
  expect(state.contextReads).toBe(1);
  const parameters = state.executions.flatMap(
    query =>
      new PgDialect().sqlToQuery(
        query as Parameters<PgDialect['sqlToQuery']>[0]
      ).params
  );
  expect(parameters).toContain('profile-A');
  expect(parameters).not.toContain('profile-B');
});

it('the legacy dashboard loader keeps its explicit-user signature with one context lookup', async () => {
  const { getUserDashboardAnalytics } = await import(
    '@/lib/db/queries/analytics'
  );
  expect(
    (
      await getUserDashboardAnalytics(
        '11111111-1111-4111-8111-111111111111',
        '30d',
        'traffic'
      )
    ).profile_views
  ).toBe(101);
  expect(state.contextReads).toBe(1);
});
