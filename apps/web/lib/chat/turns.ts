import { and, asc, sql as drizzleSql, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  type ChatMessage,
  type ChatTurn,
  chatConversations,
  chatMessages,
  chatTurns,
} from '@/lib/db/schema/chat';
import { sanitizeConversationTitle } from './title';
import type { PersistedToolEvent } from './tool-events';

export type ChatTurnSource = 'typed' | 'quick_action' | 'slash_command';

export type TerminalChatTurnStatus =
  | 'completed'
  | 'failed_tool_unavailable'
  | 'failed_model_error'
  | 'failed_timeout'
  | 'failed_network'
  | 'canceled';

export const TURN_IN_PROGRESS_ERROR_CODE = 'TURN_IN_PROGRESS';

const IN_FLIGHT_STATUSES = new Set<ChatTurn['status']>([
  'reserved',
  'running',
  'streaming',
]);

function toConversationTitle(text: string): string | null {
  return sanitizeConversationTitle(text, 50);
}

async function fetchTurnMessages(turnId: string): Promise<ChatMessage[]> {
  return db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.turnId, turnId))
    .orderBy(asc(chatMessages.createdAt));
}

async function fetchExistingTurn(
  conversationId: string,
  clientTurnId: string
): Promise<ChatTurn | null> {
  const [turn] = await db
    .select()
    .from(chatTurns)
    .where(
      and(
        eq(chatTurns.conversationId, conversationId),
        eq(chatTurns.clientTurnId, clientTurnId)
      )
    )
    .limit(1);

  return turn ?? null;
}

async function fetchExistingClientTurn(input: {
  readonly userId: string;
  readonly creatorProfileId: string;
  readonly clientTurnId: string;
}): Promise<ChatTurn | null> {
  const [turn] = await db
    .select()
    .from(chatTurns)
    .where(
      and(
        eq(chatTurns.userId, input.userId),
        eq(chatTurns.creatorProfileId, input.creatorProfileId),
        eq(chatTurns.clientTurnId, input.clientTurnId)
      )
    )
    .limit(1);

  return turn ?? null;
}

async function toDuplicateReservationResult(
  turn: ChatTurn
): Promise<ReserveChatTurnResult> {
  if (IN_FLIGHT_STATUSES.has(turn.status)) {
    return {
      outcome: 'duplicate_in_progress',
      conversationId: turn.conversationId,
      turn,
    };
  }

  return {
    outcome: 'duplicate_completed',
    conversationId: turn.conversationId,
    turn,
    messages: await fetchTurnMessages(turn.id),
  };
}

export type ReserveChatTurnResult =
  | {
      readonly outcome: 'reserved';
      readonly conversationId: string;
      readonly turn: ChatTurn;
    }
  | {
      readonly outcome: 'duplicate_completed';
      readonly conversationId: string;
      readonly turn: ChatTurn;
      readonly messages: ChatMessage[];
    }
  | {
      readonly outcome: 'duplicate_in_progress';
      readonly conversationId: string;
      readonly turn: ChatTurn;
    };

export async function reserveChatTurn(input: {
  readonly conversationId?: string | null;
  readonly clientTurnId: string;
  readonly clientMessageId?: string | null;
  readonly source: ChatTurnSource;
  readonly toolIntent?: string | null;
  readonly userMessage: string;
  readonly userId: string;
  readonly creatorProfileId: string;
}): Promise<ReserveChatTurnResult> {
  const now = new Date();
  let conversationId = input.conversationId ?? null;
  let createdConversationId: string | null = null;

  if (!conversationId) {
    const existingClientTurn = await fetchExistingClientTurn({
      userId: input.userId,
      creatorProfileId: input.creatorProfileId,
      clientTurnId: input.clientTurnId,
    });

    if (existingClientTurn) {
      return toDuplicateReservationResult(existingClientTurn);
    }
  }

  if (conversationId) {
    const [conversation] = await db
      .select({ id: chatConversations.id })
      .from(chatConversations)
      .where(
        and(
          eq(chatConversations.id, conversationId),
          eq(chatConversations.creatorProfileId, input.creatorProfileId)
        )
      )
      .limit(1);

    if (!conversation) {
      throw new Error('Conversation not found or unauthorized');
    }
  } else {
    const [conversation] = await db
      .insert(chatConversations)
      .values({
        userId: input.userId,
        creatorProfileId: input.creatorProfileId,
        title: toConversationTitle(input.userMessage),
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: chatConversations.id });

    if (!conversation) {
      throw new Error('Failed to create chat conversation');
    }

    conversationId = conversation.id;
    createdConversationId = conversation.id;
  }

  const [insertedTurn] = await db
    .insert(chatTurns)
    .values({
      userId: input.userId,
      creatorProfileId: input.creatorProfileId,
      conversationId,
      clientTurnId: input.clientTurnId,
      status: 'reserved',
      source: input.source,
      toolIntent: input.toolIntent ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: [
        chatTurns.creatorProfileId,
        chatTurns.userId,
        chatTurns.clientTurnId,
      ],
    })
    .returning();

  if (!insertedTurn) {
    if (createdConversationId) {
      await db
        .delete(chatConversations)
        .where(eq(chatConversations.id, createdConversationId));
    }

    const existingTurn =
      (await fetchExistingClientTurn({
        userId: input.userId,
        creatorProfileId: input.creatorProfileId,
        clientTurnId: input.clientTurnId,
      })) ?? (await fetchExistingTurn(conversationId, input.clientTurnId));
    if (!existingTurn) {
      throw new Error('Chat turn conflict could not be resolved');
    }

    return toDuplicateReservationResult(existingTurn);
  }

  // Insert the user message paired to the new turn. We always pass a
  // `clientMessageId` (falling back to the `clientTurnId` when the caller
  // omits one) so the partial unique index
  // `idx_chat_messages_conversation_client_message_unique` covers retried
  // user messages. A bare insert here would otherwise let a retry against a
  // freshly-reserved turn double-write the user row (JOV-2275 incident
  // shape: 51,948 duplicate rows for a single conversation).
  await db
    .insert(chatMessages)
    .values({
      conversationId,
      turnId: insertedTurn.id,
      clientMessageId: input.clientMessageId ?? input.clientTurnId,
      role: 'user',
      content: input.userMessage,
      createdAt: now,
    })
    .onConflictDoNothing({
      target: [chatMessages.conversationId, chatMessages.clientMessageId],
      where: drizzleSql`${chatMessages.clientMessageId} IS NOT NULL`,
    });

  await db
    .update(chatConversations)
    .set({ updatedAt: now })
    .where(eq(chatConversations.id, conversationId));

  return {
    outcome: 'reserved',
    conversationId,
    turn: insertedTurn,
  };
}

export async function markChatTurnStreaming(turnId: string): Promise<void> {
  const now = new Date();
  await db
    .update(chatTurns)
    .set({
      status: 'streaming',
      startedAt: now,
      updatedAt: now,
    })
    .where(eq(chatTurns.id, turnId));
}

/**
 * Persists the assistant's terminal message for a chat turn and finalizes
 * the turn's status. Idempotent at the turn level: if an assistant message
 * already exists for this turn, returns it without inserting another row.
 *
 * This is the JOV-2275 hardening. Production incident (conversation
 * `56dbacaa-e323-40ce-8bd2-cd96b05d5944`) persisted 51,948 duplicate
 * assistant rows for a single conversation because multiple terminal
 * paths can race on the same `turnId`: `streamText.onFinish`, the AI SDK
 * `onError` callback, the outer try/catch, the client-disconnect handler,
 * and the rate-limit/tool-unavailable preflights. Any two of those firing
 * for the same turn would each insert an assistant row.
 *
 * The fix: short-circuit when a terminal assistant message already exists
 * for the turn. This is fail-closed (returns the existing row) so the
 * caller never accidentally renders a fresh row over a previously
 * persisted one. The turn-status `UPDATE` is left in place so any later
 * status transition (e.g. completed-after-cancel) still lands, but it's
 * idempotent by construction.
 */
async function fetchTerminalAssistantMessage(
  turnId: string
): Promise<ChatMessage | null> {
  const [message] = await db
    .select()
    .from(chatMessages)
    .where(
      and(eq(chatMessages.turnId, turnId), eq(chatMessages.role, 'assistant'))
    )
    .orderBy(asc(chatMessages.createdAt))
    .limit(1);
  return message ?? null;
}

export async function persistTerminalAssistantMessage(input: {
  readonly conversationId: string;
  readonly turnId: string;
  readonly status: TerminalChatTurnStatus;
  readonly content: string;
  readonly toolCalls?: PersistedToolEvent[] | null;
  readonly errorCode?: string | null;
  readonly errorMessage?: string | null;
}): Promise<ChatMessage> {
  const now = new Date();

  const existing = await fetchTerminalAssistantMessage(input.turnId);
  if (existing) {
    // Another terminal path already persisted an assistant message for
    // this turn. Do not insert a second row. We still allow the turn
    // status to advance (e.g. a slower error handler arrives after a
    // successful onFinish) but never duplicate the message row.
    await db
      .update(chatTurns)
      .set({
        status: input.status,
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ?? null,
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(chatTurns.id, input.turnId));

    await db
      .update(chatConversations)
      .set({ updatedAt: now })
      .where(eq(chatConversations.id, input.conversationId));

    return existing;
  }

  const [message] = await db
    .insert(chatMessages)
    .values({
      conversationId: input.conversationId,
      turnId: input.turnId,
      role: 'assistant',
      content: input.content,
      toolCalls:
        input.toolCalls && input.toolCalls.length > 0 ? input.toolCalls : null,
      createdAt: now,
    })
    .returning();

  // Defensive: if the race fell through (parallel inserts between the
  // SELECT and INSERT — possible under serverless concurrency), re-fetch
  // and prefer the earliest assistant row so the rest of the system
  // keeps a single terminal message per turn.
  if (!message) {
    const racedExisting = await fetchTerminalAssistantMessage(input.turnId);
    if (racedExisting) {
      return racedExisting;
    }
    throw new Error('Failed to persist terminal assistant message');
  }

  await db
    .update(chatTurns)
    .set({
      status: input.status,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
      completedAt: now,
      updatedAt: now,
    })
    .where(eq(chatTurns.id, input.turnId));

  await db
    .update(chatConversations)
    .set({ updatedAt: now })
    .where(eq(chatConversations.id, input.conversationId));

  return message;
}

export function isInFlightChatTurn(turn: ChatTurn): boolean {
  return IN_FLIGHT_STATUSES.has(turn.status);
}
