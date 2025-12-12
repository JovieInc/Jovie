import 'server-only';

import { and, desc, sql as drizzleSql, inArray } from 'drizzle-orm';

import { checkDbHealth, db, doesTableExist, TABLE_NAMES } from '@/lib/db';
import { creatorProfiles, stripeWebhookEvents } from '@/lib/db/schema';

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
  const startIso = startDate.toISOString();

  let rows: { date: string; activeUsers: number | null }[] = [];
  try {
    const result = await db.execute(
      `
        SELECT DATE(created_at) AS date, COUNT(DISTINCT ip_address) AS active_users
        FROM click_events
        WHERE created_at >= '${startIso}'
        GROUP BY DATE(created_at)
        ORDER BY DATE(created_at)
      `
    );
    const rawRows = (result as { rows?: Record<string, unknown>[] }).rows ?? [];
    rows = rawRows.map(row => ({
      date: String(row.date),
      activeUsers: row.active_users != null ? Number(row.active_users) : null,
    }));
  } catch (error) {
    console.error('Error loading admin usage series', error);
    // Fall through with empty rows, which will produce a zeroed series
  }

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
  const hasStripeEvents = await doesTableExist(TABLE_NAMES.stripeWebhookEvents);

  if (!hasStripeEvents) {
    const dbHealth = await checkDbHealth();
    return {
      errorRatePercent: 0,
      p95LatencyMs: dbHealth.latency ?? null,
      incidents24h: 0,
      lastIncidentAt: null,
    };
  }

  try {
    const dbHealth = await checkDbHealth();

    let totalEvents = 0;
    let incidentCount = 0;
    let lastIncidentAt: Date | null = null;

    try {
      const rows = await db
        .select({ count: drizzleSql<number>`count(*)` })
        .from(stripeWebhookEvents)
        .where(
          drizzleSql`${stripeWebhookEvents.createdAt} >= ${dayAgo}::timestamp`
        );
      totalEvents = Number(rows[0]?.count ?? 0);
    } catch (error) {
      console.error('Error counting stripe webhook events', error);
    }

    try {
      const rows = await db
        .select({
          count: drizzleSql<number>`count(*)`,
          lastAt: drizzleSql<Date | null>`max(${stripeWebhookEvents.createdAt})`,
        })
        .from(stripeWebhookEvents)
        .where(
          and(
            drizzleSql`${stripeWebhookEvents.createdAt} >= ${dayAgo}::timestamp`,
            inArray(stripeWebhookEvents.type, [
              'invoice.payment_failed',
              'customer.subscription.deleted',
            ])
          )
        );

      const row = rows[0];
      incidentCount = Number(row?.count ?? 0);
      const rawLastAt = row?.lastAt;
      lastIncidentAt =
        rawLastAt instanceof Date
          ? rawLastAt
          : rawLastAt != null
            ? new Date(String(rawLastAt))
            : null;
    } catch (error) {
      console.error('Error loading stripe incident summary', error);
    }

    const errorRatePercent =
      totalEvents > 0 ? (Number(incidentCount) / Number(totalEvents)) * 100 : 0;

    return {
      errorRatePercent,
      p95LatencyMs: dbHealth.latency ?? null,
      incidents24h: Number(incidentCount),
      lastIncidentAt,
    };
  } catch (error) {
    console.error('Error loading admin reliability summary', error);

    try {
      const dbHealth = await checkDbHealth();
      return {
        errorRatePercent: 0,
        p95LatencyMs: dbHealth.latency ?? null,
        incidents24h: 0,
        lastIncidentAt: null,
      };
    } catch {
      return {
        errorRatePercent: 0,
        p95LatencyMs: null,
        incidents24h: 0,
        lastIncidentAt: null,
      };
    }
  }
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

type CreatorActivityRow = {
  id: string;
  username: string;
  createdAt: Date | null;
};

type StripeActivityRow = {
  id: string;
  type: string;
  createdAt: Date;
};

export async function getAdminActivityFeed(
  limit: number = 10
): Promise<AdminActivityItem[]> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * MS_PER_DAY);

  const hasStripeEvents = await doesTableExist(TABLE_NAMES.stripeWebhookEvents);
  const hasCreatorProfiles = await doesTableExist(TABLE_NAMES.creatorProfiles);

  try {
    const creatorPromise: Promise<CreatorActivityRow[]> = hasCreatorProfiles
      ? db
          .select({
            id: creatorProfiles.id,
            username: creatorProfiles.username,
            createdAt: creatorProfiles.createdAt,
          })
          .from(creatorProfiles)
          .where(
            drizzleSql`${creatorProfiles.createdAt} >= ${sevenDaysAgo}::timestamp`
          )
          .orderBy(desc(creatorProfiles.createdAt))
          .limit(limit)
      : Promise.resolve([] as CreatorActivityRow[]);

    const [recentCreators, recentStripeEvents] = await Promise.all([
      creatorPromise,
      (async () => {
        if (!hasStripeEvents) return [] as StripeActivityRow[];
        try {
          return await db
            .select({
              id: stripeWebhookEvents.id,
              type: stripeWebhookEvents.type,
              createdAt: stripeWebhookEvents.createdAt,
            })
            .from(stripeWebhookEvents)
            .where(
              drizzleSql`${stripeWebhookEvents.createdAt} >= ${sevenDaysAgo}::timestamp`
            )
            .orderBy(desc(stripeWebhookEvents.createdAt))
            .limit(limit);
        } catch (error) {
          console.error('Error loading stripe activity feed', error);
          return [] as StripeActivityRow[];
        }
      })(),
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
      const aTime = Date.parse(
        a.timestamp.replace(' UTC', '').replace(' ', 'T')
      );
      const bTime = Date.parse(
        b.timestamp.replace(' UTC', '').replace(' ', 'T')
      );
      return bTime - aTime;
    });

    return allItems.slice(0, limit);
  } catch (error) {
    console.error('Error loading admin activity feed', error);
    return [];
  }
}
