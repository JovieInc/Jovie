import type {
  OpportunityInboxCardCategory,
  OpportunityInboxTourDateItem,
} from './opportunity-inbox-types';

/**
 * Pure tour-date signal classification + row mapping for the Opportunity
 * Inbox. No server imports so the classifier stays unit-testable and safe to
 * share with client view code.
 */

interface TourDateSignalInput {
  readonly kind: string;
  readonly payload: unknown;
  readonly rationale: string | null;
}

/** Kinds that are tour/event signals by construction. */
const TOUR_DATE_KIND_PREFIXES = ['tour_date', 'tour.', 'event.'] as const;

/** Kinds that MAY carry a tour date depending on payload content. */
const CANDIDATE_KINDS = new Set(['calendar.create_event']);

/** Payload fields that indicate structured event/venue data. */
const VENUE_FIELDS = ['venueName', 'venue', 'city', 'location'] as const;

const TOUR_KEYWORD_PATTERN =
  /\b(tour|concert|gig|festival|headlin\w*|support slot|opening for|on sale|tickets?|venue|live at|show at|residency)\b/i;

function payloadRecord(payload: unknown): Record<string, unknown> | null {
  return payload && typeof payload === 'object'
    ? (payload as Record<string, unknown>)
    : null;
}

function hasVenueShapedPayload(payload: unknown): boolean {
  const record = payloadRecord(payload);
  if (!record) {
    return false;
  }
  return VENUE_FIELDS.some(field => {
    const value = record[field];
    return typeof value === 'string' && value.trim().length > 0;
  });
}

function textSignals(input: TourDateSignalInput): string {
  const record = payloadRecord(input.payload);
  const title = record?.title;
  const payloadRationale = record?.rationale;
  return [
    typeof title === 'string' ? title : '',
    typeof payloadRationale === 'string' ? payloadRationale : '',
    input.rationale ?? '',
  ].join(' ');
}

/**
 * Detects whether an incoming suggested-action signal looks like a tour
 * date/event. Kind-prefix matches are definitive; candidate kinds (calendar
 * events) qualify via structured venue fields or tour keywords in the
 * title/rationale.
 */
export function looksLikeTourDateSignal(input: TourDateSignalInput): boolean {
  const kind = input.kind.toLowerCase();
  if (TOUR_DATE_KIND_PREFIXES.some(prefix => kind.startsWith(prefix))) {
    return true;
  }
  if (!CANDIDATE_KINDS.has(kind)) {
    return false;
  }
  return (
    hasVenueShapedPayload(input.payload) ||
    TOUR_KEYWORD_PATTERN.test(textSignals(input))
  );
}

export function classifySuggestedActionCategory(
  input: TourDateSignalInput
): OpportunityInboxCardCategory {
  return looksLikeTourDateSignal(input) ? 'tour_date' : 'suggestion';
}

/** Minimal row shape needed from `tour_dates` to build an inbox item. */
export interface TourDateInboxRow {
  readonly id: string;
  readonly title: string | null;
  readonly startDate: Date;
  readonly startTime: string | null;
  readonly venueName: string;
  readonly city: string;
  readonly region: string | null;
  readonly country: string;
  readonly provider: string;
  readonly confirmationStatus: 'pending' | 'confirmed' | 'rejected';
}

const PROVIDER_LABELS: Readonly<Record<string, string>> = {
  bandsintown: 'Bandsintown',
  songkick: 'Songkick',
  manual: 'Manual',
  admin_import: 'Import',
};

export function formatTourDateLocation(row: {
  readonly city: string;
  readonly region: string | null;
  readonly country: string;
}): string {
  const regionOrCountry = row.region?.trim() || row.country;
  return [row.city, regionOrCountry].filter(Boolean).join(', ');
}

const TOUR_DATE_DISPLAY_FORMAT = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * Deterministic (UTC-anchored) display date so server and client render the
 * same string — venue-local wall time is carried separately in `startTime`.
 */
export function formatTourDateDisplay(
  startDate: string,
  startTime: string | null
): string {
  const parsed = new Date(startDate);
  if (Number.isNaN(parsed.getTime())) {
    return startDate;
  }
  const datePart = TOUR_DATE_DISPLAY_FORMAT.format(parsed);
  return startTime ? `${datePart} · ${startTime}` : datePart;
}

export function mapTourDateRowToInboxItem(
  row: TourDateInboxRow
): OpportunityInboxTourDateItem {
  return {
    id: row.id,
    title: row.title?.trim() || row.venueName,
    startDate: row.startDate.toISOString(),
    startTime: row.startTime,
    venueName: row.venueName,
    location: formatTourDateLocation(row),
    providerLabel: PROVIDER_LABELS[row.provider] ?? 'Detected',
    status: row.confirmationStatus,
  };
}
