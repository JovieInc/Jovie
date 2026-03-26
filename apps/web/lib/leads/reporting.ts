import 'server-only';

import { and, count, eq, gte, inArray, lte } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  leadFunnelEvents,
  leadPipelineSettings,
  leads,
} from '@/lib/db/schema/leads';

const CONTACT_EVENT_TYPES = ['email_queued', 'dm_sent'] as const;

export interface LeadFunnelReportFilters {
  start?: Date;
  end?: Date;
  sourcePlatform?: 'linktree' | 'beacons' | 'laylo';
  discoveryQuery?: string;
  musicTool?: string;
  verified?: boolean;
  hasPaidTier?: boolean;
  hasTrackingPixels?: boolean;
  channel?: string;
  campaignKey?: string;
}

export interface LeadFunnelBreakdownRow {
  cohort: string;
  scraped: number;
  qualified: number;
  approved: number;
  contacted: number;
  emailQueued: number;
  dmSent: number;
  claimClicks: number;
  signups: number;
  onboardingCompleted: number;
  paidConversions: number;
}

export interface RampRecommendation {
  recommendedAction: 'increase' | 'hold' | 'pause';
  recommendedNextDailyCap: number;
  reasons: string[];
  sampleSize: number;
  claimClickRate: number | null;
  providerFailureRate: number | null;
}

export interface LeadFunnelReport {
  filters: {
    start: string;
    end: string;
  };
  summary: Omit<LeadFunnelBreakdownRow, 'cohort'>;
  sourceBreakdown: LeadFunnelBreakdownRow[];
  musicToolBreakdown: LeadFunnelBreakdownRow[];
  pixelBreakdown: LeadFunnelBreakdownRow[];
  verifiedBreakdown: LeadFunnelBreakdownRow[];
  paidTierBreakdown: LeadFunnelBreakdownRow[];
  keywordBreakdown: LeadFunnelBreakdownRow[];
  rampRecommendation: RampRecommendation;
}

type LeadRow = {
  id: string;
  sourcePlatform: 'linktree' | 'beacons' | 'laylo';
  discoveryQuery: string | null;
  isLinktreeVerified: boolean | null;
  hasPaidTier: boolean | null;
  hasTrackingPixels: boolean;
  musicToolsDetected: string[];
};

function getDefaultDateRange() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 30);
  return { start, end };
}

function makeEmptyBreakdown(cohort: string): LeadFunnelBreakdownRow {
  return {
    cohort,
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
  };
}

function hasAnyEvent(
  eventTypes: Set<string>,
  candidates: readonly string[]
): boolean {
  return candidates.some(eventType => eventTypes.has(eventType));
}

function buildBreakdown(
  cohort: string,
  cohortLeads: LeadRow[],
  eventMap: Map<string, Set<string>>
): LeadFunnelBreakdownRow {
  const breakdown = makeEmptyBreakdown(cohort);
  breakdown.scraped = cohortLeads.length;

  for (const lead of cohortLeads) {
    const events = eventMap.get(lead.id) ?? new Set<string>();
    if (events.has('qualified')) breakdown.qualified++;
    if (events.has('approved')) breakdown.approved++;
    if (hasAnyEvent(events, CONTACT_EVENT_TYPES)) breakdown.contacted++;
    if (events.has('email_queued')) breakdown.emailQueued++;
    if (events.has('dm_sent')) breakdown.dmSent++;
    if (events.has('claim_page_viewed')) breakdown.claimClicks++;
    if (events.has('signup_completed')) breakdown.signups++;
    if (events.has('onboarding_completed')) breakdown.onboardingCompleted++;
    if (events.has('paid_converted')) breakdown.paidConversions++;
  }

  return breakdown;
}

function buildGroupedBreakdown(
  cohortEntries: [string, LeadRow[]][],
  eventMap: Map<string, Set<string>>
): LeadFunnelBreakdownRow[] {
  return cohortEntries
    .map(([cohort, cohortLeads]) =>
      buildBreakdown(cohort, cohortLeads, eventMap)
    )
    .sort(
      (a, b) => b.paidConversions - a.paidConversions || b.scraped - a.scraped
    )
    .slice(0, 10);
}

async function getRampRecommendation(): Promise<RampRecommendation> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [settings] = await db
    .select()
    .from(leadPipelineSettings)
    .where(eq(leadPipelineSettings.id, 1))
    .limit(1);

  const thresholds = settings?.guardrailThresholds ?? {
    minimumSampleSize: 30,
    increaseClaimClickRate: 0.06,
    holdClaimClickRateFloor: 0.03,
    pauseClaimClickRateFloor: 0.03,
    maxBounceComplaintRate: 0.03,
    maxUnsubscribeRate: 0.05,
    maxProviderFailureRate: 0.1,
  };
  const currentDailyCap = settings?.dailySendCap ?? 10;

  const recentEvents = await db
    .select({
      leadId: leadFunnelEvents.leadId,
      eventType: leadFunnelEvents.eventType,
    })
    .from(leadFunnelEvents)
    .where(gte(leadFunnelEvents.occurredAt, since));

  const eventMap = new Map<string, Set<string>>();
  for (const event of recentEvents) {
    const existing = eventMap.get(event.leadId) ?? new Set<string>();
    existing.add(event.eventType);
    eventMap.set(event.leadId, existing);
  }

  let contacted = 0;
  let claimClicks = 0;
  for (const events of eventMap.values()) {
    if (hasAnyEvent(events, CONTACT_EVENT_TYPES)) contacted++;
    if (events.has('claim_page_viewed')) claimClicks++;
  }

  const [failedRow] = await db
    .select({ total: count() })
    .from(leads)
    .where(
      and(eq(leads.outreachStatus, 'failed'), gte(leads.updatedAt, since))
    );

  const providerFailureRate =
    contacted > 0 ? Number(failedRow?.total ?? 0) / contacted : null;
  const claimClickRate = contacted > 0 ? claimClicks / contacted : null;
  const reasons: string[] = [];
  const telemetryIncomplete = true;

  if (contacted < thresholds.minimumSampleSize) {
    reasons.push(
      `Sample below threshold (${contacted}/${thresholds.minimumSampleSize}).`
    );
    return {
      recommendedAction: 'hold',
      recommendedNextDailyCap: currentDailyCap,
      reasons,
      sampleSize: contacted,
      claimClickRate,
      providerFailureRate,
    };
  }

  if (
    providerFailureRate !== null &&
    providerFailureRate >= thresholds.maxProviderFailureRate
  ) {
    reasons.push(
      `Provider failure rate ${Math.round(providerFailureRate * 100)}% exceeds threshold.`
    );
    return {
      recommendedAction: 'pause',
      recommendedNextDailyCap: 0,
      reasons,
      sampleSize: contacted,
      claimClickRate,
      providerFailureRate,
    };
  }

  if (
    claimClickRate !== null &&
    claimClickRate < thresholds.pauseClaimClickRateFloor
  ) {
    reasons.push(
      `Claim click rate ${Math.round(claimClickRate * 1000) / 10}% is below pause threshold.`
    );
    return {
      recommendedAction: 'pause',
      recommendedNextDailyCap: 0,
      reasons,
      sampleSize: contacted,
      claimClickRate,
      providerFailureRate,
    };
  }

  if (telemetryIncomplete) {
    reasons.push(
      'Bounce, complaint, and unsubscribe telemetry is incomplete, so the system will not auto-ramp.'
    );
    return {
      recommendedAction: 'hold',
      recommendedNextDailyCap: currentDailyCap,
      reasons,
      sampleSize: contacted,
      claimClickRate,
      providerFailureRate,
    };
  }

  if (
    claimClickRate !== null &&
    claimClickRate >= thresholds.increaseClaimClickRate
  ) {
    reasons.push('Claim click rate supports a controlled increase.');
    return {
      recommendedAction: 'increase',
      recommendedNextDailyCap: Math.ceil(currentDailyCap * 1.5),
      reasons,
      sampleSize: contacted,
      claimClickRate,
      providerFailureRate,
    };
  }

  reasons.push('Performance is inside the hold band.');
  return {
    recommendedAction: 'hold',
    recommendedNextDailyCap: currentDailyCap,
    reasons,
    sampleSize: contacted,
    claimClickRate,
    providerFailureRate,
  };
}

export async function getLeadFunnelReport(
  filters: LeadFunnelReportFilters = {}
): Promise<LeadFunnelReport> {
  const defaults = getDefaultDateRange();
  const start = filters.start ?? defaults.start;
  const end = filters.end ?? defaults.end;

  const whereClauses = [gte(leads.createdAt, start), lte(leads.createdAt, end)];
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
  const events =
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

  const eventMap = new Map<string, Set<string>>();
  for (const event of events) {
    if (filters.channel && event.channel !== filters.channel) continue;
    if (filters.campaignKey && event.campaignKey !== filters.campaignKey) {
      continue;
    }

    const existing = eventMap.get(event.leadId) ?? new Set<string>();
    existing.add(event.eventType);
    eventMap.set(event.leadId, existing);
  }

  const summary = buildBreakdown('all', filteredLeads, eventMap);

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
    } else {
      for (const tool of lead.musicToolsDetected) {
        toolGroups.set(tool, [...(toolGroups.get(tool) ?? []), lead]);
      }
    }
  }

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
      Array.from(sourceGroups.entries()),
      eventMap
    ),
    musicToolBreakdown: buildGroupedBreakdown(
      Array.from(toolGroups.entries()),
      eventMap
    ),
    pixelBreakdown: buildGroupedBreakdown(
      Array.from(pixelGroups.entries()),
      eventMap
    ),
    verifiedBreakdown: buildGroupedBreakdown(
      Array.from(verifiedGroups.entries()),
      eventMap
    ),
    paidTierBreakdown: buildGroupedBreakdown(
      Array.from(paidTierGroups.entries()),
      eventMap
    ),
    keywordBreakdown: buildGroupedBreakdown(
      Array.from(keywordGroups.entries()),
      eventMap
    ),
    rampRecommendation: await getRampRecommendation(),
  };
}
