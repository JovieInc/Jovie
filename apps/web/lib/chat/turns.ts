import { and, asc, sql as drizzleSql, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  type ChatMessage,
  type ChatTurn,
  chatConversations,
  chatMessages,
  chatTurns,
} from '@/lib/db/schema/chat';
import { logger } from '@/lib/utils/logger';
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

/**
 * Stable chat_turns columns that predate optional attribution fields
 * (`model` from 0069). Explicit select/returning keeps turn reservation
 * working when prod Neon lags a migration (migration-drift class that
 * previously surfaced as CHAT_STREAM_FAILED on every web turn).
 */
const chatTurnCoreColumns = {
  id: chatTurns.id,
  userId: chatTurns.userId,
  creatorProfileId: chatTurns.creatorProfileId,
  conversationId: chatTurns.conversationId,
  clientTurnId: chatTurns.clientTurnId,
  status: chatTurns.status,
  source: chatTurns.source,
  toolIntent: chatTurns.toolIntent,
  errorCode: chatTurns.errorCode,
  errorMessage: chatTurns.errorMessage,
  createdAt: chatTurns.createdAt,
  updatedAt: chatTurns.updatedAt,
  startedAt: chatTurns.startedAt,
  completedAt: chatTurns.completedAt,
} as const;

/**
 * Stable chat_messages columns that predate script/source attribution
 * (`assistant_source` / `script_line_key` from 0067).
 */
const chatMessageCoreColumns = {
  id: chatMessages.id,
  conversationId: chatMessages.conversationId,
  turnId: chatMessages.turnId,
  clientMessageId: chatMessages.clientMessageId,
  role: chatMessages.role,
  content: chatMessages.content,
  toolCalls: chatMessages.toolCalls,
  createdAt: chatMessages.createdAt,
} as const;

type ChatTurnCoreRow = {
  readonly id: string;
  readonly userId: string;
  readonly creatorProfileId: string;
  readonly conversationId: string;
  readonly clientTurnId: string;
  readonly status: ChatTurn['status'];
  readonly source: string;
  readonly toolIntent: string | null;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
};

type ChatMessageCoreRow = {
  readonly id: string;
  readonly conversationId: string;
  readonly turnId: string | null;
  readonly clientMessageId: string | null;
  readonly role: ChatMessage['role'];
  readonly content: string;
  readonly toolCalls: ChatMessage['toolCalls'];
  readonly createdAt: Date;
};

function toChatTurn(row: ChatTurnCoreRow): ChatTurn {
  return {
    ...row,
    model: null,
  };
}

function toChatMessage(row: ChatMessageCoreRow): ChatMessage {
  return {
    ...row,
    assistantSource: null,
    scriptLineKey: null,
  };
}

function toConversationTitle(text: string): string | null {
  return sanitizeConversationTitle(text, 50);
}

function ephemeralAssistantMessage(input: {
  readonly conversationId: string;
  readonly turnId: string;
  readonly content: string;
  readonly toolCalls?: PersistedToolEvent[] | null;
}): ChatMessage {
  return {
    id: `ephemeral-${input.turnId}`,
    conversationId: input.conversationId,
    turnId: input.turnId,
    clientMessageId: null,
    role: 'assistant',
    content: input.content,
    toolCalls:
      input.toolCalls && input.toolCalls.length > 0 ? input.toolCalls : null,
    assistantSource: null,
    scriptLineKey: null,
    createdAt: new Date(),
  };
}

async function fetchTurnMessages(turnId: string): Promise<ChatMessage[]> {
  const rows = await db
    .select(chatMessageCoreColumns)
    .from(chatMessages)
    .where(eq(chatMessages.turnId, turnId))
    .orderBy(asc(chatMessages.createdAt));
  return rows.map(toChatMessage);
}

async function fetchExistingTurn(
  conversationId: string,
  clientTurnId: string
): Promise<ChatTurn | null> {
  const [turn] = await db
    .select(chatTurnCoreColumns)
    .from(chatTurns)
    .where(
      and(
        eq(chatTurns.conversationId, conversationId),
        eq(chatTurns.clientTurnId, clientTurnId)
      )
    )
    .limit(1);

  return turn ? toChatTurn(turn) : null;
}

async function fetchExistingClientTurn(input: {
  readonly userId: string;
  readonly creatorProfileId: string;
  readonly clientTurnId: string;
}): Promise<ChatTurn | null> {
  const [turn] = await db
    .select(chatTurnCoreColumns)
    .from(chatTurns)
    .where(
      and(
        eq(chatTurns.userId, input.userId),
        eq(chatTurns.creatorProfileId, input.creatorProfileId),
        eq(chatTurns.clientTurnId, input.clientTurnId)
      )
    )
    .limit(1);

  return turn ? toChatTurn(turn) : null;
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

  const [insertedTurnRow] = await db
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
    .returning(chatTurnCoreColumns);

  if (!insertedTurnRow) {
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

  const insertedTurn = toChatTurn(insertedTurnRow);

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

/**
 * Records the resolved model id (`anthropic/...`) that is producing this
 * turn's assistant output. Fire-and-forget from the chat route right after
 * model selection so 👍/👎 feedback rows can attribute votes to the
 * producing model even when the stream later fails (JOV #11460).
 *
 * Fail-soft: never throws. The `model` column may be missing when prod
 * migrations lag (0069). Attribution is best-effort.
 */
export async function recordChatTurnModel(
  turnId: string,
  model: string
): Promise<void> {
  try {
    await db
      .update(chatTurns)
      .set({ model, updatedAt: new Date() })
      .where(eq(chatTurns.id, turnId));
  } catch (error) {
    // Fail-soft: model attribution must never break the stream (JOV-3956).
    logger.warn(
      'Chat turn model record failed',
      {
        turnId,
        model,
        error: error instanceof Error ? error.message : String(error),
      },
      'chat/turns'
    );
  }
}

/**
 * Mark a reserved turn as streaming. Fail-soft: never throws so a status
 * write cannot abort the user-visible stream (JOV-3956).
 */
export async function markChatTurnStreaming(turnId: string): Promise<void> {
  const now = new Date();
  try {
    await db
      .update(chatTurns)
      .set({
        status: 'streaming',
        startedAt: now,
        updatedAt: now,
      })
      .where(eq(chatTurns.id, turnId));
  } catch (error) {
    // Fail-soft: status write must never abort the user-visible stream.
    logger.warn(
      'Chat turn streaming mark failed',
      {
        turnId,
        error: error instanceof Error ? error.message : String(error),
      },
      'chat/turns'
    );
  }
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
 *
 * Fail-soft (JOV-3956): persistence errors are logged and an ephemeral
 * in-memory assistant row is returned so the stream path never dies with
 * CHAT_STREAM_FAILED solely because a durable write failed.
 */
async function fetchTerminalAssistantMessage(
  turnId: string
): Promise<ChatMessage | null> {
  const [message] = await db
    .select(chatMessageCoreColumns)
    .from(chatMessages)
    .where(
      and(eq(chatMessages.turnId, turnId), eq(chatMessages.role, 'assistant'))
    )
    .orderBy(asc(chatMessages.createdAt))
    .limit(1);
  return message ? toChatMessage(message) : null;
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
  try {
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

    const [messageRow] = await db
      .insert(chatMessages)
      .values({
        conversationId: input.conversationId,
        turnId: input.turnId,
        role: 'assistant',
        content: input.content,
        toolCalls:
          input.toolCalls && input.toolCalls.length > 0
            ? input.toolCalls
            : null,
        createdAt: now,
      })
      .returning(chatMessageCoreColumns);

    // Defensive: if the race fell through (parallel inserts between the
    // SELECT and INSERT — possible under serverless concurrency), re-fetch
    // and prefer the earliest assistant row so the rest of the system
    // keeps a single terminal message per turn.
    if (!messageRow) {
      const racedExisting = await fetchTerminalAssistantMessage(input.turnId);
      if (racedExisting) {
        return racedExisting;
      }
      throw new Error('Failed to persist terminal assistant message');
    }

    const message = toChatMessage(messageRow);

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
  } catch (error) {
    // Fail-soft: durable write failures must not kill the stream with
    // CHAT_STREAM_FAILED (migration drift / transient DB — JOV-3956).
    logger.error(
      'Chat terminal assistant persist failed',
      {
        conversationId: input.conversationId,
        turnId: input.turnId,
        status: input.status,
        errorCode: input.errorCode ?? null,
        error: error instanceof Error ? error.message : String(error),
      },
      'chat/turns'
    );
    return ephemeralAssistantMessage(input);
  }
}

export function isInFlightChatTurn(turn: ChatTurn): boolean {
  return IN_FLIGHT_STATUSES.has(turn.status);
}
