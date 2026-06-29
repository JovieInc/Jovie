import 'server-only';

import { db } from '@/lib/db';
import { contextFacts } from '@/lib/db/schema/connectors';
import { contextFactKindEnum } from '@/lib/db/schema/enums';
import type {
  ExtractedEntityMention,
  ExtractedEventFact,
  PersistedContextFact,
} from './types';

type ContextFactKind = (typeof contextFactKindEnum.enumValues)[number];

export async function persistEntityMentionFacts(input: {
  readonly userId: string;
  readonly sourceObjectId: string;
  readonly sourceRefs: readonly Record<string, unknown>[];
  readonly mentions: readonly ExtractedEntityMention[];
}): Promise<readonly PersistedContextFact[]> {
  if (input.mentions.length === 0) return [];

  const rows = await db
    .insert(contextFacts)
    .values(
      input.mentions.map(mention => ({
        userId: input.userId,
        kind: mention.factKind satisfies ContextFactKind,
        sourceObjectId: input.sourceObjectId,
        sourceRefs: input.sourceRefs,
        data: {
          entityType: mention.type,
          name: mention.name,
          ...(mention.metadata ?? {}),
        },
        confidence: mention.confidence.toFixed(2),
      }))
    )
    .returning({
      id: contextFacts.id,
      kind: contextFacts.kind,
      data: contextFacts.data,
      confidence: contextFacts.confidence,
      sourceObjectId: contextFacts.sourceObjectId,
    });

  return rows;
}

export async function persistEventSignalFacts(input: {
  readonly userId: string;
  readonly sourceObjectId: string | null;
  readonly events: readonly ExtractedEventFact[];
}): Promise<readonly PersistedContextFact[]> {
  if (input.events.length === 0) return [];

  const rows = await db
    .insert(contextFacts)
    .values(
      input.events.map(event => ({
        userId: input.userId,
        kind: event.kind satisfies ContextFactKind,
        sourceObjectId: input.sourceObjectId,
        sourceRefs: event.sourceRefs,
        data: {
          title: event.title,
          startsAt: event.startsAt,
          endsAt: event.endsAt ?? null,
          venueName: event.venueName ?? null,
          city: event.city ?? null,
          region: event.region ?? null,
          country: event.country ?? null,
          rationale: event.rationale,
        },
        confidence: event.confidence.toFixed(2),
        expiresAt: new Date(event.startsAt),
      }))
    )
    .returning({
      id: contextFacts.id,
      kind: contextFacts.kind,
      data: contextFacts.data,
      confidence: contextFacts.confidence,
      sourceObjectId: contextFacts.sourceObjectId,
    });

  return rows;
}
