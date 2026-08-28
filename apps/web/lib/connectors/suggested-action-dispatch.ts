import { z } from 'zod';
import { parseBrandDealOpportunity } from './brand-deal-opportunity';
import { isReportKind } from './opportunity-inbox-report';
import {
  BRAND_DEAL_OPPORTUNITY_KIND,
  CALENDAR_CREATE_EVENT_KIND,
  isThumbnailDecisionKind,
  WORKFLOW_CAPTURE_REQUEST_KIND,
} from './suggested-action-kinds';

const CalendarPayloadSchema = z.object({
  title: z.string().trim().min(1),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }).nullish(),
  timeZone: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  location: z.string().trim().min(1).optional(),
  venueName: z.string().trim().min(1).nullish(),
  city: z.string().trim().min(1).nullish(),
  region: z.string().trim().min(1).nullish(),
  country: z.string().trim().min(1).nullish(),
});

export interface ApprovedCalendarPayload {
  readonly title: string;
  readonly startsAt: string;
  readonly endsAt?: string;
  readonly timeZone: string;
  readonly description?: string;
  readonly location?: string;
}

export type SuggestedActionDispatch =
  | {
      readonly mode: 'calendar-workflow';
      readonly eventPayload: ApprovedCalendarPayload;
    }
  | {
      readonly mode: 'decision-only';
      readonly family: 'brand-deal' | 'youtube-thumbnail';
    }
  | { readonly mode: 'workflow-capture' }
  | { readonly mode: 'next-step-only' }
  | { readonly mode: 'invalid'; readonly error: string };

function parseCalendarPayload(
  payload: unknown
): ApprovedCalendarPayload | null {
  const parsed = CalendarPayloadSchema.safeParse(payload);
  if (!parsed.success) return null;

  const locationParts = [
    parsed.data.venueName,
    parsed.data.city,
    parsed.data.region,
    parsed.data.country,
  ].filter((part): part is string => Boolean(part));
  const location = parsed.data.location ?? locationParts.join(', ');

  return {
    title: parsed.data.title,
    startsAt: parsed.data.startsAt,
    ...(parsed.data.endsAt ? { endsAt: parsed.data.endsAt } : {}),
    timeZone: parsed.data.timeZone ?? 'UTC',
    ...(parsed.data.description
      ? { description: parsed.data.description }
      : {}),
    ...(location ? { location } : {}),
  };
}

/**
 * Closed registry for every suggested-action approval behavior.
 * Unknown or malformed kinds never inherit another action's side effect.
 */
export function resolveSuggestedActionDispatch(input: {
  readonly kind: string;
  readonly payload: unknown;
  readonly signalType?: string | null;
}): SuggestedActionDispatch {
  if (typeof input.kind !== 'string' || input.kind.trim().length === 0) {
    return { mode: 'invalid', error: 'unsupported-action-kind' };
  }

  if (
    input.kind === BRAND_DEAL_OPPORTUNITY_KIND ||
    input.signalType === 'brand_deal'
  ) {
    return parseBrandDealOpportunity(input.kind, input.payload)
      ? { mode: 'decision-only', family: 'brand-deal' }
      : { mode: 'invalid', error: 'brand-deal-evidence-unverified' };
  }

  if (input.kind === CALENDAR_CREATE_EVENT_KIND) {
    const eventPayload = parseCalendarPayload(input.payload);
    return eventPayload
      ? { mode: 'calendar-workflow', eventPayload }
      : { mode: 'invalid', error: 'invalid-calendar-payload' };
  }

  if (isThumbnailDecisionKind(input.kind)) {
    return { mode: 'decision-only', family: 'youtube-thumbnail' };
  }

  if (input.kind === WORKFLOW_CAPTURE_REQUEST_KIND) {
    return { mode: 'workflow-capture' };
  }

  if (isReportKind(input.kind)) {
    return { mode: 'next-step-only' };
  }

  return { mode: 'invalid', error: 'unsupported-action-kind' };
}
