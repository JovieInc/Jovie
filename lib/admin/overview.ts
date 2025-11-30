import 'server-only';

import { and, count, desc, sql as drizzleSql, eq, gte, or } from 'drizzle-orm';

import { checkDbHealth, db } from '@/lib/db';
import {
  clickEvents,
  creatorProfiles,
  stripeWebhookEvents,
} from '@/lib/db/schema';

export interface AdminUsagePoint {
  label: string;
  value: number;
}

export interface AdminReliabilitySummary {
  errorRatePercent: number;
  p95LatencyMs: number | null;
  incidents24h: number;
  lastIncidentAt: Date | null;
}

export type AdminActivityStatus = 'success' | 'warning' | 'error';

export interface AdminActivityItem {
  id: string;
  user: string;
  action: string;
  timestamp: string;
  status: AdminActivityStatus;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function getAdminUsageSeries(
  days: number = 14
): Promise<AdminUsagePoint[]> {
  const now = new Date();
  const startDate = new Date(now.getTime() - (days - 1) * MS_PER_DAY);

  const rows = await db
    .select({
      date: drizzleSql<string>`DATE(${clickEvents.createdAt})`,
      activeUsers: drizzleSql<number>`COUNT(DISTINCT ${clickEvents.ipAddress})`,
    })
    .from(clickEvents)
    .where(gte(clickEvents.createdAt, startDate))
    .groupBy(drizzleSql`DATE(${clickEvents.createdAt})`)
    .orderBy(drizzleSql`DATE(${clickEvents.createdAt})`);

  const countsByDate = new Map<string, number>();
  for (const row of rows) {
    const value = Number(row.activeUsers ?? 0);
    countsByDate.set(row.date, value);
  }

  const points: AdminUsagePoint[] = [];

  for (let i = 0; i < days; i += 1) {
    const date = new Date(startDate.getTime() + i * MS_PER_DAY);
    const key = date.toISOString().slice(0, 10); // YYYY-MM-DD
    const label = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    const value = countsByDate.get(key) ?? 0;
    points.push({ label, value });
  }

  return points;
}

export async function getAdminReliabilitySummary(): Promise<AdminReliabilitySummary> {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - MS_PER_DAY);

  const [dbHealth, totalEventsRows, incidentRows] = await Promise.all([
    checkDbHealth(),
    db
      .select({ count: count() })
      .from(stripeWebhookEvents)
      .where(gte(stripeWebhookEvents.createdAt, dayAgo)),
    db
      .select({
        count: count(),
        lastAt: drizzleSql<Date>`MAX(${stripeWebhookEvents.createdAt})`,
      })
      .from(stripeWebhookEvents)
      .where(
        and(
          gte(stripeWebhookEvents.createdAt, dayAgo),
          or(
            // Payment failures are treated as incidents
            eq(stripeWebhookEvents.type, 'invoice.payment_failed'),
            // Subscription cancellations are also operationally important
            eq(stripeWebhookEvents.type, 'customer.subscription.deleted')
          )
        )
      ),
  ]);

  const totalEvents = totalEventsRows[0]?.count ?? 0;
  const incidentCount = incidentRows[0]?.count ?? 0;
  const lastIncidentAt =
    (incidentRows[0] as { lastAt?: Date | null } | undefined)?.lastAt ?? null;

  const errorRatePercent =
    totalEvents > 0 ? (Number(incidentCount) / Number(totalEvents)) * 100 : 0;

  return {
    errorRatePercent,
    p95LatencyMs: dbHealth.latency ?? null,
    incidents24h: Number(incidentCount),
    lastIncidentAt,
  };
}

function formatTimestamp(timestamp: Date): string {
  return `${timestamp.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function mapStripeEventToActivity(event: {
  id: string;
  type: string;
  createdAt: Date;
}): AdminActivityItem {
  let action = event.type;
  let status: AdminActivityStatus = 'success';

  switch (event.type) {
    case 'invoice.payment_failed':
      action = 'Invoice payment failed';
      status = 'error';
      break;
    case 'invoice.payment_succeeded':
      action = 'Invoice payment succeeded';
      status = 'success';
      break;
    case 'customer.subscription.created':
      action = 'Subscription created';
      status = 'success';
      break;
    case 'customer.subscription.updated':
      action = 'Subscription updated';
      status = 'warning';
      break;
    case 'customer.subscription.deleted':
      action = 'Subscription cancelled';
      status = 'warning';
      break;
    default:
      action = event.type;
      status = 'success';
      break;
  }

  return {
    id: `stripe-${event.id}`,
    user: 'Stripe',
    action,
    timestamp: formatTimestamp(event.createdAt),
    status,
  };
}

export async function getAdminActivityFeed(
  limit: number = 10
): Promise<AdminActivityItem[]> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * MS_PER_DAY);

  const [recentCreators, recentStripeEvents] = await Promise.all([
    db
      .select({
        id: creatorProfiles.id,
        username: creatorProfiles.username,
        createdAt: creatorProfiles.createdAt,
      })
      .from(creatorProfiles)
      .where(gte(creatorProfiles.createdAt, sevenDaysAgo))
      .orderBy(desc(creatorProfiles.createdAt))
      .limit(limit),
    db
      .select({
        id: stripeWebhookEvents.id,
        type: stripeWebhookEvents.type,
        createdAt: stripeWebhookEvents.createdAt,
      })
      .from(stripeWebhookEvents)
      .where(gte(stripeWebhookEvents.createdAt, sevenDaysAgo))
      .orderBy(desc(stripeWebhookEvents.createdAt))
      .limit(limit),
  ]);

  const creatorItems: AdminActivityItem[] = recentCreators.map(row => ({
    id: `creator-${row.id}`,
    user: `@${row.username}`,
    action: 'Creator profile created',
    timestamp: formatTimestamp(row.createdAt ?? new Date()),
    status: 'success',
  }));

  const stripeItems: AdminActivityItem[] = recentStripeEvents.map(event =>
    mapStripeEventToActivity(event)
  );

  const allItems = [...creatorItems, ...stripeItems];

  allItems.sort((a, b) => {
    const aTime = Date.parse(a.timestamp.replace(' UTC', '').replace(' ', 'T'));
    const bTime = Date.parse(b.timestamp.replace(' UTC', '').replace(' ', 'T'));
    return bTime - aTime;
  });

  return allItems.slice(0, limit);
}
