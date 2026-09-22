/**
 * Durable chat work record (JOV-4514, slice 1).
 *
 * Every chat conversation owned by a creator profile gets exactly one Task
 * row linked via tasks.conversation_id. Creation is idempotent: a partial
 * unique index on conversation_id plus ON CONFLICT DO NOTHING makes retries
 * and re-entry from every conversation path attach to the existing record
 * instead of duplicating it.
 */

import { and, sql as drizzleSql, eq, isNull } from 'drizzle-orm';
import { sanitizeConversationTitle } from '@/lib/chat/title';
import { db } from '@/lib/db';
import { chatConversations } from '@/lib/db/schema/chat';
import { tasks } from '@/lib/db/schema/tasks';
import {
  getNextTaskPosition,
  reserveTaskNumber,
} from '@/lib/tasks/task-reservation';

export interface ChatWorkRecord {
  readonly taskId: string;
  readonly created: boolean;
}

async function findWorkRecordByConversationId(
  conversationId: string
): Promise<{ id: string } | null> {
  const [row] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(eq(tasks.conversationId, conversationId), isNull(tasks.deletedAt))
    )
    .limit(1);

  return row ?? null;
}

/**
 * Create (or attach to) the durable Task for a conversation. Returns null when
 * the conversation does not exist or is not owned by `creatorProfileId`, so
 * anonymous (sessionId-only) conversations simply have no work record until
 * they are claimed. Callers should treat failures as non-fatal.
 */
export async function ensureChatWorkRecord(options: {
  readonly conversationId: string;
  readonly creatorProfileId: string;
}): Promise<ChatWorkRecord | null> {
  const { conversationId, creatorProfileId } = options;

  const [conversation] = await db
    .select({
      id: chatConversations.id,
      title: chatConversations.title,
    })
    .from(chatConversations)
    .where(
      and(
        eq(chatConversations.id, conversationId),
        eq(chatConversations.creatorProfileId, creatorProfileId)
      )
    )
    .limit(1);

  if (!conversation) {
    return null;
  }

  const existing = await findWorkRecordByConversationId(conversationId);
  if (existing) {
    return { taskId: existing.id, created: false };
  }

  const [taskNumber, position] = await Promise.all([
    reserveTaskNumber(creatorProfileId),
    getNextTaskPosition(creatorProfileId),
  ]);

  const [inserted] = await db
    .insert(tasks)
    .values({
      taskNumber,
      creatorProfileId,
      conversationId,
      title: sanitizeConversationTitle(conversation.title) ?? 'Untitled chat',
      status: 'todo',
      priority: 'medium',
      assigneeKind: 'jovie',
      agentStatus: 'idle',
      category: 'chat',
      position,
      metadata: { source: 'chat_conversation' },
    })
    .onConflictDoNothing({
      target: tasks.conversationId,
      where: drizzleSql`${tasks.conversationId} IS NOT NULL`,
    })
    .returning({ id: tasks.id });

  if (inserted) {
    return { taskId: inserted.id, created: true };
  }

  // Lost the insert race: another concurrent call created the record first.
  const raced = await findWorkRecordByConversationId(conversationId);
  return raced ? { taskId: raced.id, created: false } : null;
}
