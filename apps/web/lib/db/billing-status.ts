import 'server-only';

import { sql as drizzleSql } from 'drizzle-orm';
import { users } from '@/lib/db/schema/auth';
import { billingAuditLog } from '@/lib/db/schema/billing';
import { db } from './index';

export interface AtomicBillingUpdateInput {
  readonly userId: string;
  readonly userIdentity: string;
  readonly expectedBillingVersion: number;
  readonly isPro: boolean;
  readonly plan: string;
  readonly billingUpdatedAt: Date;
  readonly stripeCustomerId?: string;
  readonly stripeSubscriptionId?: string | null;
  readonly stripePriceId?: string | null;
  readonly lastBillingEventAt?: Date;
  readonly eventType: string;
  readonly previousState: Record<string, unknown>;
  readonly newState: Record<string, unknown>;
  readonly stripeEventId?: string;
  readonly source: string;
  readonly metadata: Record<string, unknown>;
  readonly retried?: boolean;
  readonly retryCount?: number;
}

export type AtomicBillingUpdateResult = {
  readonly appUserId: string;
  readonly billingVersion: number;
};

/**
 * Persist an entitlement mutation and its audit receipt as one PostgreSQL
 * statement. A failed audit insert rolls back the update automatically, while
 * a lost optimistic lock produces no audit row and returns `null`.
 */
export async function applyBillingUpdateWithAudit(
  input: AtomicBillingUpdateInput
): Promise<AtomicBillingUpdateResult | null> {
  const nextBillingVersion = input.expectedBillingVersion + 1;
  const auditMetadata = {
    ...input.metadata,
    clerkUserId: input.userIdentity,
    billingVersion: nextBillingVersion,
    ...(input.retried ? { retried: true, retryCount: input.retryCount } : {}),
  };
  const preserveStripeCustomerId = input.stripeCustomerId === undefined;
  const preserveStripeSubscriptionId = input.stripeSubscriptionId === undefined;
  const preserveStripePriceId = input.stripePriceId === undefined;
  const preserveLastBillingEventAt = input.lastBillingEventAt === undefined;

  const result = await db.execute<AtomicBillingUpdateResult>(drizzleSql`
    with updated_user as (
      update ${users}
      set
        ${drizzleSql.identifier(users.isPro.name)} = ${input.isPro},
        ${drizzleSql.identifier(users.plan.name)} = ${input.plan},
        ${drizzleSql.identifier(users.billingUpdatedAt.name)} = ${input.billingUpdatedAt},
        ${drizzleSql.identifier(users.stripeCustomerId.name)} = case
          when ${preserveStripeCustomerId} then ${users.stripeCustomerId}
          else ${input.stripeCustomerId ?? null}
        end,
        ${drizzleSql.identifier(users.stripeSubscriptionId.name)} = case
          when ${preserveStripeSubscriptionId} then ${users.stripeSubscriptionId}
          else ${input.stripeSubscriptionId ?? null}
        end,
        ${drizzleSql.identifier(users.stripePriceId.name)} = case
          when ${preserveStripePriceId} then ${users.stripePriceId}
          else ${input.stripePriceId ?? null}
        end,
        ${drizzleSql.identifier(users.lastBillingEventAt.name)} = case
          when ${preserveLastBillingEventAt} then ${users.lastBillingEventAt}
          else ${input.lastBillingEventAt ?? null}
        end,
        ${drizzleSql.identifier(users.billingVersion.name)} = ${users.billingVersion} + 1
      where ${users.id} = ${input.userId}
        and ${users.billingVersion} = ${input.expectedBillingVersion}
      returning ${users.id}, ${users.billingVersion}
    ), inserted_audit as (
      insert into ${billingAuditLog} (
        "user_id",
        "event_type",
        "previous_state",
        "new_state",
        "stripe_event_id",
        "source",
        "metadata"
      )
      select
        updated_user."id",
        ${input.eventType},
        ${JSON.stringify(input.previousState)}::jsonb,
        ${JSON.stringify(input.newState)}::jsonb,
        ${input.stripeEventId ?? null},
        ${input.source},
        ${JSON.stringify(auditMetadata)}::jsonb
      from updated_user
      returning "user_id"
    )
    select
      updated_user."id" as "appUserId",
      updated_user."billing_version" as "billingVersion"
    from updated_user
    inner join inserted_audit
      on inserted_audit."user_id" = updated_user."id"
  `);

  const row = result.rows[0];
  return row
    ? {
        appUserId: row.appUserId,
        billingVersion: Number(row.billingVersion),
      }
    : null;
}
