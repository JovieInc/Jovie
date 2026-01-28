/**
 * Campaign Stats API
 *
 * Returns comprehensive campaign metrics including:
 * - Email engagement (opens, clicks)
 * - Delivery stats (sent, bounced, complained)
 * - Conversion rates (claimed profiles)
 * - Suppression statistics
 */

import { count, eq, gte, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import {
  campaignEnrollments,
  creatorClaimInvites,
  creatorProfiles,
  emailEngagement,
  emailSuppressions,
} from '@/lib/db/schema';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
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

function getDateRangeFilter(range: DateRange): Date | null {
  if (range === 'all') return null;

  const now = new Date();
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
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

    // Parse query params
    const url = new URL(request.url);
    const range = (url.searchParams.get('range') as DateRange) || '30d';
    const dateFilter = getDateRangeFilter(range);

    // Fetch invite stats
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

    // Fetch engagement stats for claim invites
    const engagementQuery = dateFilter
      ? db
          .select({
            eventType: emailEngagement.eventType,
            count: count(),
            uniqueCount: sql<number>`count(distinct ${emailEngagement.recipientHash})`,
          })
          .from(emailEngagement)
          .where(gte(emailEngagement.createdAt, dateFilter))
          .groupBy(emailEngagement.eventType)
      : db
          .select({
            eventType: emailEngagement.eventType,
            count: count(),
            uniqueCount: sql<number>`count(distinct ${emailEngagement.recipientHash})`,
          })
          .from(emailEngagement)
          .groupBy(emailEngagement.eventType);

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

    const sentCount = inviteStats.sent + inviteStats.bounced;
    const engagementStats: EngagementStats = {
      totalOpens,
      uniqueOpens,
      totalClicks,
      uniqueClicks,
      openRate: sentCount > 0 ? (uniqueOpens / sentCount) * 100 : 0,
      clickRate: sentCount > 0 ? (uniqueClicks / sentCount) * 100 : 0,
      clickToOpenRate: uniqueOpens > 0 ? (uniqueClicks / uniqueOpens) * 100 : 0,
    };

    // Fetch conversion stats (claimed profiles from invites)
    const claimedQuery = dateFilter
      ? db
          .select({
            count: sql<number>`count(distinct ${creatorClaimInvites.creatorProfileId})`,
          })
          .from(creatorClaimInvites)
          .innerJoin(
            creatorProfiles,
            eq(creatorClaimInvites.creatorProfileId, creatorProfiles.id)
          )
          .where(gte(creatorClaimInvites.createdAt, dateFilter))
      : db
          .select({
            count: sql<number>`count(distinct ${creatorClaimInvites.creatorProfileId})`,
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

    // Fetch suppression stats
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

    // Fetch drip campaign stats
    const campaigns = await db.query.campaignSequences.findMany();

    const dripCampaignStats: DripCampaignStats[] = [];

    for (const campaign of campaigns) {
      const enrollmentResult = await db
        .select({
          status: campaignEnrollments.status,
          count: count(),
        })
        .from(campaignEnrollments)
        .where(eq(campaignEnrollments.campaignSequenceId, campaign.id))
        .groupBy(campaignEnrollments.status);

      let active = 0;
      let completed = 0;
      let stopped = 0;

      for (const row of enrollmentResult) {
        const countValue = Number(row.count);
        if (row.status === 'active') active = countValue;
        else if (row.status === 'completed') completed = countValue;
        else if (row.status === 'stopped') stopped = countValue;
      }

      dripCampaignStats.push({
        campaignKey: campaign.campaignKey,
        campaignName: campaign.name,
        activeEnrollments: active,
        completedEnrollments: completed,
        stoppedEnrollments: stopped,
      });
    }

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

    return NextResponse.json(
      { error: 'Failed to fetch campaign stats' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
