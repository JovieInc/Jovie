import 'server-only';

import { and, desc, sql as drizzleSql, eq, lt } from 'drizzle-orm';
import { withSanitizedConversationTitles } from '@/lib/chat/title';
import {
  decodeToolEvents,
  resolvePersistedToolEventsForDisplay,
} from '@/lib/chat/tool-events';
import { db } from '@/lib/db';
import {
  chatConversations,
  chatMessages,
  chatTurns,
} from '@/lib/db/schema/chat';
import { logger } from '@/lib/utils/logger';

export interface CreatorConversationSummary {
  readonly id: string;
  readonly title: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly latestMessageRole: string | null;
  readonly latestTurnStatus: string | null;
}

export interface CreatorConversationMessageRow {
  readonly id: string;
  readonly role: 'user' | 'assistant' | 'system';
  readonly content: string;
  readonly clientMessageId: string | null;
  readonly turnId: string | null;
  readonly turnStatus: string | null;
  readonly createdAt: Date;
  readonly toolCalls: ReturnType<typeof resolvePersistedToolEventsForDisplay>;
}

export async function listCreatorConversations(input: {
  readonly creatorProfileId: string;
  readonly limit?: number;
}): Promise<readonly CreatorConversationSummary[]> {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);

  const conversations = await db
    .select({
      id: chatConversations.id,
      title: chatConversations.title,
      createdAt: chatConversations.createdAt,
      updatedAt: chatConversations.updatedAt,
      latestMessageRole:
        drizzleSql<string>`(SELECT ${chatMessages.role} FROM ${chatMessages} WHERE ${chatMessages.conversationId} = ${chatConversations.id} ORDER BY ${chatMessages.createdAt} DESC LIMIT 1)`.as(
          'latest_message_role'
        ),
      latestTurnStatus:
        drizzleSql<string>`(SELECT ${chatTurns.status} FROM ${chatTurns} WHERE ${chatTurns.conversationId} = ${chatConversations.id} ORDER BY ${chatTurns.updatedAt} DESC LIMIT 1)`.as(
          'latest_turn_status'
        ),
    })
    .from(chatConversations)
    .where(eq(chatConversations.creatorProfileId, input.creatorProfileId))
    .orderBy(desc(chatConversations.updatedAt))
    .limit(limit);

  return withSanitizedConversationTitles(conversations);
}

export async function getCreatorConversationDetail(input: {
  readonly conversationId: string;
  readonly creatorProfileId: string;
  readonly limit?: number;
  readonly before?: string | null;
}): Promise<{
  readonly conversation: {
    readonly id: string;
    readonly title: string | null;
    readonly createdAt: Date;
    readonly updatedAt: Date;
  };
  readonly messages: readonly CreatorConversationMessageRow[];
  readonly hasMore: boolean;
} | null> {
  const [conversation] = await db
    .select({
      id: chatConversations.id,
      title: chatConversations.title,
      createdAt: chatConversations.createdAt,
      updatedAt: chatConversations.updatedAt,
    })
    .from(chatConversations)
    .where(
      and(
        eq(chatConversations.id, input.conversationId),
        eq(chatConversations.creatorProfileId, input.creatorProfileId)
      )
    )
    .limit(1);

  if (!conversation) {
    return null;
  }

  const limit = Math.min(Math.max(input.limit ?? 100, 1), 200);
  const conditions = [eq(chatMessages.conversationId, input.conversationId)];

  if (input.before) {
    const beforeDate = new Date(input.before);
    if (Number.isNaN(beforeDate.getTime())) {
      throw new TypeError('INVALID_BEFORE_CURSOR');
    }
    conditions.push(lt(chatMessages.createdAt, beforeDate));
  }

  const rows = await db
    .select({
      id: chatMessages.id,
      role: chatMessages.role,
      content: chatMessages.content,
      toolCalls: chatMessages.toolCalls,
      clientMessageId: chatMessages.clientMessageId,
      turnId: chatMessages.turnId,
      turnStatus: chatTurns.status,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .leftJoin(chatTurns, eq(chatMessages.turnId, chatTurns.id))
    .where(and(...conditions))
    .orderBy(desc(chatMessages.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  if (hasMore) {
    rows.pop();
  }
  rows.reverse();

  const messages = rows.map(row => {
    const decodedToolCalls = decodeToolEvents(row.toolCalls);
    if (decodedToolCalls.source === 'legacy') {
      logger.warn(
        'Decoded legacy tool calls while loading conversation',
        {
          conversationId: input.conversationId,
          messageId: row.id,
        },
        'chat-conversation'
      );
    }
    const resolvedToolCalls = resolvePersistedToolEventsForDisplay(
      decodedToolCalls.events,
      {
        messageCreatedAt: row.createdAt,
        turnStatus: row.turnStatus,
      }
    );

    return {
      id: row.id,
      role: row.role,
      content: row.content,
      clientMessageId: row.clientMessageId,
      turnId: row.turnId,
      turnStatus: row.turnStatus,
      createdAt: row.createdAt,
      toolCalls: resolvedToolCalls,
    };
  });

  return {
    conversation,
    messages,
    hasMore,
  };
}
