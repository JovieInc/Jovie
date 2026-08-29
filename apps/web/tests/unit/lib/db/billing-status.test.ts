import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDbExecute } = vi.hoisted(() => ({
  mockDbExecute: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({
  db: { execute: mockDbExecute },
}));

import {
  type AtomicBillingUpdateInput,
  applyBillingUpdateWithAudit,
} from '@/lib/db/billing-status';

const input: AtomicBillingUpdateInput = {
  userId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
  userIdentity: 'user_legacy_or_app_uuid',
  expectedBillingVersion: 7,
  isPro: true,
  plan: 'pro',
  billingUpdatedAt: new Date('2026-08-29T09:30:00.000Z'),
  stripeCustomerId: 'cus_atomic',
  stripeSubscriptionId: 'sub_atomic',
  stripePriceId: 'price_atomic',
  lastBillingEventAt: new Date('2026-08-29T09:29:00.000Z'),
  eventType: 'subscription_created',
  previousState: { isPro: false, plan: 'free' },
  newState: { isPro: true, plan: 'pro' },
  stripeEventId: 'evt_atomic',
  source: 'webhook',
  metadata: { subscriptionStatus: 'active' },
};

describe('applyBillingUpdateWithAudit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('persists the entitlement update and audit receipt in one statement', async () => {
    mockDbExecute.mockResolvedValue({
      rows: [
        {
          appUserId: input.userId,
          billingVersion: 8,
        },
      ],
    });

    const result = await applyBillingUpdateWithAudit(input);

    expect(result).toEqual({
      appUserId: input.userId,
      billingVersion: 8,
    });
    expect(mockDbExecute).toHaveBeenCalledOnce();

    const statement = mockDbExecute.mock.calls[0]?.[0];
    const query = new PgDialect().sqlToQuery(statement);
    expect(query.sql.toLowerCase()).toContain('with updated_user as');
    expect(query.sql.toLowerCase()).toContain('update "users"');
    expect(query.sql).not.toMatch(/set\s+"users"\./i);
    expect(query.sql.toLowerCase()).toContain(
      'insert into "billing_audit_log"'
    );
    expect(query.sql.toLowerCase()).toContain('inner join inserted_audit');
    expect(query.params).toContain(input.userId);
    expect(query.params).toContain(input.expectedBillingVersion);
    expect(query.params).toContain(input.stripeEventId);

    const auditMetadata = query.params.find(
      value => typeof value === 'string' && value.includes('"clerkUserId"')
    );
    expect(JSON.parse(String(auditMetadata))).toEqual({
      subscriptionStatus: 'active',
      clerkUserId: input.userIdentity,
      billingVersion: 8,
    });
  });

  it('returns null when the optimistic update changes no row', async () => {
    mockDbExecute.mockResolvedValue({ rows: [] });

    await expect(applyBillingUpdateWithAudit(input)).resolves.toBeNull();
    expect(mockDbExecute).toHaveBeenCalledOnce();
  });

  it('preserves omitted Stripe fields and records retry metadata', async () => {
    const retryInput: AtomicBillingUpdateInput = {
      userId: input.userId,
      userIdentity: input.userIdentity,
      expectedBillingVersion: input.expectedBillingVersion,
      isPro: input.isPro,
      plan: input.plan,
      billingUpdatedAt: input.billingUpdatedAt,
      eventType: input.eventType,
      previousState: input.previousState,
      newState: input.newState,
      source: input.source,
      metadata: input.metadata,
      retried: true,
      retryCount: 2,
    };
    mockDbExecute.mockResolvedValue({
      rows: [{ appUserId: input.userId, billingVersion: 8 }],
    });

    await applyBillingUpdateWithAudit(retryInput);

    const query = new PgDialect().sqlToQuery(mockDbExecute.mock.calls[0]?.[0]);
    const auditMetadata = query.params.find(
      value => typeof value === 'string' && value.includes('"retryCount"')
    );
    expect(JSON.parse(String(auditMetadata))).toEqual({
      subscriptionStatus: 'active',
      clerkUserId: input.userIdentity,
      billingVersion: 8,
      retried: true,
      retryCount: 2,
    });
    expect(query.params.filter(value => value === true).length).toBeGreaterThan(
      3
    );
  });

  it('propagates statement failure without a second persistence call', async () => {
    mockDbExecute.mockRejectedValue(new Error('audit unavailable'));

    await expect(applyBillingUpdateWithAudit(input)).rejects.toThrow(
      'audit unavailable'
    );
    expect(mockDbExecute).toHaveBeenCalledOnce();
  });
});
