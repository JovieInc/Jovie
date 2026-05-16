/**
 * calendar.createEvent — idempotent Google Calendar event creation.
 *
 * Design invariants:
 * 1. REFUSES to run unless the `suggested_actions` row for `approvalId` has
 *    status='accepted' for the calling `userId`. Throws otherwise.
 * 2. Uses `suggestedActions.idempotencyKey` as the Google Calendar event.id
 *    so retries are at-most-once at the provider level.
 * 3. Treats Google 409 (duplicate event ID) as success — the event was already
 *    created by a prior run.
 * 4. On success, CAS-transitions the row: accepted → completed.
 *
 * This file is intentionally a write tool only — it does not read or sync
 * calendar events. That concern lives in the C-PR-2 driver.
 */

import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { suggestedActions } from '@/lib/db/schema/connectors';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const CalendarEventPayloadSchema = z.object({
  title: z.string().min(1),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }).optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  /** Timezone identifier, e.g. "America/New_York". Defaults to UTC. */
  timeZone: z.string().default('UTC'),
});

export type CalendarEventPayload = z.infer<typeof CalendarEventPayloadSchema>;

export interface CreateEventInput {
  /** The `suggested_actions.id` whose approval is being executed. */
  approvalId: string;
  /** The userId executing the action — must own the suggested_actions row. */
  userId: string;
  /** The event payload. Validated against CalendarEventPayloadSchema. */
  payload: CalendarEventPayload;
  /**
   * Injected Google Calendar API client factory for testing.
   * If not provided, a real Google API client is expected (wired by C-PR-2 driver).
   * In v1 tests this is always a mock.
   */
  calendarClient?: CalendarApiClient;
}

export interface CalendarApiClient {
  createEvent(params: {
    calendarId: string;
    eventId: string;
    event: GoogleCalendarEvent;
  }): Promise<{ id: string }>;
}

export interface GoogleCalendarEvent {
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
}

export interface CreateEventResult {
  googleEventId: string;
  idempotent: boolean;
}

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

export class ApprovalRequiredError extends Error {
  constructor(
    public readonly approvalId: string,
    public readonly reason: 'not_found' | 'not_accepted' | 'wrong_user'
  ) {
    super(
      `createEvent refused: approval ${approvalId} is not in accepted state for this user (reason: ${reason})`
    );
    this.name = 'ApprovalRequiredError';
  }
}

export class CalendarWriteError extends Error {
  constructor(
    public readonly approvalId: string,
    cause: unknown
  ) {
    super(
      `createEvent failed for approval ${approvalId}: ${cause instanceof Error ? cause.message : String(cause)}`
    );
    this.name = 'CalendarWriteError';
    this.cause = cause;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a UUID to a safe Google Calendar event.id.
 * Google requires: [a-v0-9] (base32hex), length 5–1024.
 * We use a simple approach: strip hyphens, convert hex chars to their base32hex
 * equivalent by mapping a-f → a-f (these are already in [a-v]), keep 0-9.
 * UUID is 32 hex chars after stripping hyphens — well within length limits.
 */
export function uuidToGoogleEventId(uuid: string): string {
  // Strip hyphens from UUID, yielding 32 lowercase hex chars (0-9, a-f).
  // Base32hex alphabet is 0-9, a-v — hex chars 0-9 and a-f are all valid.
  return uuid.replaceAll('-', '').toLowerCase();
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Create a Google Calendar event for an approved suggested_action.
 *
 * Throws `ApprovalRequiredError` if the approval gate is not met.
 * Throws `CalendarWriteError` on unexpected API failure.
 * Treats Google 409 as idempotent success.
 */
export async function createCalendarEvent(
  input: CreateEventInput
): Promise<CreateEventResult> {
  const { approvalId, userId, payload, calendarClient } = input;

  // ---------------------------------------------------------------------------
  // 1. Gate: verify the row is accepted for this userId
  // ---------------------------------------------------------------------------
  const [action] = await db
    .select({
      id: suggestedActions.id,
      status: suggestedActions.status,
      userId: suggestedActions.userId,
      idempotencyKey: suggestedActions.idempotencyKey,
    })
    .from(suggestedActions)
    .where(eq(suggestedActions.id, approvalId))
    .limit(1);

  if (!action) {
    throw new ApprovalRequiredError(approvalId, 'not_found');
  }
  if (action.userId !== userId) {
    throw new ApprovalRequiredError(approvalId, 'wrong_user');
  }
  if (action.status !== 'accepted') {
    throw new ApprovalRequiredError(approvalId, 'not_accepted');
  }

  // ---------------------------------------------------------------------------
  // 2. Derive deterministic Google event ID from idempotencyKey (= the row id)
  // ---------------------------------------------------------------------------
  const googleEventId = uuidToGoogleEventId(action.idempotencyKey);

  // ---------------------------------------------------------------------------
  // 3. Call Google Calendar API
  // ---------------------------------------------------------------------------
  const client = calendarClient;
  if (!client) {
    throw new Error(
      'createCalendarEvent: no calendarClient injected — wire via C-PR-2 driver'
    );
  }

  const endsAt =
    payload.endsAt ??
    // Default: 1 hour after start if no end time given
    new Date(
      new Date(payload.startsAt).getTime() + 60 * 60 * 1000
    ).toISOString();

  const googleEvent: GoogleCalendarEvent = {
    summary: payload.title,
    ...(payload.description && { description: payload.description }),
    ...(payload.location && { location: payload.location }),
    start: { dateTime: payload.startsAt, timeZone: payload.timeZone },
    end: { dateTime: endsAt, timeZone: payload.timeZone },
  };

  let idempotent = false;

  try {
    await client.createEvent({
      calendarId: 'primary',
      eventId: googleEventId,
      event: googleEvent,
    });
  } catch (err: unknown) {
    // Google returns HTTP 409 when the event.id already exists — treat as
    // idempotent success so retry-safe cron processing works correctly.
    const isConflict =
      err !== null &&
      typeof err === 'object' &&
      'status' in err &&
      (err as Record<string, unknown>).status === 409;

    if (isConflict) {
      idempotent = true;
      logger.info(
        '[calendar.createEvent] Google 409 — event already exists, treating as success',
        { approvalId, googleEventId }
      );
    } else {
      throw new CalendarWriteError(approvalId, err);
    }
  }

  // ---------------------------------------------------------------------------
  // 4. CAS: transition accepted → completed
  // ---------------------------------------------------------------------------
  const casUpdated = await db
    .update(suggestedActions)
    .set({
      status: 'completed',
      executedAt: new Date(),
      executionResult: { googleEventId, idempotent },
    })
    .where(
      and(
        eq(suggestedActions.id, approvalId),
        eq(suggestedActions.userId, userId),
        eq(suggestedActions.status, 'accepted')
      )
    )
    .returning({ id: suggestedActions.id });

  if (casUpdated.length === 0) {
    // Another concurrent executor already CAS-transitioned this row.
    // The calendar event is already created — log and treat as success.
    logger.warn(
      '[calendar.createEvent] CAS accepted→completed missed — concurrent executor won',
      { approvalId, googleEventId }
    );
    await captureError(
      'Calendar createEvent CAS miss (concurrent executor)',
      new Error('CAS miss on accepted→completed'),
      { approvalId, googleEventId }
    );
  }

  logger.info('[calendar.createEvent] Event created', {
    approvalId,
    googleEventId,
    idempotent,
  });

  return { googleEventId, idempotent };
}
