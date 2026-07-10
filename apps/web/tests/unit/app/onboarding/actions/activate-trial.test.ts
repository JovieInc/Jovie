import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  returning: vi.fn(),
  where: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    update: hoisted.update,
  },
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: {
    id: 'users.id',
    plan: 'users.plan',
    trialStartedAt: 'users.trialStartedAt',
    trialEndsAt: 'users.trialEndsAt',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions: unknown[]) => ({ conditions })),
  eq: vi.fn((left: unknown, right: unknown) => ({ kind: 'eq', left, right })),
  isNull: vi.fn(value => ({ kind: 'isNull', value })),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    error: vi.fn(),
    info: hoisted.loggerInfo,
    warn: hoisted.loggerWarn,
  },
}));

import { activateTrial } from '@/app/onboarding/actions/activate-trial';

describe('activateTrial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.where.mockReturnValue({ returning: hoisted.returning });
    hoisted.set.mockReturnValue({ where: hoisted.where });
    hoisted.update.mockReturnValue({ set: hoisted.set });
  });

  it('activates only the authenticated app user when free and never trialed', async () => {
    hoisted.returning.mockResolvedValue([
      { id: 'app-user-uuid', plan: 'trial' },
    ]);

    await expect(activateTrial('app-user-uuid')).resolves.toBe(true);

    expect(hoisted.where).toHaveBeenCalledWith({
      conditions: [
        { kind: 'eq', left: 'users.id', right: 'app-user-uuid' },
        { kind: 'eq', left: 'users.plan', right: 'free' },
        { kind: 'isNull', value: 'users.trialStartedAt' },
        { kind: 'isNull', value: 'users.trialEndsAt' },
      ],
    });
    expect(hoisted.set).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: 'trial',
        trialNotificationsSent: 0,
        trialStartedAt: expect.any(Date),
        trialEndsAt: expect.any(Date),
      })
    );
  });

  it('does not overwrite paid, active-trial, prior-trial, or missing users', async () => {
    hoisted.returning.mockResolvedValue([]);

    await expect(activateTrial('ineligible-user')).resolves.toBe(false);

    expect(hoisted.loggerWarn).toHaveBeenCalledWith(
      'Trial activation skipped: user ineligible or not found',
      { appUserId: 'ineligible-user' }
    );
  });
});
