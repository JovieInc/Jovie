import 'server-only';

import {
  and,
  desc,
  sql as drizzleSql,
  eq,
  gte,
  inArray,
  isNull,
} from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { chatConversations, chatMessages } from '@/lib/db/schema/chat';
import {
  conversationObjections,
  conversationSignals,
} from '@/lib/db/schema/conversation-insights';
import {
  aggregateStageInsights,
  type ConversationFunnelStage,
  classifyUserTurns,
  funnelStageForConversation,
  isConversationSampled,
  OBJECTION_CATALOG,
  type ObjectionStatus,
  type SignalRow,
  weekStartUtc,
} from './conversation-insights';

const DEFAULT_SAMPLE_RATE = 0.25;
const SIGNAL_LOOKBACK_WEEKS = 8;
const MAX_EVIDENCE_PER_OBJECTION = 5;

export const conversationInsightRunSchema = z.object({
  sampleRate: z.coerce.number().min(0).max(1).default(DEFAULT_SAMPLE_RATE),
  windowDays: z.coerce.number().int().min(1).max(30).default(7),
  batchLimit: z.coerce.number().int().min(1).max(500).default(200),
});

export type ConversationInsightRunInput = z.infer<
  typeof conversationInsightRunSchema
>;

export type ConversationInsightRunResult = {
  readonly observedAt: string;
  readonly windowStart: string;
  readonly conversationsSeen: number;
  readonly conversationsSampled: number;
  readonly signalsWritten: number;
  readonly objectionsTouched: number;
};

/**
 * Sample recent product-chat conversations (never LYB data), classify them,
 * and store aggregates plus redacted quotes only.
 */
export async function runConversationInsightPipeline(
  input: ConversationInsightRunInput,
  now = new Date()
): Promise<ConversationInsightRunResult> {
  const windowStart = new Date(now.getTime() - input.windowDays * 86_400_000);

  const conversations = await db
    .select({
      id: chatConversations.id,
      userId: chatConversations.userId,
      isPro: users.isPro,
      alreadySignaled: conversationSignals.id,
    })
    .from(chatConversations)
    .leftJoin(users, eq(users.id, chatConversations.userId))
    .leftJoin(
      conversationSignals,
      eq(conversationSignals.conversationId, chatConversations.id)
    )
    .where(
      and(
        gte(chatConversations.updatedAt, windowStart),
        isNull(conversationSignals.id)
      )
    )
    .orderBy(desc(chatConversations.updatedAt))
    .limit(input.batchLimit);

  const sampled = conversations.filter(
    row =>
      !row.alreadySignaled && isConversationSampled(row.id, input.sampleRate)
  );

  if (sampled.length === 0) {
    return {
      observedAt: now.toISOString(),
      windowStart: windowStart.toISOString(),
      conversationsSeen: conversations.length,
      conversationsSampled: 0,
      signalsWritten: 0,
      objectionsTouched: 0,
    };
  }

  const userTurns = await db
    .select({
      conversationId: chatMessages.conversationId,
      content: chatMessages.content,
    })
    .from(chatMessages)
    .where(
      and(
        inArray(
          chatMessages.conversationId,
          sampled.map(row => row.id)
        ),
        eq(chatMessages.role, 'user')
      )
    )
    .orderBy(chatMessages.createdAt);

  const turnsByConversation = new Map<string, string[]>();
  for (const turn of userTurns) {
    const list = turnsByConversation.get(turn.conversationId) ?? [];
    list.push(turn.content);
    turnsByConversation.set(turn.conversationId, list);
  }

  const weekStart = weekStartUtc(now);
  const signalRows: (typeof conversationSignals.$inferInsert)[] = [];
  const objectionHits = new Map<
    string,
    {
      stage: ConversationFunnelStage;
      evidence: { conversationId: string; quote?: string };
    }[]
  >();

  for (const conversation of sampled) {
    const classification = classifyUserTurns(
      turnsByConversation.get(conversation.id) ?? []
    );
    const stage = funnelStageForConversation({
      hasUser: Boolean(conversation.userId),
      isPro: Boolean(conversation.isPro),
    });
    signalRows.push({
      conversationId: conversation.id,
      weekStart,
      stage,
      intent: classification.intent,
      objectionKey: classification.objectionKey ?? null,
      confusionOrBug: classification.confusionOrBug,
      featureAsk: classification.featureAsk ?? null,
      dropOffPoint: classification.dropOffPoint ?? null,
      redactedQuote: classification.quote ?? null,
    });
    if (classification.objectionKey) {
      const hits = objectionHits.get(classification.objectionKey) ?? [];
      hits.push({
        stage,
        evidence: {
          conversationId: conversation.id,
          ...(classification.quote ? { quote: classification.quote } : {}),
        },
      });
      objectionHits.set(classification.objectionKey, hits);
    }
  }

  if (signalRows.length > 0) {
    await db
      .insert(conversationSignals)
      .values(signalRows)
      .onConflictDoNothing({ target: conversationSignals.conversationId });
  }

  for (const [key, hits] of objectionHits) {
    const catalogEntry = OBJECTION_CATALOG.find(entry => entry.key === key);
    if (!catalogEntry) continue;
    const stage = hits[0]!.stage;
    const evidence = hits
      .slice(0, MAX_EVIDENCE_PER_OBJECTION)
      .map(hit => hit.evidence);
    await db
      .insert(conversationObjections)
      .values({
        objectionKey: key,
        objection: catalogEntry.label,
        frequency: hits.length,
        stage,
        source: 'chat',
        draftedAnswer: catalogEntry.draftedAnswer,
        status: 'draft',
        evidence,
        firstSeenAt: now,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: conversationObjections.objectionKey,
        set: {
          frequency: drizzleSql`${conversationObjections.frequency} + ${hits.length}`,
          lastSeenAt: now,
          evidence: drizzleSql`(
            select coalesce(jsonb_agg(e), '[]'::jsonb)
            from (
              select e
              from jsonb_array_elements(
                ${conversationObjections.evidence} || ${JSON.stringify(evidence)}::jsonb
              ) e
              limit ${MAX_EVIDENCE_PER_OBJECTION}
            ) kept
          )`,
        },
      });
  }

  return {
    observedAt: now.toISOString(),
    windowStart: windowStart.toISOString(),
    conversationsSeen: conversations.length,
    conversationsSampled: sampled.length,
    signalsWritten: signalRows.length,
    objectionsTouched: objectionHits.size,
  };
}

export const conversationInsightsQuerySchema = z.object({
  weeks: z.coerce.number().int().min(1).max(SIGNAL_LOOKBACK_WEEKS).default(4),
});

/** Summer read: top objections and asks per funnel stage, week over week. */
export async function getConversationInsights(now = new Date()) {
  const since = new Date(
    weekStartUtc(now).getTime() - (SIGNAL_LOOKBACK_WEEKS - 1) * 7 * 86_400_000
  );
  const rows: SignalRow[] = await db
    .select({
      weekStart: conversationSignals.weekStart,
      stage: conversationSignals.stage,
      intent: conversationSignals.intent,
      objectionKey: conversationSignals.objectionKey,
      confusionOrBug: conversationSignals.confusionOrBug,
      featureAsk: conversationSignals.featureAsk,
      dropOffPoint: conversationSignals.dropOffPoint,
    })
    .from(conversationSignals)
    .where(gte(conversationSignals.weekStart, since));

  const objections = await listConversationObjections({ limit: 20 });

  return {
    observedAt: now.toISOString(),
    stages: aggregateStageInsights(rows, now),
    objections: objections.map(row => ({
      key: row.objectionKey,
      objection: row.objection,
      frequency: row.frequency,
      stage: row.stage,
      source: row.source,
      status: row.status,
      resolutionRef: row.resolutionRef,
    })),
  };
}

export const objectionListQuerySchema = z.object({
  status: z.enum(['draft', 'approved', 'published', 'rejected']).optional(),
  stage: z.enum(['anonymous', 'claimed', 'paid']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export async function listConversationObjections(query: {
  status?: ObjectionStatus;
  stage?: ConversationFunnelStage;
  limit?: number;
}) {
  const conditions = [
    query.status ? eq(conversationObjections.status, query.status) : undefined,
    query.stage ? eq(conversationObjections.stage, query.stage) : undefined,
  ].filter((condition): condition is NonNullable<typeof condition> =>
    Boolean(condition)
  );
  return db
    .select()
    .from(conversationObjections)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(conversationObjections.frequency))
    .limit(query.limit ?? 50);
}

export const objectionDecisionSchema = z.object({
  decision: z.enum(['approve', 'publish', 'reject']),
  draftedAnswer: z.string().trim().min(1).max(2000).optional(),
  resolutionRef: z.string().trim().min(1).max(500).optional(),
});

export type ObjectionDecision =
  | { readonly status: 'updated'; readonly objection: ConversationObjectionRow }
  | { readonly status: 'not_found' }
  | { readonly status: 'invalid'; readonly reason: string };

type ConversationObjectionRow = typeof conversationObjections.$inferSelect;

/**
 * Apply an Inbox-card decision: approve a draft, or publish an approved
 * answer with a resolution reference for the closed conversion loop.
 */
export async function decideConversationObjection(
  id: string,
  input: z.infer<typeof objectionDecisionSchema>,
  now = new Date()
): Promise<ObjectionDecision> {
  const [row] = await db
    .select()
    .from(conversationObjections)
    .where(eq(conversationObjections.id, id))
    .limit(1);
  if (!row) return { status: 'not_found' };

  if (input.decision === 'approve') {
    if (row.status !== 'draft') {
      return { status: 'invalid', reason: 'only_draft_can_be_approved' };
    }
    const answer = input.draftedAnswer ?? row.draftedAnswer;
    if (!answer) {
      return { status: 'invalid', reason: 'drafted_answer_required' };
    }
    const [updated] = await db
      .update(conversationObjections)
      .set({ status: 'approved', draftedAnswer: answer, updatedAt: now })
      .where(eq(conversationObjections.id, id))
      .returning();
    return { status: 'updated', objection: updated! };
  }

  if (input.decision === 'reject') {
    const [updated] = await db
      .update(conversationObjections)
      .set({ status: 'rejected', updatedAt: now })
      .where(eq(conversationObjections.id, id))
      .returning();
    return { status: 'updated', objection: updated! };
  }

  if (row.status !== 'approved' || !row.draftedAnswer) {
    return {
      status: 'invalid',
      reason: 'only_approved_with_answer_can_publish',
    };
  }
  if (!input.resolutionRef) {
    return { status: 'invalid', reason: 'resolution_ref_required' };
  }
  const [updated] = await db
    .update(conversationObjections)
    .set({
      status: 'published',
      resolutionRef: input.resolutionRef,
      resolvedAt: now,
      updatedAt: now,
    })
    .where(eq(conversationObjections.id, id))
    .returning();
  return { status: 'updated', objection: updated! };
}
