import { and, desc, sql as drizzleSql, eq, ne } from 'drizzle-orm';

import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import {
  type FeedbackClassification,
  type FeedbackDecisionKind,
  type FeedbackDisposition,
  type FeedbackVote,
  feedbackDecisions,
  feedbackItems,
  type NewFeedbackDecisionRow,
} from '@/lib/db/schema/feedback';
import {
  classifyFeedbackMessage,
  feedbackFingerprint,
  isTasteBearing,
} from '@/lib/feedback-classification';

export type FeedbackContext = Record<string, unknown> & {
  pathname: string | null;
  userAgent: string | null;
  timestampIso: string;
};

export interface FeedbackAdminRow {
  id: string;
  message: string;
  source: string;
  status: 'pending' | 'dismissed';
  classification: FeedbackClassification | null;
  disposition: FeedbackDisposition;
  context: Record<string, unknown>;
  dismissedAt: Date | null;
  createdAt: Date;
  user: {
    id: string | null;
    name: string | null;
    email: string | null;
    clerkId: string | null;
  };
}

export interface AdminFeedbackItemsResult {
  readonly items: FeedbackAdminRow[];
  readonly error: string | null;
}

const CLASSIFIER_ACTOR = 'system:classifier';

/**
 * Closed-loop routing only applies to free-text feedback intakes
 * (JOV-6433). Other `feedback_items` writers — abuse reports, inbox-decision
 * learning rows — have their own disposition machinery and are left
 * unclassified (disposition stays 'pending', no ledger rows).
 */
const CLOSED_LOOP_SOURCES = new Set(['dashboard', 'chat', 'agent_cli']);

/**
 * Closed-loop routing (JOV-6433), event-driven on new feedback only — no
 * timers. Dedupes verifiable bugs by canonical fingerprint before the
 * auto-remediation path, emits a Summer signal for features/changes, and
 * writes every decision to the durable `feedback_decisions` ledger.
 */
async function routeClassifiedFeedback(item: {
  id: string;
  message: string;
  source: string;
  context: Record<string, unknown>;
  classification: FeedbackClassification;
  fingerprint: string;
}): Promise<void> {
  const decisions: NewFeedbackDecisionRow[] = [
    {
      feedbackItemId: item.id,
      decision: 'classified',
      reason: `classified:${item.classification}`,
      actor: CLASSIFIER_ACTOR,
      payload: {
        classification: item.classification,
        tasteBearing: isTasteBearing(item.message),
        source: item.source,
        pathname:
          typeof item.context.pathname === 'string'
            ? item.context.pathname
            : null,
      },
    },
  ];

  let disposition: FeedbackDisposition;

  if (item.classification === 'bug_verifiable') {
    // Canonical dedupe: identical fingerprints update one case; near-matches
    // never merge rows (JOV-6433 — repeated reports ≠ independent customers).
    const [canonical] = await db
      .select({ id: feedbackItems.id })
      .from(feedbackItems)
      .where(
        and(
          eq(feedbackItems.fingerprint, item.fingerprint),
          eq(feedbackItems.classification, 'bug_verifiable'),
          ne(feedbackItems.id, item.id)
        )
      )
      .limit(1);

    if (canonical) {
      disposition = 'duplicate';
      decisions.push(
        {
          feedbackItemId: item.id,
          decision: 'duplicate_of',
          reason: 'identical fingerprint to existing bug case',
          actor: CLASSIFIER_ACTOR,
          payload: { canonicalItemId: canonical.id },
        },
        {
          feedbackItemId: canonical.id,
          decision: 'duplicate_observed',
          reason: 'additional occurrence of the same defect',
          actor: CLASSIFIER_ACTOR,
          payload: { duplicateItemId: item.id },
        }
      );
    } else {
      // Verifiable bug → auto remediation/ship path, no founder taste gate.
      disposition = 'auto_remediation';
      decisions.push({
        feedbackItemId: item.id,
        decision: 'auto_ship_bug',
        reason: 'verifiable bug candidate enters authorized repair path',
        actor: CLASSIFIER_ACTOR,
        payload: { fingerprint: item.fingerprint },
      });
    }
  } else if (item.classification === 'feature_or_change') {
    const tasteBearing = isTasteBearing(item.message);
    // Summer signal: rank against strategy; Summer records now|later|never
    // with reason + timestamp + actor back into this same ledger.
    disposition = tasteBearing ? 'cert_required' : 'pending_summer';
    decisions.push({
      feedbackItemId: item.id,
      decision: 'summer_signal',
      reason: 'feature/change awaiting Summer now-later-never rank',
      actor: CLASSIFIER_ACTOR,
      payload: {
        source: item.source,
        tasteBearing,
        pathname:
          typeof item.context.pathname === 'string'
            ? item.context.pathname
            : null,
      },
    });
    if (tasteBearing) {
      decisions.push({
        feedbackItemId: item.id,
        decision: 'taste_cert_required',
        reason: 'taste-bearing change requires machine-cert then human-cert',
        actor: CLASSIFIER_ACTOR,
      });
    }
  } else {
    disposition = 'never';
    decisions.push({
      feedbackItemId: item.id,
      decision: 'noise',
      reason: 'no actionable signal in report',
      actor: CLASSIFIER_ACTOR,
    });
  }

  // Ledger first, disposition second — a disposition never exists without a
  // recorded decision.
  await db.insert(feedbackDecisions).values(decisions);
  await db
    .update(feedbackItems)
    .set({ disposition, updatedAt: new Date() })
    .where(eq(feedbackItems.id, item.id));
}

export async function createFeedbackItem(params: {
  userId: string | null;
  message: string;
  source?: string;
  context: FeedbackContext;
}): Promise<{ id: string }> {
  const source = params.source ?? 'dashboard';
  const inClosedLoop = CLOSED_LOOP_SOURCES.has(source);
  const classification = inClosedLoop
    ? classifyFeedbackMessage(params.message, {
        source,
        context: params.context,
      })
    : null;
  const fingerprint = inClosedLoop ? feedbackFingerprint(params.message) : null;

  try {
    const [item] = await db
      .insert(feedbackItems)
      .values({
        userId: params.userId,
        message: params.message,
        source,
        context: params.context,
        status: 'pending',
        classification,
        fingerprint,
      })
      .returning({ id: feedbackItems.id });

    if (!item) {
      throw new Error('Feedback persistence returned no row');
    }

    try {
      if (classification && fingerprint) {
        await routeClassifiedFeedback({
          id: item.id,
          message: params.message,
          source,
          context: params.context,
          classification,
          fingerprint,
        });
      }
    } catch (routingError) {
      // Capture is already durable; leave the row pending rather than
      // silently misrouting. The ledger gap is observable via disposition.
      console.error('[feedback] routing failed:', routingError);
    }

    return item;
  } catch (error) {
    console.error('[feedback] createFeedbackItem failed:', error);
    throw error;
  }
}

export interface FeedbackDecision {
  readonly id: string;
  readonly feedbackItemId: string;
  readonly decision: FeedbackDecisionKind;
  readonly reason: string;
  readonly actor: string;
  readonly payload: Record<string, unknown>;
  readonly createdAt: Date;
}

/** Queryable decision ledger for one item (JOV-6433), oldest first. */
export async function getFeedbackDecisions(
  feedbackItemId: string
): Promise<FeedbackDecision[]> {
  const rows = await db
    .select()
    .from(feedbackDecisions)
    .where(eq(feedbackDecisions.feedbackItemId, feedbackItemId))
    .orderBy(feedbackDecisions.createdAt);
  return rows;
}

/**
 * Records a now/later/never disposition (Summer or admin actor). Ledger row
 * first, then the item's disposition — reason + actor are required so a
 * decision is never re-made without prior context.
 */
export async function recordFeedbackDisposition(input: {
  readonly feedbackItemId: string;
  readonly disposition: 'now' | 'later' | 'never';
  readonly reason: string;
  readonly actor: string;
  readonly payload?: Record<string, unknown>;
}): Promise<{ id: string } | undefined> {
  await db.insert(feedbackDecisions).values({
    feedbackItemId: input.feedbackItemId,
    decision: input.disposition,
    reason: input.reason,
    actor: input.actor,
    payload: input.payload ?? {},
  });

  const [item] = await db
    .update(feedbackItems)
    .set({ disposition: input.disposition, updatedAt: new Date() })
    .where(eq(feedbackItems.id, input.feedbackItemId))
    .returning({ id: feedbackItems.id });

  return item;
}

export async function getAdminFeedbackItems(
  limit = 100
): Promise<FeedbackAdminRow[]> {
  const rows = await db
    .select({
      id: feedbackItems.id,
      message: feedbackItems.message,
      source: feedbackItems.source,
      status: feedbackItems.status,
      classification: feedbackItems.classification,
      disposition: feedbackItems.disposition,
      context: feedbackItems.context,
      dismissedAt: feedbackItems.dismissedAt,
      createdAt: feedbackItems.createdAt,
      userId: users.id,
      userName: users.name,
      userEmail: users.email,
      userClerkId: users.clerkId,
    })
    .from(feedbackItems)
    .leftJoin(users, eq(feedbackItems.userId, users.id))
    .orderBy(desc(feedbackItems.createdAt))
    .limit(limit);

  return rows.map(row => ({
    id: row.id,
    message: row.message,
    source: row.source,
    status: row.status,
    classification: row.classification,
    disposition: row.disposition,
    context: (row.context ?? {}) as Record<string, unknown>,
    dismissedAt: row.dismissedAt,
    createdAt: row.createdAt,
    user: {
      id: row.userId,
      name: row.userName,
      email: row.userEmail,
      clerkId: row.userClerkId,
    },
  }));
}

export async function getAdminFeedbackItemsResult(
  limit = 100
): Promise<AdminFeedbackItemsResult> {
  try {
    return { items: await getAdminFeedbackItems(limit), error: null };
  } catch (error) {
    console.error('[feedback] getAdminFeedbackItems failed:', error);
    return {
      items: [],
      error:
        error instanceof Error
          ? error.message
          : 'Unable to load feedback items',
    };
  }
}

export async function dismissFeedbackItem(id: string) {
  try {
    const [item] = await db
      .update(feedbackItems)
      .set({
        status: 'dismissed',
        dismissedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(feedbackItems.id, id), eq(feedbackItems.status, 'pending')))
      .returning({ id: feedbackItems.id });

    return item;
  } catch (error) {
    console.error('[feedback] dismissFeedbackItem failed:', error);
    return undefined;
  }
}

const EMPTY_FEEDBACK_COUNTS = { total: 0, pending: 0, dismissed: 0 } as const;

export async function getFeedbackCounts() {
  try {
    const rows = await db
      .select({
        status: feedbackItems.status,
        count: drizzleSql<number>`count(*)::int`,
      })
      .from(feedbackItems)
      .groupBy(feedbackItems.status);

    return {
      total: rows.reduce((acc, row) => acc + (row.count ?? 0), 0),
      pending: rows.find(r => r.status === 'pending')?.count ?? 0,
      dismissed: rows.find(r => r.status === 'dismissed')?.count ?? 0,
    };
  } catch (error) {
    console.error('[feedback] getFeedbackCounts failed:', error);
    return EMPTY_FEEDBACK_COUNTS;
  }
}

export interface ChatMessageVoteInput {
  readonly userId: string;
  readonly messageId: string;
  readonly vote: FeedbackVote;
  readonly conversationId?: string | null;
  readonly turnId?: string | null;
  readonly toolCallId?: string | null;
  readonly toolName?: string | null;
  readonly modelUsed?: string | null;
  readonly plan?: string | null;
  readonly messageExcerpt?: string | null;
  readonly context?: Record<string, unknown>;
}

/**
 * Idempotent 👍/👎 vote upsert for a chat message or tool result
 * (JOV #11460). One row per (user, message, tool call) — re-voting updates
 * the existing row in place via the `feedback_items_vote_unique` index.
 */
export async function upsertChatMessageVote(
  input: ChatMessageVoteInput
): Promise<{ id: string }> {
  const now = new Date();
  const toolCallId = input.toolCallId ?? '';
  const message =
    input.messageExcerpt?.trim() ||
    `Chat ${toolCallId ? 'tool result' : 'message'} vote`;

  const [item] = await db
    .insert(feedbackItems)
    .values({
      userId: input.userId,
      message,
      source: 'chat_thumbs',
      status: 'pending',
      context: input.context ?? {},
      messageId: input.messageId,
      conversationId: input.conversationId ?? null,
      turnId: input.turnId ?? null,
      toolCallId,
      toolName: input.toolName ?? null,
      modelUsed: input.modelUsed ?? null,
      plan: input.plan ?? null,
      vote: input.vote,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        feedbackItems.userId,
        feedbackItems.messageId,
        feedbackItems.toolCallId,
      ],
      targetWhere: drizzleSql`${feedbackItems.messageId} IS NOT NULL`,
      set: {
        vote: input.vote,
        message,
        context: input.context ?? {},
        conversationId: input.conversationId ?? null,
        turnId: input.turnId ?? null,
        toolName: input.toolName ?? null,
        modelUsed: input.modelUsed ?? null,
        plan: input.plan ?? null,
        updatedAt: now,
      },
    })
    .returning({ id: feedbackItems.id });

  if (!item) {
    throw new Error('Chat vote persistence returned no row');
  }

  return item;
}

/**
 * Removes a previously recorded vote (the user un-voted). Idempotent —
 * deleting a vote that does not exist is a no-op.
 */
export async function deleteChatMessageVote(input: {
  readonly userId: string;
  readonly messageId: string;
  readonly toolCallId?: string | null;
}): Promise<void> {
  await db
    .delete(feedbackItems)
    .where(
      and(
        eq(feedbackItems.userId, input.userId),
        eq(feedbackItems.messageId, input.messageId),
        eq(feedbackItems.toolCallId, input.toolCallId ?? '')
      )
    );
}
