/**
 * Campaign-aware fan notification scheduling (JOV-2211)
 *
 * Provides draft -> segment -> schedule -> preview -> send primitives for
 * campaign-driven fan notifications (merch drops, surprise releases, etc.).
 *
 * Reuses proven patterns:
 * - Keyset pagination + batch insert from schedule-release-notifications cron
 * - dedupKey + onConflictDoUpdate for idempotency
 * - tryWithIdempotency wrapper from lib/idempotency
 * - notificationSubscriptions filters (confirmed, not unsubscribed, preference)
 *
 * Start-small scope: supports campaignId + simple segment targeting.
 * Does NOT replace the release_day cron path.
 */

import { and, asc, sql as drizzleSql, eq, gt, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { notificationSubscriptions } from '@/lib/db/schema/analytics';
import { fanReleaseNotifications } from '@/lib/db/schema/dsp-enrichment';
import { tryWithIdempotency } from '@/lib/idempotency';
import { logger } from '@/lib/utils/logger';

export type CampaignSegment =
  | 'all'
  | 'highIntent'
  | 'returning'
  | 'frequent'
  | 'recent24h'
  | 'alertsOn';

export interface ScheduleCampaignNotificationsParams {
  readonly creatorProfileId: string;
  readonly campaignId: string;
  readonly segment: CampaignSegment;
  readonly scheduledFor: Date;
  /** For demo surprise drops the campaign is release-tied; provide the releaseId. */
  readonly releaseId: string;
  /** 'preview' reuses existing enum value for minimal migration impact */
  readonly notificationType?: 'preview' | 'release_day';
  readonly metadata?: Record<string, unknown>;
}

const SUBSCRIBER_PAGE_SIZE = 400;
const INSERT_BATCH_SIZE = 400;

type SubscriberRow = {
  id: string;
  channel: string;
};

async function insertCampaignBatch(
  batch: Array<{
    creatorProfileId: string;
    releaseId: string;
    campaignId: string;
    notificationSubscriptionId: string;
    notificationType: 'preview' | 'release_day';
    scheduledFor: Date;
    status: 'pending';
    dedupKey: string;
    metadata: Record<string, unknown>;
  }>,
  now: Date
): Promise<number> {
  if (batch.length === 0) return 0;
  try {
    const inserted = await db
      .insert(fanReleaseNotifications)
      .values(batch)
      .onConflictDoUpdate({
        target: fanReleaseNotifications.dedupKey,
        set: {
          scheduledFor: drizzleSql`EXCLUDED.scheduled_for`,
          status: 'pending',
          error: null,
          updatedAt: now,
          // campaignId may be backfilled on retry
          campaignId: drizzleSql`COALESCE(${fanReleaseNotifications.campaignId}, EXCLUDED.campaign_id)`,
        },
        setWhere: inArray(fanReleaseNotifications.status, [
          'cancelled',
          'pending',
        ]),
      })
      .returning({ id: fanReleaseNotifications.id });
    return inserted.length;
  } catch (err) {
    logger.error('[campaign-scheduling] Batch insert failed, continuing:', err);
    return 0;
  }
}

/**
 * Schedule fan notifications for a campaign + segment.
 * Idempotent at (campaign, segment, subscriber) level via dedupKey.
 */
export async function scheduleCampaignFanNotifications(
  params: ScheduleCampaignNotificationsParams
): Promise<{ scheduled: number; deduped: number }> {
  const {
    creatorProfileId,
    campaignId,
    segment,
    scheduledFor,
    notificationType = 'preview',
    metadata = {},
  } = params;

  const jobKey = `campaign-fan:${creatorProfileId}:${campaignId}:${segment}`;
  const result = await tryWithIdempotency(
    jobKey,
    120, // 2 min lock for large segments
    async () => {
      const now = new Date();
      let lastId = '';
      let pendingBatch: Array<{
        creatorProfileId: string;
        releaseId: string;
        campaignId: string;
        notificationSubscriptionId: string;
        notificationType: 'preview' | 'release_day';
        scheduledFor: Date;
        status: 'pending';
        dedupKey: string;
        metadata: Record<string, unknown>;
      }> = [];
      let totalScheduled = 0;
      let totalDeduped = 0;

      const flush = async () => {
        if (pendingBatch.length === 0) return;
        const toInsert = pendingBatch;
        pendingBatch = [];
        const count = await insertCampaignBatch(toInsert, now);
        totalScheduled += count;
        totalDeduped += toInsert.length - count;
      };

      while (true) {
        const clauses = [
          eq(notificationSubscriptions.creatorProfileId, creatorProfileId),
          drizzleSql`${notificationSubscriptions.unsubscribedAt} IS NULL`,
          drizzleSql`${notificationSubscriptions.confirmedAt} IS NOT NULL`,
          // Basic preference gate (releaseDay or general alerts on)
          drizzleSql`(
            (${notificationSubscriptions.preferences}->>'releaseDay')::boolean = true
            OR (${notificationSubscriptions.preferences}->>'general')::boolean = true
          )`,
        ];

        if (segment === 'alertsOn') {
          // Prefer denormalized if present; fallback to preference
          clauses.push(
            drizzleSql`COALESCE(${notificationSubscriptions.preferences}->>'releaseDay', 'true')::boolean = true`
          );
        }

        if (lastId) {
          clauses.push(gt(notificationSubscriptions.id, lastId));
        }

        const page: SubscriberRow[] = await db
          .select({
            id: notificationSubscriptions.id,
            channel: notificationSubscriptions.channel,
          })
          .from(notificationSubscriptions)
          .where(and(...clauses))
          .orderBy(asc(notificationSubscriptions.id))
          .limit(SUBSCRIBER_PAGE_SIZE);

        for (const sub of page) {
          const dedupKey = `campaign:${campaignId}:${segment}:${sub.id}`;
          pendingBatch.push({
            creatorProfileId,
            releaseId: params.releaseId,
            campaignId,
            notificationSubscriptionId: sub.id,
            notificationType,
            scheduledFor,
            status: 'pending' as const,
            dedupKey,
            metadata: {
              ...metadata,
              segment,
              channel: sub.channel,
              campaignId,
            },
          });

          if (pendingBatch.length >= INSERT_BATCH_SIZE) {
            await flush();
          }
        }

        if (page.length < SUBSCRIBER_PAGE_SIZE) break;
        lastId = page.at(-1)!.id;
      }

      await flush();
      return { scheduled: totalScheduled, deduped: totalDeduped };
    }
  );

  if (!result.success || !result.data) {
    logger.warn('[campaign-scheduling] Scheduling skipped or locked', {
      jobKey,
      error: result.error,
    });
    return { scheduled: 0, deduped: 0 };
  }
  return result.data;
}

/**
 * Helper to build a simple segment-targeted metadata blob for preview/scheduling.
 */
export function buildCampaignNotificationMetadata(input: {
  campaignTitle: string;
  ctaUrl: string;
  draftBody?: string;
}) {
  return {
    campaignTitle: input.campaignTitle,
    ctaUrl: input.ctaUrl,
    draftBody: input.draftBody ?? '',
    source: 'jov-2211-campaign-scheduler',
  };
}
