import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  owner: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
  returning: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ db: { update: mocks.update } }));
vi.mock('@/lib/entitlements/creator-plan', () => ({
  getCreatorOwnerUserId: mocks.owner,
}));

import { TRIAL_NOTIFICATION_RECIPIENT_LIMIT } from '@/lib/entitlements/registry';
import { reserveTrialFanEmail } from '@/lib/notifications/quota';

const dialect = new PgDialect();
describe('lifetime trial fan email reservation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.owner.mockResolvedValue('claimed-owner');
    mocks.update.mockReturnValue({ set: mocks.set });
    mocks.set.mockReturnValue({ where: mocks.where });
    mocks.where.mockReturnValue({ returning: mocks.returning });
    mocks.returning.mockResolvedValue([{ id: 'claimed-owner' }]);
  });

  it('reserves only an active trial with a known nonnegative counter below the canonical allowance', async () => {
    expect(await reserveTrialFanEmail('artist')).toBe(true);
    expect(mocks.owner).toHaveBeenCalledWith('artist');
    expect(mocks.update).toHaveBeenCalledOnce();
    const condition = dialect.sqlToQuery(mocks.where.mock.calls[0][0]);
    expect(condition.sql).toContain('"users"."id" = $1');
    expect(condition.sql).toContain('"users"."plan" = $2');
    expect(condition.sql).toContain('"users"."trial_ends_at" > $3');
    expect(condition.sql).toContain('"users"."trial_notifications_sent" >= $4');
    expect(condition.sql).toContain('"users"."trial_notifications_sent" < $5');
    expect(condition.params).toEqual([
      'claimed-owner',
      'trial',
      expect.any(String),
      0,
      TRIAL_NOTIFICATION_RECIPIENT_LIMIT,
    ]);
    const changes = mocks.set.mock.calls[0][0];
    expect(dialect.sqlToQuery(changes.trialNotificationsSent).sql).toBe(
      '"users"."trial_notifications_sent" + 1'
    );
    expect(dialect.sqlToQuery(changes.billingVersion).sql).toBe(
      '"users"."billing_version" + 1'
    );
    expect(changes).not.toHaveProperty('trialEndsAt');
  });

  it('denies exhausted, expired, unknown or concurrently consumed allowance when the conditional update returns no row', async () => {
    mocks.returning.mockResolvedValue([]);
    expect(await reserveTrialFanEmail('artist')).toBe(false);
  });

  it('denies missing ownership without touching any counter', async () => {
    mocks.owner.mockResolvedValue(null);
    expect(await reserveTrialFanEmail('artist')).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('propagates persistence failure so the provider cannot be called', async () => {
    mocks.returning.mockRejectedValue(new Error('database unavailable'));
    await expect(reserveTrialFanEmail('artist')).rejects.toThrow(
      'database unavailable'
    );
  });
});
