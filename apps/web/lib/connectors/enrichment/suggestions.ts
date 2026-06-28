import 'server-only';

import { db } from '@/lib/db';
import { suggestedActions } from '@/lib/db/schema/connectors';
import { captureError } from '@/lib/error-tracking';
import type { ExtractedEventFact } from './types';

const MIN_SUGGESTION_CONFIDENCE = 0.7;

export async function emitCalendarCreateSuggestions(input: {
  readonly userId: string;
  readonly calendarAccountId: string;
  readonly events: readonly ExtractedEventFact[];
  readonly hasCalendarConflict: (startsAt: string) => boolean;
}): Promise<number> {
  let created = 0;

  for (const event of input.events) {
    if (event.confidence < MIN_SUGGESTION_CONFIDENCE) continue;
    if (input.hasCalendarConflict(event.startsAt)) continue;

    const messageId = String(
      event.sourceRefs[0]?.messageId ?? event.sourceRefs[0]?.providerId ?? ''
    );
    const sourceRef = {
      messageId,
      subject: String(event.sourceRefs[0]?.subject ?? event.title),
    };

    const payload = {
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt ?? null,
      venueName: event.venueName ?? null,
      city: event.city ?? null,
      region: event.region ?? null,
      country: event.country ?? null,
      rationale: event.rationale,
      confidence: event.confidence,
    };

    try {
      const inserted = await db
        .insert(suggestedActions)
        .values({
          userId: input.userId,
          kind: 'calendar.create_event',
          targetConnectorAccountId: input.calendarAccountId,
          payload,
          status: 'pending',
          sourceRefs: [sourceRef],
          rationale: event.rationale,
          idempotencyKey: `${input.userId}-${messageId}-${event.startsAt}`,
          sideEffects: [],
        })
        .onConflictDoNothing()
        .returning({ id: suggestedActions.id });

      if (inserted.length > 0) created += 1;
    } catch (error) {
      await captureError(
        'Failed to insert connector enrichment suggestion',
        error,
        {
          userId: input.userId,
          eventTitle: event.title,
        }
      );
    }
  }

  return created;
}
