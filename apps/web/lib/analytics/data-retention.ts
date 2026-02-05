/**
 * Analytics Data Retention Cleanup
 *
 * Automatically deletes analytics data older than the configured retention period.
 * Default: 90 days
 * Configurable via ANALYTICS_RETENTION_DAYS environment variable.
 *
 * Compliance: GDPR Article 5(1)(e), CCPA data minimization
 */

import * as Sentry from '@sentry/nextjs';
import { sql as drizzleSql, lt } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  audienceMembers,
  clickEvents,
  notificationSubscriptions,
} from '@/lib/db/schema/analytics';
import { sqlTimestamp } from '@/lib/db/sql-helpers';
import { env } from '@/lib/env-server';

// Default retention period in days
const DEFAULT_RETENTION_DAYS = 90;

// Get configured retention period
export function getRetentionDays(): number {
  const envValue = env.ANALYTICS_RETENTION_DAYS;
  if (envValue) {
    const parsed = Number.parseInt(envValue, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_RETENTION_DAYS;
}

// Calculate the cutoff date for data retention
export function getRetentionCutoffDate(retentionDays?: number): Date {
  const days = retentionDays ?? getRetentionDays();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  cutoff.setHours(0, 0, 0, 0); // Start of day
  return cutoff;
}

export interface RetentionCleanupResult {
  clickEventsDeleted: number;
  audienceMembersDeleted: number;
  notificationSubscriptionsDeleted: number;
  cutoffDate: Date;
  retentionDays: number;
  duration: number;
}

/**
 * Delete click events older than retention period
 */
export async function cleanupClickEvents(cutoffDate: Date): Promise<number> {
  const result = await db
    .delete(clickEvents)
    .where(lt(clickEvents.createdAt, cutoffDate))
    .returning({ id: clickEvents.id });

  return result.length;
}

/**
 * Delete audience members who haven't been seen since before the retention period
 * Only deletes anonymous members (not identified contacts)
 */
export async function cleanupAudienceMembers(
  cutoffDate: Date
): Promise<number> {
  const result = await db
    .delete(audienceMembers)
    .where(
      drizzleSql`${audienceMembers.lastSeenAt} < ${sqlTimestamp(cutoffDate)}
        AND ${audienceMembers.type} = 'anonymous'
        AND ${audienceMembers.email} IS NULL
        AND ${audienceMembers.phone} IS NULL`
    )
    .returning({ id: audienceMembers.id });

  return result.length;
}

/**
 * Delete notification subscriptions older than retention period
 * Note: This only deletes if the subscriber hasn't re-subscribed
 */
export async function cleanupNotificationSubscriptions(
  cutoffDate: Date
): Promise<number> {
  const result = await db
    .delete(notificationSubscriptions)
    .where(lt(notificationSubscriptions.createdAt, cutoffDate))
    .returning({ id: notificationSubscriptions.id });

  return result.length;
}

/**
 * Run the full data retention cleanup
 * Deletes all analytics data older than the configured retention period
 */
export async function runDataRetentionCleanup(options?: {
  retentionDays?: number;
  dryRun?: boolean;
}): Promise<RetentionCleanupResult> {
  const startTime = Date.now();
  const retentionDays = options?.retentionDays ?? getRetentionDays();
  const cutoffDate = getRetentionCutoffDate(retentionDays);
  const dryRun = options?.dryRun ?? false;

  Sentry.addBreadcrumb({
    category: 'data-retention',
    message: `Starting cleanup (dry run: ${dryRun})`,
    level: 'info',
    data: {
      retentionDays,
      cutoffDate: cutoffDate.toISOString(),
    },
  });

  let clickEventsDeleted = 0;
  let audienceMembersDeleted = 0;
  let notificationSubscriptionsDeleted = 0;

  if (dryRun) {
    // Count records that would be deleted without actually deleting
    const [clickCount, audienceCount, subscriptionCount] = await Promise.all([
      db
        .select({ count: drizzleSql<number>`COUNT(*)` })
        .from(clickEvents)
        .where(lt(clickEvents.createdAt, cutoffDate))
        .then(r => Number(r[0]?.count ?? 0)),
      db
        .select({ count: drizzleSql<number>`COUNT(*)` })
        .from(audienceMembers)
        .where(
          drizzleSql`${audienceMembers.lastSeenAt} < ${sqlTimestamp(cutoffDate)}
            AND ${audienceMembers.type} = 'anonymous'
            AND ${audienceMembers.email} IS NULL
            AND ${audienceMembers.phone} IS NULL`
        )
        .then(r => Number(r[0]?.count ?? 0)),
      db
        .select({ count: drizzleSql<number>`COUNT(*)` })
        .from(notificationSubscriptions)
        .where(lt(notificationSubscriptions.createdAt, cutoffDate))
        .then(r => Number(r[0]?.count ?? 0)),
    ]);

    clickEventsDeleted = clickCount;
    audienceMembersDeleted = audienceCount;
    notificationSubscriptionsDeleted = subscriptionCount;
  } else {
    // Actually delete the records
    [
      clickEventsDeleted,
      audienceMembersDeleted,
      notificationSubscriptionsDeleted,
    ] = await Promise.all([
      cleanupClickEvents(cutoffDate),
      cleanupAudienceMembers(cutoffDate),
      cleanupNotificationSubscriptions(cutoffDate),
    ]);
  }

  const duration = Date.now() - startTime;

  const result: RetentionCleanupResult = {
    clickEventsDeleted,
    audienceMembersDeleted,
    notificationSubscriptionsDeleted,
    cutoffDate,
    retentionDays,
    duration,
  };

  Sentry.addBreadcrumb({
    category: 'data-retention',
    message: 'Cleanup complete',
    level: 'info',
    data: {
      ...result,
      cutoffDate: result.cutoffDate.toISOString(),
      dryRun,
    },
  });

  return result;
}

/**
 * Get statistics about data that would be affected by retention cleanup
 */
export async function getRetentionStats(retentionDays?: number): Promise<{
  retentionDays: number;
  cutoffDate: Date;
  clickEventsToDelete: number;
  audienceMembersToDelete: number;
  notificationSubscriptionsToDelete: number;
  totalRecordsToDelete: number;
}> {
  const days = retentionDays ?? getRetentionDays();
  const cutoffDate = getRetentionCutoffDate(days);

  const [clickCount, audienceCount, subscriptionCount] = await Promise.all([
    db
      .select({ count: drizzleSql<number>`COUNT(*)` })
      .from(clickEvents)
      .where(lt(clickEvents.createdAt, cutoffDate))
      .then(r => Number(r[0]?.count ?? 0)),
    db
      .select({ count: drizzleSql<number>`COUNT(*)` })
      .from(audienceMembers)
      .where(
        drizzleSql`${audienceMembers.lastSeenAt} < ${sqlTimestamp(cutoffDate)}
          AND ${audienceMembers.type} = 'anonymous'
          AND ${audienceMembers.email} IS NULL
          AND ${audienceMembers.phone} IS NULL`
      )
      .then(r => Number(r[0]?.count ?? 0)),
    db
      .select({ count: drizzleSql<number>`COUNT(*)` })
      .from(notificationSubscriptions)
      .where(lt(notificationSubscriptions.createdAt, cutoffDate))
      .then(r => Number(r[0]?.count ?? 0)),
  ]);

  return {
    retentionDays: days,
    cutoffDate,
    clickEventsToDelete: clickCount,
    audienceMembersToDelete: audienceCount,
    notificationSubscriptionsToDelete: subscriptionCount,
    totalRecordsToDelete: clickCount + audienceCount + subscriptionCount,
  };
}
