import 'server-only';

import { and, eq, gte, inArray, lt } from 'drizzle-orm';
import {
  buildLimitedDropReadModel,
  LIMITED_DROP_EVENT_NAMES,
  type LimitedDropReadModel,
  type LimitedDropReadModelInput,
  limitedDropEventSchema,
} from '@/lib/analytics/limited-drop-funnel';
import { db } from '@/lib/db';
import { serverAnalyticsEvents } from '@/lib/db/schema/analytics';
import {
  type ServerAnalyticsDelivery,
  trackServerEvent,
} from '@/lib/server-analytics';

export type LimitedDropRecordResult =
  | ServerAnalyticsDelivery
  | { readonly ok: false; readonly error: 'invalid_event' };

export async function recordLimitedDropEvent(
  input: unknown
): Promise<LimitedDropRecordResult> {
  const parsed = limitedDropEventSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_event' };

  const {
    event_name: eventName,
    occurred_at: occurredAt,
    ...properties
  } = parsed.data;
  return trackServerEvent(eventName, properties, undefined, {
    eventIdentity: `limited-drop:${properties.event_id}`,
    occurredAt: new Date(occurredAt),
  });
}

export interface LimitedDropReadModelQuery extends LimitedDropReadModelInput {
  readonly artistId: string;
}

export async function getLimitedDropReadModel(
  input: LimitedDropReadModelQuery
): Promise<LimitedDropReadModel> {
  const rows = await db
    .select({
      eventName: serverAnalyticsEvents.eventName,
      properties: serverAnalyticsEvents.properties,
      occurredAt: serverAnalyticsEvents.occurredAt,
      createdAt: serverAnalyticsEvents.createdAt,
    })
    .from(serverAnalyticsEvents)
    .where(
      and(
        inArray(serverAnalyticsEvents.eventName, [...LIMITED_DROP_EVENT_NAMES]),
        eq(serverAnalyticsEvents.sourceEntityType, 'creator_profile'),
        eq(serverAnalyticsEvents.sourceEntityId, input.artistId),
        gte(serverAnalyticsEvents.occurredAt, input.start),
        lt(serverAnalyticsEvents.occurredAt, input.end)
      )
    );

  return buildLimitedDropReadModel(
    rows.map(row => ({
      ...row.properties,
      event_name: row.eventName,
      occurred_at: row.occurredAt.toISOString(),
      ingested_at: row.createdAt.toISOString(),
    })),
    input
  );
}
