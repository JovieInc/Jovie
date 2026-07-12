/**
 * Regression tests for the 14-day reverse-trial activation guard.
 *
 * activateTrial's WHERE clause is the only thing preventing:
 * - a paying Pro/Max user having their plan overwritten to 'trial' when they
 *   re-enter onboarding (losing paid entitlements + resetting the 50-fan
 *   notification cap), and
 * - an expired-trial user resetting their trial window indefinitely.
 *
 * These tests pin the eligibility guards at the query level so removing any
 * one of them fails deterministically.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDbUpdate,
  mockDbSelect,
  mockLoggerInfo,
  mockLoggerWarn,
  mockLoggerError,
} = vi.hoisted(() => ({
  mockDbUpdate: vi.fn(),
  mockDbSelect: vi.fn(),
  mockLoggerInfo: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockLoggerError: vi.fn(),
}));

vi.mock('server-only', () => ({}));

vi.mock('@/lib/db', () => ({
  db: {
    update: mockDbUpdate,
    select: mockDbSelect,
  },
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: {
    id: 'users.id',
    isPro: 'users.isPro',
    plan: 'users.plan',
    trialStartedAt: 'users.trialStartedAt',
    trialEndsAt: 'users.trialEndsAt',
    trialNotificationsSent: 'users.trialNotificationsSent',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ _type: 'and', args })),
  eq: vi.fn((a: unknown, b: unknown) => ({ _type: 'eq', a, b })),
  isNull: vi.fn((a: unknown) => ({ _type: 'isNull', a })),
  or: vi.fn((...args: unknown[]) => ({ _type: 'or', args })),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    error: mockLoggerError,
  },
}));

import { activateTrial } from '@/app/onboarding/actions/activate-trial';

/** The guard tree the WHERE clause must contain to be safe. */
const EXPECTED_WHERE = {
  _type: 'and',
  args: [
    { _type: 'eq', a: 'users.id', b: 'app-user-uuid' },
    {
      _type: 'or',
      args: [
        { _type: 'eq', a: 'users.plan', b: 'free' },
        { _type: 'isNull', a: 'users.plan' },
      ],
    },
    {
      _type: 'or',
      args: [
        { _type: 'eq', a: 'users.isPro', b: false },
        { _type: 'isNull', a: 'users.isPro' },
      ],
    },
    { _type: 'isNull', a: 'users.trialStartedAt' },
    { _type: 'isNull', a: 'users.trialEndsAt' },
  ],
};

type GuardNode =
  | { _type: 'and' | 'or'; args: GuardNode[] }
  | { _type: 'eq'; a: string; b: unknown }
  | { _type: 'isNull'; a: string };

function matchesGuard(node: GuardNode, row: Record<string, unknown>): boolean {
  if (node._type === 'and')
    return node.args.every(arg => matchesGuard(arg, row));
  if (node._type === 'or') return node.args.some(arg => matchesGuard(arg, row));
  if (node._type === 'isNull') return row[node.a] == null;
  return row[node.a] === node.b;
}

function updateChain(returned: unknown[]) {
  const returning = vi.fn().mockResolvedValue(returned);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  mockDbUpdate.mockReturnValue({ set });
  return { set, where, returning };
}

function selectChain(returned: unknown[]) {
  const limit = vi.fn().mockResolvedValue(returned);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  mockDbSelect.mockReturnValue({ from });
  return { from, where, limit };
}

describe('activateTrial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-09T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('activates a 14-day trial for an eligible free user', async () => {
    const { set, where } = updateChain([{ id: 'u1', plan: 'trial' }]);

    await expect(activateTrial('app-user-uuid')).resolves.toBe(true);

    expect(set).toHaveBeenCalledWith({
      plan: 'trial',
      trialStartedAt: new Date('2026-07-09T12:00:00.000Z'),
      trialEndsAt: new Date('2026-07-23T12:00:00.000Z'),
      trialNotificationsSent: 0,
    });
    expect(where).toHaveBeenCalledWith(EXPECTED_WHERE);
    expect(mockLoggerWarn).not.toHaveBeenCalled();
  });

  it('activates for a legacy user with a null plan and no paid flag', async () => {
    const { where } = updateChain([{ id: 'u1', plan: 'trial' }]);

    await expect(activateTrial('app-user-uuid')).resolves.toBe(true);

    const [condition] = where.mock.calls[0] as [GuardNode];
    expect(
      matchesGuard(condition, {
        'users.id': 'app-user-uuid',
        'users.plan': null,
        'users.isPro': null,
        'users.trialStartedAt': null,
        'users.trialEndsAt': null,
      })
    ).toBe(true);
  });

  it('denies a legacy paid user when the plan is null', async () => {
    const { where } = updateChain([]);
    selectChain([{ id: 'u1' }]);

    await expect(activateTrial('app-user-uuid')).resolves.toBe(false);

    const [condition] = where.mock.calls[0] as [GuardNode];
    expect(
      matchesGuard(condition, {
        'users.id': 'app-user-uuid',
        'users.plan': null,
        'users.isPro': true,
        'users.trialStartedAt': null,
        'users.trialEndsAt': null,
      })
    ).toBe(false);
  });

  it('guards the WHERE clause against paid plans and prior trials', async () => {
    const { where } = updateChain([{ id: 'u1', plan: 'trial' }]);

    await activateTrial('app-user-uuid');

    // Pin each guard individually so a partial removal also fails.
    const [condition] = where.mock.calls[0] as [typeof EXPECTED_WHERE];
    expect(condition._type).toBe('and');
    expect(condition.args).toContainEqual({
      _type: 'eq',
      a: 'users.id',
      b: 'app-user-uuid',
    });
    expect(condition.args).toContainEqual(EXPECTED_WHERE.args[1]);
    expect(condition.args).toContainEqual(EXPECTED_WHERE.args[2]);
    expect(condition.args).toContainEqual({
      _type: 'isNull',
      a: 'users.trialStartedAt',
    });
    expect(condition.args).toContainEqual({
      _type: 'isNull',
      a: 'users.trialEndsAt',
    });
  });

  it('skips without warning when the user exists but is not eligible (paid or already trialed)', async () => {
    updateChain([]);
    selectChain([{ id: 'u1' }]);

    await expect(activateTrial('app-user-uuid')).resolves.toBe(false);

    expect(mockLoggerWarn).not.toHaveBeenCalled();
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      'Trial activation skipped: not eligible',
      { appUserId: 'app-user-uuid' }
    );
  });

  it('warns when the user row is genuinely missing', async () => {
    updateChain([]);
    selectChain([]);

    await expect(activateTrial('app-user-uuid')).resolves.toBe(false);

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'Trial activation: user not found',
      { appUserId: 'app-user-uuid' }
    );
  });

  it('returns false and logs when the update throws', async () => {
    const boom = new Error('db down');
    mockDbUpdate.mockImplementation(() => {
      throw boom;
    });

    await expect(activateTrial('app-user-uuid')).resolves.toBe(false);

    expect(mockLoggerError).toHaveBeenCalledWith('Trial activation failed', {
      appUserId: 'app-user-uuid',
      error: boom,
    });
  });
});
