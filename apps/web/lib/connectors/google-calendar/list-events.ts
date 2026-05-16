import 'server-only';
import { env } from '@/lib/env-server';
import { serverFetch } from '@/lib/http/server-fetch';
import { logger } from '@/lib/utils/logger';

const CALENDAR_BASE =
  'https://www.googleapis.com/calendar/v3/calendars/primary';

// Default window: 90 days past, 365 days future.
const DEFAULT_PAST_DAYS = 90;
const DEFAULT_FUTURE_DAYS = 365;

export interface CalendarEvent {
  readonly id: string;
  readonly summary: string;
  readonly description?: string;
  readonly location?: string;
  readonly start: {
    readonly dateTime?: string;
    readonly date?: string;
    readonly timeZone?: string;
  };
  readonly end: {
    readonly dateTime?: string;
    readonly date?: string;
    readonly timeZone?: string;
  };
  readonly status: string;
  readonly etag: string;
}

export interface CalendarEventsListResponse {
  readonly items: CalendarEvent[];
  readonly nextSyncToken?: string;
  readonly nextPageToken?: string;
}

/**
 * Lists Google Calendar events within a time window around today.
 * Uses the window from `GOOGLE_CALENDAR_DEFAULT_WINDOW_DAYS` env var if set,
 * otherwise defaults to 90 days past / 365 days future.
 *
 * @param accessToken - Decrypted OAuth access token.
 * @param syncToken - Optional Google Calendar sync token for incremental fetches.
 *                    When provided, only changes since last sync are returned.
 * @returns Events list response including nextSyncToken for future incremental fetches.
 */
export async function listCalendarEvents(
  accessToken: string,
  syncToken?: string
): Promise<CalendarEventsListResponse> {
  const windowDays = parseInt(
    env.GOOGLE_CALENDAR_DEFAULT_WINDOW_DAYS ?? '',
    10
  );
  const pastDays = isNaN(windowDays) ? DEFAULT_PAST_DAYS : windowDays;
  const futureDays = isNaN(windowDays) ? DEFAULT_FUTURE_DAYS : windowDays;

  const now = new Date();
  const timeMin = new Date(
    now.getTime() - pastDays * 24 * 60 * 60 * 1000
  ).toISOString();
  const timeMax = new Date(
    now.getTime() + futureDays * 24 * 60 * 60 * 1000
  ).toISOString();

  const params = new URLSearchParams({
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  });

  if (syncToken) {
    // Incremental fetch — only use sync token, not time bounds.
    params.delete('singleEvents');
    params.delete('orderBy');
    params.delete('maxResults');
    params.set('syncToken', syncToken);
  } else {
    params.set('timeMin', timeMin);
    params.set('timeMax', timeMax);
  }

  const res = await serverFetch(`${CALENDAR_BASE}/events?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeoutMs: 15_000,
    context: 'Google Calendar list events',
    retry: {
      maxRetries: 2,
      baseDelayMs: 500,
      maxDelayMs: 2000,
      retryOn: ({ response }) => {
        // Don't retry on 410 (sync token expired) — caller must handle.
        if (response?.status === 410) return false;
        return true;
      },
    },
  });

  if (res.status === 410) {
    // Sync token expired — signal caller to do a full re-sync.
    throw new SyncTokenExpiredError();
  }

  if (res.status === 403) {
    logger.error('[google-calendar/list-events] 403 — scope or quota issue');
    throw new Error('Calendar access forbidden (403) — check scopes or quota');
  }

  if (res.status === 429) {
    logger.error('[google-calendar/list-events] 429 — rate limited');
    throw new Error('Calendar rate limited (429)');
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Calendar list events failed: ${res.status} ${body}`);
  }

  return (await res.json()) as CalendarEventsListResponse;
}

/** Thrown when a Google Calendar sync token has expired and a full re-sync is needed. */
export class SyncTokenExpiredError extends Error {
  constructor() {
    super('Google Calendar sync token expired — full re-sync required');
    this.name = 'SyncTokenExpiredError';
  }
}

/**
 * Returns the start datetime (ISO string) for a calendar event,
 * preferring dateTime over all-day date.
 */
export function getEventStart(event: CalendarEvent): string | null {
  return event.start.dateTime ?? event.start.date ?? null;
}

/**
 * Returns the end datetime (ISO string) for a calendar event.
 */
export function getEventEnd(event: CalendarEvent): string | null {
  return event.end.dateTime ?? event.end.date ?? null;
}

/**
 * Checks if a proposed event datetime overlaps with any existing calendar event.
 * Used to detect duplicates before creating a suggested action.
 *
 * @param proposedStart - ISO 8601 datetime string for the proposed event.
 * @param existingEvents - Events from listCalendarEvents().
 * @param toleranceHours - Events within this many hours are considered overlapping (default 6).
 */
export function hasOverlappingEvent(
  proposedStart: string,
  existingEvents: CalendarEvent[],
  toleranceHours = 6
): boolean {
  const proposed = new Date(proposedStart).getTime();
  const toleranceMs = toleranceHours * 60 * 60 * 1000;

  return existingEvents.some(event => {
    const start = getEventStart(event);
    if (!start) return false;
    const diff = Math.abs(new Date(start).getTime() - proposed);
    return diff <= toleranceMs;
  });
}
