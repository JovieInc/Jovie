import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
/* eslint-disable no-restricted-imports -- Integration test requires the real schema and database */
import type { NeonDatabase } from 'drizzle-orm/neon-serverless';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as schema from '@/lib/db/schema';
import { users } from '@/lib/db/schema/auth';
import { billingAuditLog } from '@/lib/db/schema/billing';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { setupDatabaseBeforeAll } from '../setup-db';

vi.mock('server-only', () => ({}));

import { applyBillingUpdateWithAudit } from '@/lib/db/billing-status';

type TestDb = NeonDatabase<typeof schema>;

setupDatabaseBeforeAll();

let db: TestDb;
const userIds = new Set<string>();
const profileIds = new Set<string>();

beforeAll(() => {
  const connection = (globalThis as typeof globalThis & { db?: TestDb }).db;
  if (!connection) {
    throw new Error(
      'Database connection not initialized for billing concurrency tests'
    );
  }
  db = connection;
});

afterEach(async () => {
  if (profileIds.size > 0) {
    await db
      .delete(creatorProfiles)
      .where(inArray(creatorProfiles.id, [...profileIds]));
  }
  if (userIds.size > 0) {
    await db.delete(users).where(inArray(users.id, [...userIds]));
  }
  profileIds.clear();
  userIds.clear();
});

describe('billing persistence concurrency (integration)', () => {
  it('allows only one profile to claim a Stripe Connect account', async () => {
    const suffix = randomUUID();
    const [profileA, profileB] = await db
      .insert(creatorProfiles)
      .values([
        {
          creatorType: 'artist',
          username: `stripe-a-${suffix}`,
          usernameNormalized: `stripe-a-${suffix}`,
        },
        {
          creatorType: 'artist',
          username: `stripe-b-${suffix}`,
          usernameNormalized: `stripe-b-${suffix}`,
        },
      ])
      .returning({ id: creatorProfiles.id });
    profileIds.add(profileA.id);
    profileIds.add(profileB.id);

    const stripeAccountId = `acct_concurrency_${suffix}`;
    const results = await Promise.allSettled([
      db
        .update(creatorProfiles)
        .set({ stripeAccountId })
        .where(eq(creatorProfiles.id, profileA.id)),
      db
        .update(creatorProfiles)
        .set({ stripeAccountId })
        .where(eq(creatorProfiles.id, profileB.id)),
    ]);

    expect(
      results.filter(result => result.status === 'fulfilled')
    ).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(
      1
    );

    const persisted = await db
      .select({ id: creatorProfiles.id })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.stripeAccountId, stripeAccountId));
    expect(persisted).toHaveLength(1);
  });

  it('prevents concurrent entitlement writers from losing an update', async () => {
    const suffix = randomUUID();
    const [user] = await db
      .insert(users)
      .values({
        email: `billing-concurrency-${suffix}@example.test`,
        userStatus: 'active',
      })
      .returning({ id: users.id, billingVersion: users.billingVersion });
    userIds.add(user.id);

    const base = {
      userId: user.id,
      userIdentity: user.id,
      expectedBillingVersion: user.billingVersion,
      billingUpdatedAt: new Date(),
      previousState: { isPro: false, plan: 'free' },
      source: 'integration-test',
      metadata: {},
    } as const;
    const results = await Promise.all([
      applyBillingUpdateWithAudit({
        ...base,
        isPro: true,
        plan: 'pro',
        eventType: 'concurrent_upgrade',
        newState: { isPro: true, plan: 'pro' },
      }),
      applyBillingUpdateWithAudit({
        ...base,
        isPro: false,
        plan: 'free',
        eventType: 'concurrent_downgrade',
        newState: { isPro: false, plan: 'free' },
      }),
    ]);

    expect(results.filter(result => result !== null)).toHaveLength(1);
    expect(results.filter(result => result === null)).toHaveLength(1);

    const [persisted] = await db
      .select({ billingVersion: users.billingVersion })
      .from(users)
      .where(eq(users.id, user.id));
    const auditRows = await db
      .select({ id: billingAuditLog.id })
      .from(billingAuditLog)
      .where(eq(billingAuditLog.userId, user.id));
    expect(persisted?.billingVersion).toBe(user.billingVersion + 1);
    expect(auditRows).toHaveLength(1);
  });

  it('applies the same Stripe event exactly once across a retry', async () => {
    const suffix = randomUUID();
    const [user] = await db
      .insert(users)
      .values({
        email: `billing-retry-${suffix}@example.test`,
        userStatus: 'active',
      })
      .returning({ id: users.id, billingVersion: users.billingVersion });
    userIds.add(user.id);

    const stripeEventId = `evt_retry_${suffix}`;
    const base = {
      userId: user.id,
      userIdentity: user.id,
      isPro: true,
      plan: 'pro',
      billingUpdatedAt: new Date(),
      previousState: { isPro: false, plan: 'free' },
      newState: { isPro: true, plan: 'pro' },
      stripeEventId,
      source: 'webhook',
      metadata: {},
      eventType: 'payment_succeeded',
    } as const;

    const first = await applyBillingUpdateWithAudit({
      ...base,
      expectedBillingVersion: user.billingVersion,
    });
    const retry = await applyBillingUpdateWithAudit({
      ...base,
      expectedBillingVersion: user.billingVersion + 1,
    });

    expect(first?.deduplicated).toBe(false);
    expect(retry).toMatchObject({
      appUserId: user.id,
      billingVersion: user.billingVersion + 1,
      deduplicated: true,
    });

    const [persisted] = await db
      .select({ billingVersion: users.billingVersion })
      .from(users)
      .where(eq(users.id, user.id));
    const auditRows = await db
      .select({ id: billingAuditLog.id })
      .from(billingAuditLog)
      .where(eq(billingAuditLog.stripeEventId, stripeEventId));
    expect(persisted?.billingVersion).toBe(user.billingVersion + 1);
    expect(auditRows).toHaveLength(1);
  });
});
