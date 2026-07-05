import 'server-only';

import { and, desc, eq } from 'drizzle-orm';
import { extractEventSignal } from '@/lib/connectors/gmail/extract-event-signal';
import {
  hasOverlappingEvent,
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
  extractGmailMentions,
  type GmailObjectPayload,
} from '../parse-mentions';
import { emitCalendarCreateSuggestions } from '../suggestions';
import type {
  ConnectorEnrichmentAccountContext,
  ConnectorEnrichmentPipeline,
  ConnectorEnrichmentPipelineResult,
  ExtractedEventFact,
} from '../types';

const GMAIL_OBJECT_KIND = 'gmail_message';
const MAX_OBJECTS_PER_RUN = 50;

function toEventFacts(
  events: Awaited<ReturnType<typeof extractEventSignal>>['events']
): ExtractedEventFact[] {
  return events.map(event => ({
    kind: 'event_signal' as const,
    title: event.title,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    venueName: event.venueName,
    city: event.city,
    region: event.region,
    country: event.country,
    confidence: event.confidence,
    rationale: event.rationale,
    sourceRefs: [event.sourceRef],
  }));
}

export const gmailEnrichmentPipeline: ConnectorEnrichmentPipeline = {
  provider: CONNECTOR_PROVIDERS.gmail,

  async run(
    context: ConnectorEnrichmentAccountContext
  ): Promise<ConnectorEnrichmentPipelineResult> {
    const accountId = context.gmailAccountId;
    if (!accountId) {
      return emptyResult(CONNECTOR_PROVIDERS.gmail);
    }

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
          eq(externalObjects.kind, GMAIL_OBJECT_KIND)
        )
      )
      .orderBy(desc(externalObjects.fetchedAt))
      .limit(MAX_OBJECTS_PER_RUN);

    if (objects.length === 0) {
      logger.info(
        '[connector-enrichment/gmail] No external objects to enrich',
        {
          userId: context.scope.userId,
        }
      );
      return emptyResult(CONNECTOR_PROVIDERS.gmail);
    }

    const bridge = new ConnectorMemoryBridge();
    let contextFactsCreated = 0;
    let memoryObservationsCreated = 0;
    let memoryEntitiesCreated = 0;

    for (const object of objects) {
      const payload = object.payload as GmailObjectPayload;
      const mentions = extractGmailMentions(payload);
      const sourceRefs = [
        {
          provider: CONNECTOR_PROVIDERS.gmail,
          providerId: object.providerId,
          subject: payload.subject ?? null,
        },
      ];

      const mentionFacts = await persistEntityMentionFacts({
        userId: context.scope.userId,
        sourceObjectId: object.id,
        sourceRefs,
        mentions,
      });
      contextFactsCreated += mentionFacts.length;

      const memoryResult = await bridge.bridgeEntityMentions({
        scope: context.scope,
        sourceType: 'gmail_message',
        externalId: `gmail:${object.providerId}`,
        sourceMetadata: {
          subject: payload.subject,
          from: payload.from,
          date: payload.date,
          connectorEnrichment: true,
        },
        mentions,
      });
      memoryObservationsCreated += memoryResult.observationsCreated;
      memoryEntitiesCreated += memoryResult.entitiesCreated;
    }

    const extractorInput = objects.map(object => {
      const payload = object.payload as GmailObjectPayload;
      return {
        messageId: object.providerId,
        subject: payload.subject ?? '(no subject)',
        from: payload.from ?? '',
        date: payload.date ?? '',
        snippet: payload.snippet ?? '',
      };
    });

    const extraction = await extractEventSignal(
      extractorInput,
      context.scope.userId
    );
    const eventFacts = toEventFacts(extraction.events);

    if (eventFacts.length > 0) {
      const primaryObject = objects[0];
      if (primaryObject) {
        const persisted = await persistEventSignalFacts({
          userId: context.scope.userId,
          sourceObjectId: primaryObject.id,
          events: eventFacts,
        });
        contextFactsCreated += persisted.length;

        const memoryEvents = await bridge.bridgeEventFacts({
          scope: context.scope,
          sourceType: 'gmail_message',
          externalId: `gmail:${primaryObject.providerId}`,
          sourceMetadata: {
            connectorEnrichment: true,
            batchSize: objects.length,
          },
          events: eventFacts,
        });
        memoryObservationsCreated += memoryEvents.observationsCreated;
        memoryEntitiesCreated += memoryEvents.entitiesCreated;
      }
    }

    let suggestionsCreated = 0;
    if (eventFacts.length > 0 && context.calendarAccountId) {
      const calendarTokens = await loadDecryptedToken(
        context.calendarAccountId
      );
      if (calendarTokens) {
        let calendarEvents;
        try {
          const result = await listCalendarEvents(calendarTokens.accessToken);
          calendarEvents = result.items;
        } catch (error) {
          if (error instanceof SyncTokenExpiredError) {
            const result = await listCalendarEvents(calendarTokens.accessToken);
            calendarEvents = result.items;
          } else {
            throw error;
          }
        }

        suggestionsCreated = await emitCalendarCreateSuggestions({
          userId: context.scope.userId,
          calendarAccountId: context.calendarAccountId,
          events: eventFacts,
          hasCalendarConflict: startsAt =>
            hasOverlappingEvent(startsAt, calendarEvents, 6),
        });
      }
    }

    logger.info('[connector-enrichment/gmail] Complete', {
      userId: context.scope.userId,
      externalObjectsProcessed: objects.length,
      contextFactsCreated,
      memoryObservationsCreated,
      suggestionsCreated,
    });

    return {
      provider: CONNECTOR_PROVIDERS.gmail,
      externalObjectsProcessed: objects.length,
      contextFactsCreated,
      memoryObservationsCreated,
      memoryEntitiesCreated,
      suggestionsCreated,
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
