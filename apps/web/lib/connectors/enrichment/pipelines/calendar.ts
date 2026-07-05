import 'server-only';

import { and, desc, eq } from 'drizzle-orm';
import {
  listCalendarEvents,
  SyncTokenExpiredError,
} from '@/lib/connectors/google-calendar/list-events';
import { CONNECTOR_PROVIDERS } from '@/lib/connectors/registry';
import { loadDecryptedToken } from '@/lib/connectors/token-vault';
import { db } from '@/lib/db';
import { externalObjects } from '@/lib/db/schema/connectors';
import { logger } from '@/lib/utils/logger';
import {
  persistEntityMentionFacts,
  persistEventSignalFacts,
} from '../context-facts';
import { ConnectorMemoryBridge } from '../memory-bridge';
import {
  type CalendarObjectPayload,
  extractCalendarMentions,
} from '../parse-mentions';
import type {
  ConnectorEnrichmentAccountContext,
  ConnectorEnrichmentPipeline,
  ConnectorEnrichmentPipelineResult,
  ExtractedEventFact,
} from '../types';

const CALENDAR_OBJECT_KIND = 'calendar_event';
const MAX_OBJECTS_PER_RUN = 100;

function normalizeCalendarPayload(event: {
  id: string;
  summary: string;
  location?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  etag: string;
}): CalendarObjectPayload & { providerId: string; etag: string } {
  return {
    providerId: event.id,
    etag: event.etag,
    summary: event.summary,
    location: event.location,
    startsAt: event.start.dateTime ?? event.start.date,
    endsAt: event.end.dateTime ?? event.end.date,
  };
}

export const calendarEnrichmentPipeline: ConnectorEnrichmentPipeline = {
  provider: CONNECTOR_PROVIDERS.google_calendar,

  async run(
    context: ConnectorEnrichmentAccountContext
  ): Promise<ConnectorEnrichmentPipelineResult> {
    const accountId = context.calendarAccountId;
    if (!accountId) {
      return emptyResult(CONNECTOR_PROVIDERS.google_calendar);
    }

    const tokens = await loadDecryptedToken(accountId);
    if (!tokens) {
      logger.error('[connector-enrichment/calendar] Token load failed', {
        userId: context.scope.userId,
      });
      return emptyResult(CONNECTOR_PROVIDERS.google_calendar);
    }

    let calendarEvents;
    try {
      const result = await listCalendarEvents(tokens.accessToken);
      calendarEvents = result.items;
    } catch (error) {
      if (error instanceof SyncTokenExpiredError) {
        const result = await listCalendarEvents(tokens.accessToken);
        calendarEvents = result.items;
      } else {
        throw error;
      }
    }

    await Promise.allSettled(
      calendarEvents.map(event => {
        const payload = normalizeCalendarPayload(event);
        return db
          .insert(externalObjects)
          .values({
            connectorAccountId: accountId,
            provider: CONNECTOR_PROVIDERS.google_calendar,
            kind: CALENDAR_OBJECT_KIND,
            providerId: payload.providerId,
            payload: {
              summary: payload.summary,
              location: payload.location,
              startsAt: payload.startsAt,
              endsAt: payload.endsAt,
            },
            etag: payload.etag,
          })
          .onConflictDoUpdate({
            target: [
              externalObjects.connectorAccountId,
              externalObjects.kind,
              externalObjects.providerId,
            ],
            set: {
              payload: {
                summary: payload.summary,
                location: payload.location,
                startsAt: payload.startsAt,
                endsAt: payload.endsAt,
              },
              etag: payload.etag,
              fetchedAt: new Date(),
            },
          });
      })
    );

    const objects = await db
      .select({
        id: externalObjects.id,
        providerId: externalObjects.providerId,
        payload: externalObjects.payload,
      })
      .from(externalObjects)
      .where(
        and(
          eq(externalObjects.connectorAccountId, accountId),
          eq(externalObjects.kind, CALENDAR_OBJECT_KIND)
        )
      )
      .orderBy(desc(externalObjects.fetchedAt))
      .limit(MAX_OBJECTS_PER_RUN);

    const bridge = new ConnectorMemoryBridge();
    let contextFactsCreated = 0;
    let memoryObservationsCreated = 0;
    let memoryEntitiesCreated = 0;
    const gmailEventFacts: ExtractedEventFact[] = [];

    for (const object of objects) {
      const payload = object.payload as CalendarObjectPayload;
      const mentions = extractCalendarMentions(payload);
      const sourceRefs = [
        {
          provider: CONNECTOR_PROVIDERS.google_calendar,
          providerId: object.providerId,
          summary: payload.summary ?? null,
        },
      ];

      const mentionFacts = await persistEntityMentionFacts({
        userId: context.scope.userId,
        sourceObjectId: object.id,
        sourceRefs,
        mentions,
      });
      contextFactsCreated += mentionFacts.length;

      const memoryMentions = await bridge.bridgeEntityMentions({
        scope: context.scope,
        sourceType: 'calendar_event',
        externalId: `calendar:${object.providerId}`,
        sourceMetadata: {
          summary: payload.summary,
          location: payload.location,
          startsAt: payload.startsAt,
          connectorEnrichment: true,
        },
        mentions,
      });
      memoryObservationsCreated += memoryMentions.observationsCreated;
      memoryEntitiesCreated += memoryMentions.entitiesCreated;

      if (payload.summary && payload.startsAt) {
        gmailEventFacts.push({
          kind: 'tour_date_known',
          title: payload.summary,
          startsAt: payload.startsAt,
          endsAt: payload.endsAt ?? null,
          venueName: payload.location ?? null,
          confidence: 0.92,
          rationale:
            'Existing Google Calendar event synced for graph enrichment',
          sourceRefs,
        });
      }
    }

    if (gmailEventFacts.length > 0) {
      const persisted = await persistEventSignalFacts({
        userId: context.scope.userId,
        sourceObjectId: objects[0]?.id ?? null,
        events: gmailEventFacts,
      });
      contextFactsCreated += persisted.length;

      const primary = objects[0];
      if (primary) {
        const memoryEvents = await bridge.bridgeEventFacts({
          scope: context.scope,
          sourceType: 'calendar_event',
          externalId: `calendar:${primary.providerId}`,
          sourceMetadata: { connectorEnrichment: true },
          events: gmailEventFacts,
        });
        memoryObservationsCreated += memoryEvents.observationsCreated;
        memoryEntitiesCreated += memoryEvents.entitiesCreated;
      }
    }

    logger.info('[connector-enrichment/calendar] Complete', {
      userId: context.scope.userId,
      externalObjectsProcessed: objects.length,
      contextFactsCreated,
    });

    return {
      provider: CONNECTOR_PROVIDERS.google_calendar,
      externalObjectsProcessed: objects.length,
      contextFactsCreated,
      memoryObservationsCreated,
      memoryEntitiesCreated,
      suggestionsCreated: 0,
    };
  },
};

function emptyResult(
  provider: ConnectorEnrichmentPipelineResult['provider']
): ConnectorEnrichmentPipelineResult {
  return {
    provider,
    externalObjectsProcessed: 0,
    contextFactsCreated: 0,
    memoryObservationsCreated: 0,
    memoryEntitiesCreated: 0,
    suggestionsCreated: 0,
  };
}
