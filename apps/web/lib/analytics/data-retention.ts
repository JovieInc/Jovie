/**
 * Analytics Data Retention Cleanup
 *
 * Automatically deletes analytics data older than the configured retention period.
 * Default: 90 days (1 year for chat data)
 * Configurable via ANALYTICS_RETENTION_DAYS environment variable.
 *
 * Uses batched deletes to avoid locking tables or timing out the cron window.
 * The cron will chip away at large backlogs over multiple daily runs.
 *
 * Compliance: GDPR Article 5(1)(e), CCPA data minimization
 */

import * as Sentry from '@sentry/nextjs';
import {
  and,
  sql as drizzleSql,
  eq,
  inArray,
  isNotNull,
  lt,
  type SQL,
} from 'drizzle-orm';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { db } from '@/lib/db';
import { adminAuditLog } from '@/lib/db/schema/admin';
import {
  audienceMembers,
  clickEvents,
  notificationSubscriptions,
} from '@/lib/db/schema/analytics';
import { billingAuditLog, stripeWebhookEvents } from '@/lib/db/schema/billing';
import { chatAuditLog, chatMessages } from '@/lib/db/schema/chat';
import { emailEngagement } from '@/lib/db/schema/email-engagement';
import { ingestionJobs } from '@/lib/db/schema/ingestion';
import { pixelEvents } from '@/lib/db/schema/pixels';
import { emailSendAttribution } from '@/lib/db/schema/sender';
import {
  emailSuppressions,
  notificationDeliveryLog,
  unsubscribeTokens,
  webhookEvents,
} from '@/lib/db/schema/suppression';
import { sqlTimestamp } from '@/lib/db/sql-helpers';
import { env } from '@/lib/env-server';

// Default retention period in days
const DEFAULT_RETENTION_DAYS = 90;
const CHAT_RETENTION_DAYS = 365;
const BATCH_SIZE = 1000;

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
  // Original tables
  clickEventsDeleted: number;
  audienceMembersDeleted: number;
  notificationSubscriptionsDeleted: number;
  // New tables - 90 day retention
  pixelEventsDeleted: number;
  stripeWebhookEventsDeleted: number;
  webhookEventsDeleted: number;
  notificationDeliveryLogDeleted: number;
  emailEngagementDeleted: number;
  billingAuditLogDeleted: number;
  adminAuditLogDeleted: number;
  ingestionJobsDeleted: number;
  // New tables - 1 year retention
  chatMessagesDeleted: number;
  chatAuditLogDeleted: number;
  // Expired tokens/attributions
  unsubscribeTokensDeleted: number;
  emailSendAttributionDeleted: number;
  emailSuppressionsDeleted: number;
  // Metadata
  cutoffDate: Date;
  chatCutoffDate: Date;
  retentionDays: number;
  duration: number;
}

/**
 * Batch delete rows matching a condition to avoid table locks and timeouts.
 * Uses ctid-based subquery to delete in chunks without needing column references.
 */
async function batchDelete(
  table: PgTable,
  condition: SQL,
  batchSize = BATCH_SIZE
): Promise<number> {
  const { name: tableName } = getTableConfig(table);
  const tableRef = drizzleSql.identifier(tableName);
  let totalDeleted = 0;
  let deleted: number;
  do {
    const result = await db.execute(
      drizzleSql`DELETE FROM ${tableRef}
        WHERE ctid IN (
          SELECT ctid FROM ${tableRef}
          WHERE ${condition}
          LIMIT ${batchSize}
        )`
    );
    deleted = Number(result.rowCount ?? 0);
    totalDeleted += deleted;
  } while (deleted === batchSize);
  return totalDeleted;
}

/**
 * Count rows matching a condition (for dry-run mode).
 */
async function countRows(table: PgTable, condition: SQL): Promise<number> {
  const result = await db
    .select({ count: drizzleSql<number>`COUNT(*)` })
    .from(table)
    .where(condition);
  return Number(result[0]?.count ?? 0);
}

// --- Cleanup functions for each table ---

async function cleanupClickEvents(
  cutoffDate: Date,
  dryRun: boolean
): Promise<number> {
  const condition = lt(clickEvents.createdAt, cutoffDate);
  return dryRun
    ? countRows(clickEvents, condition)
    : batchDelete(clickEvents, condition);
}

async function cleanupAudienceMembers(
  cutoffDate: Date,
  dryRun: boolean
): Promise<number> {
  const condition = drizzleSql`${audienceMembers.lastSeenAt} < ${sqlTimestamp(cutoffDate)}
    AND ${audienceMembers.type} = 'anonymous'
    AND ${audienceMembers.email} IS NULL
    AND ${audienceMembers.phone} IS NULL`;
  return dryRun
    ? countRows(audienceMembers, condition)
    : batchDelete(audienceMembers, condition);
}

async function cleanupNotificationSubscriptions(
  cutoffDate: Date,
  dryRun: boolean
): Promise<number> {
  const condition = lt(notificationSubscriptions.createdAt, cutoffDate);
  return dryRun
    ? countRows(notificationSubscriptions, condition)
    : batchDelete(notificationSubscriptions, condition);
}

async function cleanupPixelEvents(
  cutoffDate: Date,
  dryRun: boolean
): Promise<number> {
  const condition = lt(pixelEvents.createdAt, cutoffDate);
  return dryRun
    ? countRows(pixelEvents, condition)
    : batchDelete(pixelEvents, condition);
}

async function cleanupStripeWebhookEvents(
  cutoffDate: Date,
  dryRun: boolean
): Promise<number> {
  const condition = and(
    isNotNull(stripeWebhookEvents.processedAt),
    lt(stripeWebhookEvents.createdAt, cutoffDate)
  )!;
  return dryRun
    ? countRows(stripeWebhookEvents, condition)
    : batchDelete(stripeWebhookEvents, condition);
}

async function cleanupWebhookEvents(
  cutoffDate: Date,
  dryRun: boolean
): Promise<number> {
  const condition = and(
    eq(webhookEvents.processed, true),
    lt(webhookEvents.createdAt, cutoffDate)
  )!;
  return dryRun
    ? countRows(webhookEvents, condition)
    : batchDelete(webhookEvents, condition);
}

async function cleanupNotificationDeliveryLog(
  cutoffDate: Date,
  dryRun: boolean
): Promise<number> {
  const condition = lt(notificationDeliveryLog.createdAt, cutoffDate);
  return dryRun
    ? countRows(notificationDeliveryLog, condition)
    : batchDelete(notificationDeliveryLog, condition);
}

async function cleanupEmailEngagement(
  cutoffDate: Date,
  dryRun: boolean
): Promise<number> {
  const condition = lt(emailEngagement.createdAt, cutoffDate);
  return dryRun
    ? countRows(emailEngagement, condition)
    : batchDelete(emailEngagement, condition);
}

async function cleanupChatMessages(
  chatCutoffDate: Date,
  dryRun: boolean
): Promise<number> {
  const condition = lt(chatMessages.createdAt, chatCutoffDate);
  return dryRun
    ? countRows(chatMessages, condition)
    : batchDelete(chatMessages, condition);
}

async function cleanupChatAuditLog(
  chatCutoffDate: Date,
  dryRun: boolean
): Promise<number> {
  const condition = lt(chatAuditLog.createdAt, chatCutoffDate);
  return dryRun
    ? countRows(chatAuditLog, condition)
    : batchDelete(chatAuditLog, condition);
}

async function cleanupBillingAuditLog(
  cutoffDate: Date,
  dryRun: boolean
): Promise<number> {
  const condition = lt(billingAuditLog.createdAt, cutoffDate);
  return dryRun
    ? countRows(billingAuditLog, condition)
    : batchDelete(billingAuditLog, condition);
}

async function cleanupAdminAuditLog(
  cutoffDate: Date,
  dryRun: boolean
): Promise<number> {
  const condition = lt(adminAuditLog.createdAt, cutoffDate);
  return dryRun
    ? countRows(adminAuditLog, condition)
    : batchDelete(adminAuditLog, condition);
}

async function cleanupIngestionJobs(
  cutoffDate: Date,
  dryRun: boolean
): Promise<number> {
  const condition = and(
    inArray(ingestionJobs.status, ['succeeded', 'failed']),
    lt(ingestionJobs.createdAt, cutoffDate)
  )!;
  return dryRun
    ? countRows(ingestionJobs, condition)
    : batchDelete(ingestionJobs, condition);
}

async function cleanupExpiredUnsubscribeTokens(
  dryRun: boolean
): Promise<number> {
  const condition = lt(unsubscribeTokens.expiresAt, drizzleSql`NOW()`);
  return dryRun
    ? countRows(unsubscribeTokens, condition)
    : batchDelete(unsubscribeTokens, condition);
}

async function cleanupExpiredEmailSendAttribution(
  dryRun: boolean
): Promise<number> {
  const condition = lt(emailSendAttribution.expiresAt, drizzleSql`NOW()`);
  return dryRun
    ? countRows(emailSendAttribution, condition)
    : batchDelete(emailSendAttribution, condition);
}

async function cleanupExpiredEmailSuppressions(
  dryRun: boolean
): Promise<number> {
  const condition = and(
    isNotNull(emailSuppressions.expiresAt),
    lt(emailSuppressions.expiresAt, drizzleSql`NOW()`)
  )!;
  return dryRun
    ? countRows(emailSuppressions, condition)
    : batchDelete(emailSuppressions, condition);
}

/**
 * Run the full data retention cleanup.
 * Deletes all analytics data older than the configured retention period.
 */
export async function runDataRetentionCleanup(options?: {
  retentionDays?: number;
  dryRun?: boolean;
}): Promise<RetentionCleanupResult> {
  const startTime = Date.now();
  const retentionDays = options?.retentionDays ?? getRetentionDays();
  const cutoffDate = getRetentionCutoffDate(retentionDays);
  const chatCutoffDate = getRetentionCutoffDate(CHAT_RETENTION_DAYS);
  const dryRun = options?.dryRun ?? false;

  Sentry.addBreadcrumb({
    category: 'data-retention',
    message: `Starting cleanup (dry run: ${dryRun})`,
    level: 'info',
    data: {
      retentionDays,
      cutoffDate: cutoffDate.toISOString(),
      chatCutoffDate: chatCutoffDate.toISOString(),
    },
  });

  // Run all cleanups concurrently
  const [
    clickEventsDeleted,
    audienceMembersDeleted,
    notificationSubscriptionsDeleted,
    pixelEventsDeleted,
    stripeWebhookEventsDeleted,
    webhookEventsDeleted,
    notificationDeliveryLogDeleted,
    emailEngagementDeleted,
    chatMessagesDeleted,
    chatAuditLogDeleted,
    billingAuditLogDeleted,
    adminAuditLogDeleted,
    ingestionJobsDeleted,
    unsubscribeTokensDeleted,
    emailSendAttributionDeleted,
    emailSuppressionsDeleted,
  ] = await Promise.all([
    cleanupClickEvents(cutoffDate, dryRun),
    cleanupAudienceMembers(cutoffDate, dryRun),
    cleanupNotificationSubscriptions(cutoffDate, dryRun),
    cleanupPixelEvents(cutoffDate, dryRun),
    cleanupStripeWebhookEvents(cutoffDate, dryRun),
    cleanupWebhookEvents(cutoffDate, dryRun),
    cleanupNotificationDeliveryLog(cutoffDate, dryRun),
    cleanupEmailEngagement(cutoffDate, dryRun),
    cleanupChatMessages(chatCutoffDate, dryRun),
    cleanupChatAuditLog(chatCutoffDate, dryRun),
    cleanupBillingAuditLog(cutoffDate, dryRun),
    cleanupAdminAuditLog(cutoffDate, dryRun),
    cleanupIngestionJobs(cutoffDate, dryRun),
    cleanupExpiredUnsubscribeTokens(dryRun),
    cleanupExpiredEmailSendAttribution(dryRun),
    cleanupExpiredEmailSuppressions(dryRun),
  ]);

  const duration = Date.now() - startTime;

  const result: RetentionCleanupResult = {
    clickEventsDeleted,
    audienceMembersDeleted,
    notificationSubscriptionsDeleted,
    pixelEventsDeleted,
    stripeWebhookEventsDeleted,
    webhookEventsDeleted,
    notificationDeliveryLogDeleted,
    emailEngagementDeleted,
    chatMessagesDeleted,
    chatAuditLogDeleted,
    billingAuditLogDeleted,
    adminAuditLogDeleted,
    ingestionJobsDeleted,
    unsubscribeTokensDeleted,
    emailSendAttributionDeleted,
    emailSuppressionsDeleted,
    cutoffDate,
    chatCutoffDate,
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
      chatCutoffDate: result.chatCutoffDate.toISOString(),
      dryRun,
    },
  });

  return result;
}

/**
 * Get statistics about data that would be affected by retention cleanup
 */
export async function getRetentionStats(retentionDays?: number) {
  const result = await runDataRetentionCleanup({
    retentionDays,
    dryRun: true,
  });
  return result;
}
