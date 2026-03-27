import 'server-only';

import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { getDeepErrorMessage } from '@/lib/db/errors';
import { leadFunnelEvents, leads } from '@/lib/db/schema/leads';
import { captureError, captureWarning } from '@/lib/error-tracking';
import {
  buildBreakdown,
  buildFilteredEventMap,
  buildGroupedBreakdown,
} from './reporting-breakdown';
import { getRampRecommendation } from './reporting-ramp';
import type {
  LeadFunnelReport,
  LeadFunnelReportFilters,
  LeadReportEvent,
  LeadRow,
} from './reporting-types';

export type {
  LeadFunnelBreakdownRow,
  LeadFunnelReport,
  LeadFunnelReportFilters,
  RampRecommendation,
} from './reporting-types';

function getDefaultDateRange() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 30);
  return { start, end };
}

function makeEmptyReport(
  start: Date,
  end: Date,
  reason: string
): LeadFunnelReport {
  return {
    filters: {
      start: start.toISOString(),
      end: end.toISOString(),
    },
    summary: {
      scraped: 0,
      qualified: 0,
      approved: 0,
      contacted: 0,
      emailQueued: 0,
      dmSent: 0,
      claimClicks: 0,
      signups: 0,
      onboardingCompleted: 0,
      paidConversions: 0,
    },
    sourceBreakdown: [],
    musicToolBreakdown: [],
    pixelBreakdown: [],
    verifiedBreakdown: [],
    paidTierBreakdown: [],
    keywordBreakdown: [],
    rampRecommendation: {
      recommendedAction: 'hold',
      recommendedNextDailyCap: 10,
      reasons: [reason],
      sampleSize: 0,
      claimClickRate: null,
      providerFailureRate: null,
    },
  };
}

function isMissingLeadReportingSchemaError(error: unknown): boolean {
  const message = getDeepErrorMessage(error).toLowerCase();
  if (!message.includes('does not exist')) {
    return false;
  }

  return [
    'lead_funnel_events',
    'column "source_platform"',
    'column "has_tracking_pixels"',
    'column "music_tools_detected"',
  ].some(pattern => message.includes(pattern));
}

function buildLeadGroups(filteredLeads: LeadRow[]) {
  const sourceGroups = new Map<string, LeadRow[]>();
  const pixelGroups = new Map<string, LeadRow[]>();
  const verifiedGroups = new Map<string, LeadRow[]>();
  const paidTierGroups = new Map<string, LeadRow[]>();
  const keywordGroups = new Map<string, LeadRow[]>();
  const toolGroups = new Map<string, LeadRow[]>();

  for (const lead of filteredLeads) {
    sourceGroups.set(lead.sourcePlatform, [
      ...(sourceGroups.get(lead.sourcePlatform) ?? []),
      lead,
    ]);
    pixelGroups.set(lead.hasTrackingPixels ? 'tracking_pixels' : 'no_pixels', [
      ...(pixelGroups.get(
        lead.hasTrackingPixels ? 'tracking_pixels' : 'no_pixels'
      ) ?? []),
      lead,
    ]);
    verifiedGroups.set(lead.isLinktreeVerified ? 'verified' : 'not_verified', [
      ...(verifiedGroups.get(
        lead.isLinktreeVerified ? 'verified' : 'not_verified'
      ) ?? []),
      lead,
    ]);
    paidTierGroups.set(lead.hasPaidTier ? 'paid_tier' : 'free_tier', [
      ...(paidTierGroups.get(lead.hasPaidTier ? 'paid_tier' : 'free_tier') ??
        []),
      lead,
    ]);
    keywordGroups.set(lead.discoveryQuery ?? 'unknown', [
      ...(keywordGroups.get(lead.discoveryQuery ?? 'unknown') ?? []),
      lead,
    ]);

    if (lead.musicToolsDetected.length === 0) {
      toolGroups.set('none', [...(toolGroups.get('none') ?? []), lead]);
      continue;
    }

    for (const tool of lead.musicToolsDetected) {
      toolGroups.set(tool, [...(toolGroups.get(tool) ?? []), lead]);
    }
  }

  return {
    sourceGroups,
    toolGroups,
    pixelGroups,
    verifiedGroups,
    paidTierGroups,
    keywordGroups,
  };
}

export async function getLeadFunnelReport(
  filters: LeadFunnelReportFilters = {}
): Promise<LeadFunnelReport> {
  const defaults = getDefaultDateRange();
  const start = filters.start ?? defaults.start;
  const end = filters.end ?? defaults.end;

  try {
    const whereClauses = [
      gte(leads.createdAt, start),
      lte(leads.createdAt, end),
    ];

    if (filters.sourcePlatform) {
      whereClauses.push(eq(leads.sourcePlatform, filters.sourcePlatform));
    }
    if (filters.discoveryQuery) {
      whereClauses.push(eq(leads.discoveryQuery, filters.discoveryQuery));
    }
    if (typeof filters.verified === 'boolean') {
      whereClauses.push(eq(leads.isLinktreeVerified, filters.verified));
    }
    if (typeof filters.hasPaidTier === 'boolean') {
      whereClauses.push(eq(leads.hasPaidTier, filters.hasPaidTier));
    }
    if (typeof filters.hasTrackingPixels === 'boolean') {
      whereClauses.push(eq(leads.hasTrackingPixels, filters.hasTrackingPixels));
    }

    const cohortLeads = await db
      .select({
        id: leads.id,
        sourcePlatform: leads.sourcePlatform,
        discoveryQuery: leads.discoveryQuery,
        isLinktreeVerified: leads.isLinktreeVerified,
        hasPaidTier: leads.hasPaidTier,
        hasTrackingPixels: leads.hasTrackingPixels,
        musicToolsDetected: leads.musicToolsDetected,
      })
      .from(leads)
      .where(and(...whereClauses));

    const filteredLeads = cohortLeads.filter(lead => {
      if (
        filters.musicTool &&
        !lead.musicToolsDetected.includes(filters.musicTool)
      ) {
        return false;
      }

      return true;
    });

    const leadIds = filteredLeads.map(lead => lead.id);
    const events: LeadReportEvent[] =
      leadIds.length > 0
        ? await db
            .select({
              leadId: leadFunnelEvents.leadId,
              eventType: leadFunnelEvents.eventType,
              channel: leadFunnelEvents.channel,
              campaignKey: leadFunnelEvents.campaignKey,
            })
            .from(leadFunnelEvents)
            .where(
              and(
                inArray(leadFunnelEvents.leadId, leadIds),
                gte(leadFunnelEvents.occurredAt, start),
                lte(leadFunnelEvents.occurredAt, end)
              )
            )
        : [];

    const eventMap = buildFilteredEventMap(events, {
      channel: filters.channel,
      campaignKey: filters.campaignKey,
    });
    const scopedLeads =
      filters.channel || filters.campaignKey
        ? filteredLeads.filter(lead => eventMap.has(lead.id))
        : filteredLeads;
    const summary = buildBreakdown('all', scopedLeads, eventMap);
    const groups = buildLeadGroups(scopedLeads);

    return {
      filters: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
      summary: {
        scraped: summary.scraped,
        qualified: summary.qualified,
        approved: summary.approved,
        contacted: summary.contacted,
        emailQueued: summary.emailQueued,
        dmSent: summary.dmSent,
        claimClicks: summary.claimClicks,
        signups: summary.signups,
        onboardingCompleted: summary.onboardingCompleted,
        paidConversions: summary.paidConversions,
      },
      sourceBreakdown: buildGroupedBreakdown(
        Array.from(groups.sourceGroups.entries()),
        eventMap
      ),
      musicToolBreakdown: buildGroupedBreakdown(
        Array.from(groups.toolGroups.entries()),
        eventMap
      ),
      pixelBreakdown: buildGroupedBreakdown(
        Array.from(groups.pixelGroups.entries()),
        eventMap
      ),
      verifiedBreakdown: buildGroupedBreakdown(
        Array.from(groups.verifiedGroups.entries()),
        eventMap
      ),
      paidTierBreakdown: buildGroupedBreakdown(
        Array.from(groups.paidTierGroups.entries()),
        eventMap
      ),
      keywordBreakdown: buildGroupedBreakdown(
        Array.from(groups.keywordGroups.entries()),
        eventMap
      ),
      rampRecommendation: await getRampRecommendation(),
    };
  } catch (error) {
    if (isMissingLeadReportingSchemaError(error)) {
      await captureWarning(
        '[leads/reporting] GTM reporting schema missing; returning empty report',
        error
      );
      return makeEmptyReport(
        start,
        end,
        'GTM reporting schema is not fully available in this environment yet.'
      );
    }

    captureError('Error building lead funnel report', error);
    return makeEmptyReport(
      start,
      end,
      'GTM reporting is temporarily unavailable.'
    );
  }
}
