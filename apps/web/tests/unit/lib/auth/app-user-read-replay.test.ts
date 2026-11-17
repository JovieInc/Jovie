import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Bounded read replay for the auth-identity user lookups (JOV-12488/12492,
 * Sentry 7846802336): `getAppUserById` / `getAppUserByBetterAuthId` are
 * single indexed SELECTs on `users`, so a transient Neon transport kill is
 * replayed once under the canonical read policy. Non-transport errors are
 * never replayed or swallowed.
 */

type QueryOutcome = () => { rows?: unknown[]; error?: unknown };

const { outcomes, selectMock } = vi.hoisted(() => {
  const outcomes: QueryOutcome[] = [];

  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.from = chain;
  builder.where = chain;
  builder.limit = chain;
  builder.then = (
    onFulfilled?: (value: unknown) => unknown,
    onRejected?: (reason: unknown) => unknown
  ) => {
    let settled: Promise<unknown>;
    const outcome: QueryOutcome = outcomes.shift() ?? (() => ({ rows: [] }));
    try {
      const result = outcome();
      if (result.error) {
        settled = Promise.reject(result.error);
      } else {
        settled = Promise.resolve(result.rows ?? []);
      }
    } catch (error) {
      settled = Promise.reject(error);
    }
    return settled.then(onFulfilled, onRejected);
  };

  return {
    outcomes,
    selectMock: vi.fn(() => builder),
  };
});

vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    // Pass-through: each call re-runs so the replay is directly observable.
    cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
  };
});

vi.mock('@/lib/db', () => ({
  db: {
    select: selectMock,
  },
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: { id: 'id', betterAuthUserId: 'betterAuthUserId' },
}));

const ok =
  (rows: unknown[]): QueryOutcome =>
  () => ({ rows });
const fail =
  (error: unknown): QueryOutcome =>
  () => ({ error });

const appUserRow = {
  id: 'user_db_1',
  email: 'user@example.com',
  betterAuthUserId: 'ba_user_1',
  userStatus: 'active',
  deletedAt: null,
};

describe('auth user lookup read replay (JOV-12488/12492)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    outcomes.length = 0;
  });

  it('replays a transport-killed better-auth-id lookup once', async () => {
    const { getAppUserByBetterAuthId } = await import('@/lib/auth/app-user');

    outcomes.push(
      fail(new Error('Connection terminated unexpectedly')),
      ok([appUserRow])
    );

    await expect(getAppUserByBetterAuthId('ba_user_1')).resolves.toMatchObject({
      id: 'user_db_1',
    });
    expect(selectMock).toHaveBeenCalledTimes(2);
  });

  it('replays a transport-killed id lookup once', async () => {
    const { getAppUserById } = await import('@/lib/auth/app-user');

    outcomes.push(
      fail(new Error('Connection terminated unexpectedly')),
      ok([appUserRow])
    );

    await expect(getAppUserById('user_db_1')).resolves.toMatchObject({
      id: 'user_db_1',
    });
    expect(selectMock).toHaveBeenCalledTimes(2);
  });

  it('does not replay non-transport lookup failures (guardrail)', async () => {
    const { getAppUserByBetterAuthId } = await import('@/lib/auth/app-user');

    outcomes.push(fail(new Error('relation "users" does not exist')));

    await expect(getAppUserByBetterAuthId('ba_user_1')).rejects.toThrow(
      'relation "users" does not exist'
    );
    expect(selectMock).toHaveBeenCalledTimes(1);
  });

  it('returns null when the lookup finds no row', async () => {
    const { getAppUserByBetterAuthId } = await import('@/lib/auth/app-user');

    outcomes.push(ok([]));

    await expect(getAppUserByBetterAuthId('ba_missing')).resolves.toBeNull();
  });
});
