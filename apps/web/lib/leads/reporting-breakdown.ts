import type {
  LeadFunnelBreakdownRow,
  LeadFunnelReportFilters,
  LeadReportEvent,
  LeadRow,
} from './reporting-types';

const CONTACT_EVENT_TYPES = ['email_queued', 'dm_sent'] as const;

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

export function buildFilteredEventMap(
  events: LeadReportEvent[],
  filters: Pick<LeadFunnelReportFilters, 'channel' | 'campaignKey'>
): Map<string, Set<string>> {
  const eventMap = new Map<string, Set<string>>();
  const needsScopedCohort = Boolean(filters.channel || filters.campaignKey);

  if (!needsScopedCohort) {
    for (const event of events) {
      const existing = eventMap.get(event.leadId) ?? new Set<string>();
      existing.add(event.eventType);
      eventMap.set(event.leadId, existing);
    }
    return eventMap;
  }

  const scopedLeadIds = new Set<string>();
  for (const event of events) {
    const channelMatches =
      !filters.channel || event.channel === filters.channel;
    const campaignMatches =
      !filters.campaignKey || event.campaignKey === filters.campaignKey;

    if (channelMatches && campaignMatches) {
      scopedLeadIds.add(event.leadId);
    }
  }

  for (const event of events) {
    if (!scopedLeadIds.has(event.leadId)) {
      continue;
    }

    const existing = eventMap.get(event.leadId) ?? new Set<string>();
    existing.add(event.eventType);
    eventMap.set(event.leadId, existing);
  }

  return eventMap;
}

function tallyLeadEvents(
  events: Set<string>,
  breakdown: LeadFunnelBreakdownRow
): void {
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

export function buildBreakdown(
  cohort: string,
  cohortLeads: LeadRow[],
  eventMap: Map<string, Set<string>>
): LeadFunnelBreakdownRow {
  const breakdown = makeEmptyBreakdown(cohort);
  breakdown.scraped = cohortLeads.length;

  for (const lead of cohortLeads) {
    const events = eventMap.get(lead.id) ?? new Set<string>();
    tallyLeadEvents(events, breakdown);
  }

  return breakdown;
}

export function buildGroupedBreakdown(
  cohortEntries: [string, LeadRow[]][],
  eventMap: Map<string, Set<string>>
): LeadFunnelBreakdownRow[] {
  return cohortEntries
    .map(([cohort, cohortLeads]) =>
      buildBreakdown(cohort, cohortLeads, eventMap)
    )
    .sort(
      (left, right) =>
        right.paidConversions - left.paidConversions ||
        right.scraped - left.scraped
    )
    .slice(0, 10);
}
