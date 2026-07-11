export const INVESTOR_PORTAL_EVENT_NAMES = [
  'portal_opened',
  'demo_started',
  'demo_completed',
  'deck_progressed',
  'founder_letter_opened',
  'meeting_cta_clicked',
  'invest_cta_clicked',
] as const;

export type InvestorPortalEventName =
  (typeof INVESTOR_PORTAL_EVENT_NAMES)[number];

export function isInvestorPortalEventName(
  value: string | undefined
): value is InvestorPortalEventName {
  return INVESTOR_PORTAL_EVENT_NAMES.some(eventName => eventName === value);
}

export function buildInvestorEventPath(
  event: InvestorPortalEventName,
  slideId?: string
): string {
  const suffix = slideId ? `/${slideId}` : '';
  return `/investor-portal#event/${event}${suffix}`;
}
