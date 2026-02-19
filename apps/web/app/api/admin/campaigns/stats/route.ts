/**
 * Campaign Stats API
 *
 * Returns comprehensive campaign metrics including:
 * - Email engagement (opens, clicks)
 * - Delivery stats (sent, bounced, complained)
 * - Conversion rates (claimed profiles)
 * - Suppression statistics
 */

import { and, count, sql as drizzleSql, eq, gte } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import {
  campaignEnrollments,
  campaignSequences,
  emailEngagement,
} from '@/lib/db/schema/email-engagement';
import { creatorClaimInvites, creatorProfiles } from '@/lib/db/schema/profiles';
import { emailSuppressions } from '@/lib/db/schema/suppression';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/**
 * Invite stats by status
 */
interface InviteStats {
  total: number;
  pending: number;
  scheduled: number;
  sending: number;
  sent: number;
  bounced: number;
  failed: number;
  unsubscribed: number;
}

/**
 * Engagement stats
 */
interface EngagementStats {
  totalOpens: number;
  uniqueOpens: number;
  totalClicks: number;
  uniqueClicks: number;
  openRate: number;
  clickRate: number;
  clickToOpenRate: number;
}

/**
 * Conversion stats
 */
interface ConversionStats {
  profilesClaimed: number;
  claimRate: number;
}

/**
 * Suppression stats
 */
interface SuppressionStats {
  hardBounces: number;
  softBounces: number;
  spamComplaints: number;
  userUnsubscribes: number;
  total: number;
}

/**
 * Drip campaign stats
 */
interface DripCampaignStats {
  campaignKey: string;
  campaignName: string;
  activeEnrollments: number;
  completedEnrollments: number;
  stoppedEnrollments: number;
}

/**
 * Date range filter
 */
type DateRange = '7d' | '30d' | '90d' | 'all';

const DATE_RANGE_DAYS: Record<Exclude<DateRange, 'all'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

function getDateRangeFilter(range: DateRange): Date | null {
  if (range === 'all') return null;

  const days = DATE_RANGE_DAYS[range];
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function buildInviteStats(dateFilter: Date | null): Promise<InviteStats> {
  const inviteQuery = dateFilter
    ? db
        .select({
          status: creatorClaimInvites.status,
          count: count(),
        })
        .from(creatorClaimInvites)
        .where(gte(creatorClaimInvites.createdAt, dateFilter))
        .groupBy(creatorClaimInvites.status)
    : db
        .select({
          status: creatorClaimInvites.status,
          count: count(),
        })
        .from(creatorClaimInvites)
        .groupBy(creatorClaimInvites.status);

  const inviteStatsResult = await inviteQuery;

  const inviteStats: InviteStats = {
    total: 0,
    pending: 0,
    scheduled: 0,
    sending: 0,
    sent: 0,
    bounced: 0,
    failed: 0,
    unsubscribed: 0,
  };

  for (const row of inviteStatsResult) {
    const countValue = Number(row.count);
    inviteStats.total += countValue;

    switch (row.status) {
      case 'pending':
        inviteStats.pending = countValue;
        break;
      case 'scheduled':
        inviteStats.scheduled = countValue;
        break;
      case 'sending':
        inviteStats.sending = countValue;
        break;
      case 'sent':
        inviteStats.sent = countValue;
        break;
      case 'bounced':
        inviteStats.bounced = countValue;
        break;
      case 'failed':
        inviteStats.failed = countValue;
        break;
      case 'unsubscribed':
        inviteStats.unsubscribed = countValue;
        break;
    }
  }

  return inviteStats;
}

async function buildEngagementStats(
  dateFilter: Date | null,
  sentCount: number,
  campaignId?: string
): Promise<EngagementStats> {
  // Build where conditions array
  const whereConditions = [];
  if (dateFilter) {
    whereConditions.push(gte(emailEngagement.createdAt, dateFilter));
  }
  if (campaignId) {
    whereConditions.push(eq(emailEngagement.referenceId, campaignId));
  }

  const whereClause =
    whereConditions.length > 0 ? and(...whereConditions) : undefined;

  const baseQuery = db
    .select({
      eventType: emailEngagement.eventType,
      count: count(),
      uniqueCount: drizzleSql<number>`count(distinct ${emailEngagement.recipientHash})`,
    })
    .from(emailEngagement)
    .groupBy(emailEngagement.eventType);

  const engagementQuery = whereClause
    ? baseQuery.where(whereClause)
    : baseQuery;

  const engagementResult = await engagementQuery;

  let totalOpens = 0;
  let uniqueOpens = 0;
  let totalClicks = 0;
  let uniqueClicks = 0;

  for (const row of engagementResult) {
    if (row.eventType === 'open') {
      totalOpens = Number(row.count);
      uniqueOpens = Number(row.uniqueCount);
    } else if (row.eventType === 'click') {
      totalClicks = Number(row.count);
      uniqueClicks = Number(row.uniqueCount);
    }
  }

  return {
    totalOpens,
    uniqueOpens,
    totalClicks,
    uniqueClicks,
    openRate: sentCount > 0 ? (uniqueOpens / sentCount) * 100 : 0,
    clickRate: sentCount > 0 ? (uniqueClicks / sentCount) * 100 : 0,
    clickToOpenRate: uniqueOpens > 0 ? (uniqueClicks / uniqueOpens) * 100 : 0,
  };
}

async function buildConversionStats(
  dateFilter: Date | null,
  sentCount: number
) {
  const claimedQuery = dateFilter
    ? db
        .select({
          count: drizzleSql<number>`count(distinct ${creatorClaimInvites.creatorProfileId})`,
        })
        .from(creatorClaimInvites)
        .innerJoin(
          creatorProfiles,
          eq(creatorClaimInvites.creatorProfileId, creatorProfiles.id)
        )
        .where(gte(creatorClaimInvites.createdAt, dateFilter))
    : db
        .select({
          count: drizzleSql<number>`count(distinct ${creatorClaimInvites.creatorProfileId})`,
        })
        .from(creatorClaimInvites)
        .innerJoin(
          creatorProfiles,
          eq(creatorClaimInvites.creatorProfileId, creatorProfiles.id)
        )
        .where(eq(creatorProfiles.isClaimed, true));

  const [claimedResult] = await claimedQuery;
  const profilesClaimed = Number(claimedResult?.count ?? 0);

  const conversionStats: ConversionStats = {
    profilesClaimed,
    claimRate: sentCount > 0 ? (profilesClaimed / sentCount) * 100 : 0,
  };

  return conversionStats;
}

async function buildSuppressionStats(dateFilter: Date | null) {
  const suppressionQuery = dateFilter
    ? db
        .select({
          reason: emailSuppressions.reason,
          count: count(),
        })
        .from(emailSuppressions)
        .where(gte(emailSuppressions.createdAt, dateFilter))
        .groupBy(emailSuppressions.reason)
    : db
        .select({
          reason: emailSuppressions.reason,
          count: count(),
        })
        .from(emailSuppressions)
        .groupBy(emailSuppressions.reason);

  const suppressionResult = await suppressionQuery;

  const suppressionStats: SuppressionStats = {
    hardBounces: 0,
    softBounces: 0,
    spamComplaints: 0,
    userUnsubscribes: 0,
    total: 0,
  };

  for (const row of suppressionResult) {
    const countValue = Number(row.count);
    suppressionStats.total += countValue;

    switch (row.reason) {
      case 'hard_bounce':
        suppressionStats.hardBounces = countValue;
        break;
      case 'soft_bounce':
        suppressionStats.softBounces = countValue;
        break;
      case 'spam_complaint':
        suppressionStats.spamComplaints = countValue;
        break;
      case 'user_request':
        suppressionStats.userUnsubscribes = countValue;
        break;
    }
  }

  return suppressionStats;
}

async function buildDripCampaignStats(): Promise<DripCampaignStats[]> {
  // Single query with JOIN instead of N+1 loop queries
  const enrollmentsBySequence = await db
    .select({
      campaignId: campaignEnrollments.campaignSequenceId,
      campaignKey: campaignSequences.campaignKey,
      campaignName: campaignSequences.name,
      status: campaignEnrollments.status,
      count: count(),
    })
    .from(campaignEnrollments)
    .innerJoin(
      campaignSequences,
      eq(campaignEnrollments.campaignSequenceId, campaignSequences.id)
    )
    .groupBy(
      campaignEnrollments.campaignSequenceId,
      campaignSequences.campaignKey,
      campaignSequences.name,
      campaignEnrollments.status
    );

  // Group results by campaign
  const campaignMap = new Map<
    string,
    {
      key: string;
      name: string;
      active: number;
      completed: number;
      stopped: number;
    }
  >();

  for (const row of enrollmentsBySequence) {
    const existing = campaignMap.get(row.campaignId) ?? {
      key: row.campaignKey,
      name: row.campaignName,
      active: 0,
      completed: 0,
      stopped: 0,
    };

    const countValue = Number(row.count);
    if (row.status === 'active') existing.active = countValue;
    else if (row.status === 'completed') existing.completed = countValue;
    else if (row.status === 'stopped') existing.stopped = countValue;

    campaignMap.set(row.campaignId, existing);
  }

  return Array.from(campaignMap.values()).map(stats => ({
    campaignKey: stats.key,
    campaignName: stats.name,
    activeEnrollments: stats.active,
    completedEnrollments: stats.completed,
    stoppedEnrollments: stats.stopped,
  }));
}

function _aggregateCampaignStats(
  campaignKey: string,
  campaignName: string,
  enrollmentResult: { status: string | null; count: bigint | number }[]
): DripCampaignStats {
  let active = 0;
  let completed = 0;
  let stopped = 0;

  for (const row of enrollmentResult) {
    const countValue = Number(row.count);
    if (row.status === 'active') active = countValue;
    else if (row.status === 'completed') completed = countValue;
    else if (row.status === 'stopped') stopped = countValue;
  }

  return {
    campaignKey,
    campaignName,
    activeEnrollments: active,
    completedEnrollments: completed,
    stoppedEnrollments: stopped,
  };
}

export async function GET(request: Request) {
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

    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get('campaignId');
    const { range, dateFilter } = parseRange(request);

    // If campaignId specified, return filtered results for that campaign only
    if (campaignId) {
      const inviteStats = await buildInviteStats(dateFilter);
      const sentCount = inviteStats.sent + inviteStats.bounced;
      const engagementStats = await buildEngagementStats(
        dateFilter,
        sentCount,
        campaignId
      );

      return NextResponse.json(
        {
          ok: true,
          campaignId,
          range,
          engagement: engagementStats,
          updatedAt: new Date().toISOString(),
        },
        { headers: NO_STORE_HEADERS }
      );
    }

    // Otherwise return summary stats (existing behavior)
    // Parallelize all independent queries for better performance
    const [inviteStats, suppressionStats, dripCampaignStats] =
      await Promise.all([
        buildInviteStats(dateFilter),
        buildSuppressionStats(dateFilter),
        buildDripCampaignStats(),
      ]);

    const sentCount = inviteStats.sent + inviteStats.bounced;

    // Fetch dependent stats (requires sentCount from inviteStats)
    const [engagementStats, conversionStats] = await Promise.all([
      buildEngagementStats(dateFilter, sentCount),
      buildConversionStats(dateFilter, sentCount),
    ]);

    return NextResponse.json(
      {
        ok: true,
        range,
        invites: inviteStats,
        engagement: engagementStats,
        conversion: conversionStats,
        suppression: suppressionStats,
        dripCampaigns: dripCampaignStats,
        updatedAt: new Date().toISOString(),
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('[Campaign Stats] Failed to fetch stats', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    await captureError('Admin campaign stats failed', error, {
      route: '/api/admin/campaigns/stats',
      method: 'GET',
    });

    return NextResponse.json(
      { error: 'Failed to fetch campaign stats' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

function parseRange(request: Request) {
  const url = new URL(request.url);
  const range = (url.searchParams.get('range') as DateRange) || '30d';
  return { range, dateFilter: getDateRangeFilter(range) };
}
