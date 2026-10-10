import 'server-only';

import { randomUUID } from 'node:crypto';
import type { UIMessage } from 'ai';
import { and, asc, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import {
  decodeToolEvents,
  toolEventToMessagePart,
} from '@/lib/chat/tool-events';
import { db } from '@/lib/db';
import { chatConversations, chatMessages } from '@/lib/db/schema/chat';

export interface OnboardingConversationPrincipal {
  readonly userId: string | null;
  readonly sessionId: string | null;
}

/** Account ownership wins over a leftover anonymous cookie after sign-in. */
export async function findOnboardingConversation({
  userId,
  sessionId,
}: OnboardingConversationPrincipal) {
  if (userId) {
    const [owned] = await db
      .select({
        id: chatConversations.id,
        sessionId: chatConversations.sessionId,
      })
      .from(chatConversations)
      .where(
        and(
          eq(chatConversations.userId, userId),
          isNotNull(chatConversations.sessionId)
        )
      )
      .orderBy(desc(chatConversations.createdAt), desc(chatConversations.id))
      .limit(1);
    if (owned) return { ...owned, owned: true };
  }
  if (!sessionId) return null;
  const [anonymous] = await db
    .select({
      id: chatConversations.id,
      sessionId: chatConversations.sessionId,
    })
    .from(chatConversations)
    .where(
      and(
        eq(chatConversations.sessionId, sessionId),
        isNull(chatConversations.userId),
        isNull(chatConversations.creatorProfileId)
      )
    )
    .orderBy(desc(chatConversations.createdAt), desc(chatConversations.id))
    .limit(1);
  return anonymous ? { ...anonymous, owned: false } : null;
}

/** Read-only restoration: persisted tool artifacts are rendered, never executed. */
export async function readOnboardingMessages(
  conversationId: string
): Promise<UIMessage[]> {
  const rows = await db
    .select({
      id: chatMessages.id,
      clientMessageId: chatMessages.clientMessageId,
      role: chatMessages.role,
      content: chatMessages.content,
      toolCalls: chatMessages.toolCalls,
    })
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversationId))
    .orderBy(asc(chatMessages.createdAt), asc(chatMessages.id))
    .limit(200);
  return rows.flatMap(row => {
    if (row.role !== 'user' && row.role !== 'assistant') return [];
    const parts: UIMessage['parts'] = row.content
      ? [{ type: 'text', text: row.content }]
      : [];
    if (row.role === 'assistant')
      parts.push(
        ...decodeToolEvents(row.toolCalls).events.map(toolEventToMessagePart)
      );
    return [{ id: row.clientMessageId ?? row.id, role: row.role, parts }];
  });
}

/** A new onboarding context preserves all account, profile and payment records. */
export async function restartOwnedOnboardingConversation(
  userId: string
): Promise<void> {
  const [created] = await db
    .insert(chatConversations)
    .values({
      userId,
      sessionId: randomUUID(),
      title: 'Getting started',
    })
    .returning({ id: chatConversations.id });
  if (!created) throw new Error('Onboarding restart was not saved');
}
