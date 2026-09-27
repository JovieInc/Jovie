import 'server-only';

import {
  and,
  count,
  desc,
  sql as drizzleSql,
  eq,
  inArray,
  isNull,
  max,
} from 'drizzle-orm';
import type Stripe from 'stripe';
import { z } from 'zod';
import { getProfileUrl } from '@/constants/domains';
import { getAdminStripeOverviewMetrics } from '@/lib/admin/stripe-metrics';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { billingAuditLog } from '@/lib/db/schema/billing';
import { creatorProfiles, userProfileClaims } from '@/lib/db/schema/profiles';
import { env } from '@/lib/env-server';
import { stripe } from '@/lib/stripe/client';
import { getLybDailyMrr } from './lyb-mrr.server';

/**
 * Summer company reads (contract v1 §2): Jovie product aggregates plus the
 * minimal contact fields Summer needs to target outreach. Never LYB health
 * data. A provider that cannot answer says so instead of reporting zero.
 */

export type Unavailable = {
  readonly status: 'unavailable';
  readonly reason: string;
};

const unavailable = (reason: string): Unavailable => ({
  status: 'unavailable',
  reason,
});

export async function getSummerRevenue(now = new Date()) {
  const [stripeMetrics, lyb] = await Promise.all([
    getAdminStripeOverviewMetrics(),
    getLybDailyMrr(now).catch(() => unavailable('lyb_mrr_failed')),
  ]);
  const jovie = !stripeMetrics.isConfigured
    ? unavailable('stripe_not_configured')
    : !stripeMetrics.isAvailable
      ? unavailable('stripe_request_failed')
      : {
          mrrUsd: stripeMetrics.mrrUsd,
          activeSubscriptions: stripeMetrics.activeSubscribers,
          source: 'stripe' as const,
        };
  return { observedAt: now.toISOString(), jovie, lyb };
}

export const summerCohortQuerySchema = z.object({
  kind: z.enum(['claimed_artists', 'checkout_abandoned', 'churned']),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type SummerCohortKind = z.infer<typeof summerCohortQuerySchema>['kind'];

export type SummerCohortRow = {
  readonly id: string;
  readonly displayName: string;
  readonly profileUrl?: string;
  readonly email?: string;
  readonly lastActiveAt?: string;
  readonly detail?: string;
};

type Cohort = { readonly total: number; readonly rows: SummerCohortRow[] };

/** Reachable account: not deleted and not suppressed from outbound. */
const reachableUser = () =>
  and(isNull(users.deletedAt), isNull(users.outboundSuppressedAt));

function withEmail(email: string | null): { email?: string } {
  return email ? { email } : {};
}

async function claimedArtists(limit: number): Promise<Cohort> {
  const where = and(
    eq(userProfileClaims.role, 'owner'),
    reachableUser(),
    drizzleSql`coalesce(${creatorProfiles.marketingOptOut}, false) = false`
  );
  const [rows, [totals]] = await Promise.all([
    db
      .select({
        id: creatorProfiles.id,
        username: creatorProfiles.username,
        displayName: creatorProfiles.displayName,
        email: users.email,
        claimedAt: userProfileClaims.claimedAt,
      })
      .from(userProfileClaims)
      .innerJoin(
        creatorProfiles,
        eq(creatorProfiles.id, userProfileClaims.creatorProfileId)
      )
      .innerJoin(users, eq(users.id, userProfileClaims.userId))
      .where(where)
      .orderBy(desc(userProfileClaims.claimedAt))
      .limit(limit),
    db
      .select({ total: count() })
      .from(userProfileClaims)
      .innerJoin(
        creatorProfiles,
        eq(creatorProfiles.id, userProfileClaims.creatorProfileId)
      )
      .innerJoin(users, eq(users.id, userProfileClaims.userId))
      .where(where),
  ]);
  return {
    total: totals?.total ?? 0,
    rows: rows.map(row => ({
      id: row.id,
      displayName: row.displayName || row.username,
      profileUrl: getProfileUrl(row.username),
      ...withEmail(row.email),
      ...(row.claimedAt
        ? { detail: `claimed ${row.claimedAt.toISOString()}` }
        : {}),
    })),
  };
}

/** Users whose subscription was deleted and who have not paid again since. */
async function churned(limit: number): Promise<Cohort> {
  const where = and(
    eq(billingAuditLog.eventType, 'subscription_deleted'),
    reachableUser(),
    drizzleSql`coalesce(${users.isPro}, false) = false`
  );
  const cancelledAt = max(billingAuditLog.createdAt);
  const [rows, [totals]] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        cancelledAt,
      })
      .from(billingAuditLog)
      .innerJoin(users, eq(users.id, billingAuditLog.userId))
      .where(where)
      .groupBy(users.id, users.name, users.email)
      .orderBy(desc(cancelledAt))
      .limit(limit),
    db
      .select({ total: drizzleSql<number>`count(distinct ${users.id})::int` })
      .from(billingAuditLog)
      .innerJoin(users, eq(users.id, billingAuditLog.userId))
      .where(where),
  ]);
  return {
    total: totals?.total ?? 0,
    rows: rows.map(row => ({
      id: row.id,
      displayName: row.name || row.email || row.id,
      ...withEmail(row.email),
      detail: row.cancelledAt
        ? `subscription cancelled ${row.cancelledAt.toISOString()}`
        : 'subscription cancelled',
    })),
  };
}

const ABANDONED_WINDOW_DAYS = 30;
const MAX_STRIPE_PAGES = 5;

/**
 * Expired subscription Checkout Sessions from the last 30 days (Stripe is the
 * only durable record), minus customers who have since subscribed.
 */
async function checkoutAbandoned(limit: number, now: Date): Promise<Cohort> {
  const since =
    Math.floor(now.getTime() / 1000) - ABANDONED_WINDOW_DAYS * 86400;
  const latestByCustomer = new Map<string, number>();
  let startingAfter: string | undefined;
  for (let page = 0; page < MAX_STRIPE_PAGES; page += 1) {
    const sessions: Stripe.ApiList<Stripe.Checkout.Session> =
      await stripe.checkout.sessions.list({
        status: 'expired',
        created: { gte: since },
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });
    for (const session of sessions.data) {
      if (session.mode !== 'subscription') continue;
      const customer =
        typeof session.customer === 'string'
          ? session.customer
          : session.customer?.id;
      if (!customer) continue;
      latestByCustomer.set(
        customer,
        Math.max(latestByCustomer.get(customer) ?? 0, session.created)
      );
    }
    startingAfter = sessions.data.at(-1)?.id;
    if (!sessions.has_more || !startingAfter) break;
  }
  if (latestByCustomer.size === 0) return { total: 0, rows: [] };

  const matched = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      stripeCustomerId: users.stripeCustomerId,
    })
    .from(users)
    .where(
      and(
        inArray(users.stripeCustomerId, [...latestByCustomer.keys()]),
        reachableUser(),
        drizzleSql`coalesce(${users.isPro}, false) = false`
      )
    );
  const rows = matched
    .map(row => ({
      row,
      expiredAt: latestByCustomer.get(row.stripeCustomerId ?? '') ?? 0,
    }))
    .sort((left, right) => right.expiredAt - left.expiredAt);
  return {
    total: rows.length,
    rows: rows.slice(0, limit).map(({ row, expiredAt }) => ({
      id: row.id,
      displayName: row.name || row.email || row.id,
      ...withEmail(row.email),
      detail: `checkout expired ${new Date(expiredAt * 1000).toISOString()}`,
    })),
  };
}

export async function getSummerCohort(
  kind: SummerCohortKind,
  limit: number,
  now = new Date()
): Promise<Cohort | Unavailable> {
  if (kind === 'claimed_artists') return claimedArtists(limit);
  if (kind === 'churned') return churned(limit);
  if (!env.STRIPE_SECRET_KEY) return unavailable('stripe_not_configured');
  try {
    return await checkoutAbandoned(limit, now);
  } catch {
    return unavailable('stripe_request_failed');
  }
}
