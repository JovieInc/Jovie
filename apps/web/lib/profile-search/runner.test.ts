import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rollout: vi.fn(),
  health: vi.fn(),
  execute: vi.fn(),
  reserve: vi.fn(),
  search: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/flags/server', () => ({ getAppFlagValue: mocks.rollout }));
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: mocks.health }) }),
    }),
    execute: mocks.execute,
  },
}));
vi.mock('./budget', () => ({ reserveProfileSearchAttempt: mocks.reserve }));
vi.mock('./google-serpapi', () => ({
  GoogleSerpApiProvider: class {
    id = 'google_serpapi';
    search = mocks.search;
  },
}));

import { runScopedProfileSearchMonitoring } from './runner';

const scope = {
  creatorProfileId: '11111111-1111-4111-8111-111111111111',
  queryId: '22222222-2222-4222-8222-222222222222',
  queryText: 'Tim White',
  market: 'US',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rollout.mockResolvedValue(true);
  mocks.health.mockResolvedValue([{ enabled: true }]);
  mocks.execute.mockResolvedValue({ rows: [] });
});

describe('scoped monitoring adapter', () => {
  it('never falls back to an unscoped claim when the target is unavailable', async () => {
    const result = await runScopedProfileSearchMonitoring(
      Date.now() + 60_000,
      scope
    );
    expect(result).toMatchObject({ enabled: true, claimed: 0, attempted: 0 });
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    const compiled = new PgDialect().sqlToQuery(mocks.execute.mock.calls[0][0]);
    expect(compiled.params).toEqual([
      'google_serpapi',
      scope.creatorProfileId,
      scope.queryId,
      scope.queryText,
      scope.market,
      120,
    ]);
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it('preserves both rollout and provider health gates before leasing', async () => {
    mocks.rollout.mockResolvedValue(false);
    expect(
      await runScopedProfileSearchMonitoring(Date.now() + 60_000, scope)
    ).toMatchObject({ enabled: false, attempted: 0 });
    expect(mocks.health).not.toHaveBeenCalled();
    mocks.rollout.mockResolvedValue(true);
    mocks.health.mockResolvedValue([{ enabled: false }]);
    expect(
      await runScopedProfileSearchMonitoring(Date.now() + 60_000, scope)
    ).toMatchObject({ enabled: false, attempted: 0 });
    mocks.health.mockRejectedValue(new Error('database unavailable'));
    expect(
      await runScopedProfileSearchMonitoring(Date.now() + 60_000, scope)
    ).toMatchObject({ enabled: false, attempted: 0 });
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it('rejects a missing scope before touching the database or provider', () => {
    expect(() =>
      runScopedProfileSearchMonitoring(
        Date.now() + 60_000,
        undefined as unknown as typeof scope
      )
    ).toThrow();
    expect(mocks.rollout).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.search).not.toHaveBeenCalled();
  });
});
