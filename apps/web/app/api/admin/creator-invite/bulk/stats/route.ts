import { count, sql as drizzleSql, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ingestionJobs } from '@/lib/db/schema/ingestion';
import { creatorClaimInvites, creatorProfiles } from '@/lib/db/schema/profiles';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError } from '@/lib/error-tracking';
import { toISOStringSafe } from '@/lib/utils/date';
import { logger } from '@/lib/utils/logger';
import { NO_STORE_HEADERS } from '../lib';

export const runtime = 'nodejs';

/**
 * Campaign invite status counts
 */
interface CampaignStats {
  /** Total invites created */
  total: number;
  /** Invites pending send */
  pending: number;
  /** Currently being sent */
  sending: number;
  /** Successfully sent */
  sent: number;
  /** Failed to send */
  failed: number;
  /** Profiles that have been claimed after invite */
  claimed: number;
}

/**
 * Job queue status for claim invite jobs
 */
interface JobQueueStats {
  /** Pending jobs waiting to run */
  pending: number;
  /** Jobs currently being processed */
  processing: number;
  /** Successfully completed jobs */
  succeeded: number;
  /** Failed jobs */
  failed: number;
  /** Next scheduled job run time */
  nextRunAt: string | null;
  /** Estimated minutes until queue is empty */
  estimatedMinutesRemaining: number;
}

/**
 * GET endpoint to fetch campaign stats and job queue status.
 */
export async function GET() {
  try {
    const entitlements = await getCurrentUserEntitlements();
    if (!entitlements.isAuthenticated) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    if (!entitlements.isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    // Fetch invite stats by status
    const inviteStatsResult = await db
      .select({
        status: creatorClaimInvites.status,
        count: count(),
      })
      .from(creatorClaimInvites)
      .groupBy(creatorClaimInvites.status);

    // Map results to CampaignStats
    const campaignStats: CampaignStats = {
      total: 0,
      pending: 0,
      sending: 0,
      sent: 0,
      failed: 0,
      claimed: 0,
    };

    for (const row of inviteStatsResult) {
      const countValue = Number(row.count);
      campaignStats.total += countValue;

      switch (row.status) {
        case 'pending':
          campaignStats.pending = countValue;
          break;
        case 'sending':
          campaignStats.sending = countValue;
          break;
        case 'sent':
          campaignStats.sent = countValue;
          break;
        case 'failed':
          campaignStats.failed = countValue;
          break;
      }
    }

    // Count claimed profiles that were invited (distinct to avoid counting duplicates)
    const [claimedResult] = await db
      .select({
        count: drizzleSql<number>`count(distinct ${creatorClaimInvites.creatorProfileId})`,
      })
      .from(creatorClaimInvites)
      .innerJoin(
        creatorProfiles,
        eq(creatorClaimInvites.creatorProfileId, creatorProfiles.id)
      )
      .where(eq(creatorProfiles.isClaimed, true));

    campaignStats.claimed = Number(claimedResult?.count ?? 0);

    // Fetch job queue stats for claim invite jobs
    const jobStatsResult = await db
      .select({
        status: ingestionJobs.status,
        count: count(),
      })
      .from(ingestionJobs)
      .where(eq(ingestionJobs.jobType, 'send_claim_invite'))
      .groupBy(ingestionJobs.status);

    const jobQueueStats: JobQueueStats = {
      pending: 0,
      processing: 0,
      succeeded: 0,
      failed: 0,
      nextRunAt: null,
      estimatedMinutesRemaining: 0,
    };

    for (const row of jobStatsResult) {
      const countValue = Number(row.count);

      switch (row.status) {
        case 'pending':
          jobQueueStats.pending = countValue;
          break;
        case 'processing':
          jobQueueStats.processing = countValue;
          break;
        case 'succeeded':
          jobQueueStats.succeeded = countValue;
          break;
        case 'failed':
          jobQueueStats.failed = countValue;
          break;
      }
    }

    // Get next scheduled run time
    const [nextJobResult] = await db
      .select({
        runAt: ingestionJobs.runAt,
      })
      .from(ingestionJobs)
      .where(
        drizzleSql`${ingestionJobs.jobType} = 'send_claim_invite' AND ${ingestionJobs.status} = 'pending'`
      )
      .orderBy(ingestionJobs.runAt)
      .limit(1);

    if (nextJobResult?.runAt) {
      jobQueueStats.nextRunAt = toISOStringSafe(nextJobResult.runAt);
    }

    // Calculate estimated time remaining based on pending + processing jobs
    // Assume ~75 seconds average per job (midpoint of 30-120 second range)
    const avgSecondsPerJob = 75;
    const pendingJobs = jobQueueStats.pending + jobQueueStats.processing;
    if (pendingJobs > 0) {
      jobQueueStats.estimatedMinutesRemaining = Math.ceil(
        (pendingJobs * avgSecondsPerJob) / 60
      );
    }

    return NextResponse.json(
      {
        ok: true,
        campaign: campaignStats,
        jobQueue: jobQueueStats,
        updatedAt: new Date().toISOString(),
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    logger.error('Failed to fetch campaign stats', {
      error: errorMessage,
      raw: error,
    });
    await captureError('Admin bulk invite stats failed', error, {
      route: '/api/admin/creator-invite/bulk/stats',
      method: 'GET',
    });

    return NextResponse.json(
      { error: 'Failed to fetch campaign stats' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
