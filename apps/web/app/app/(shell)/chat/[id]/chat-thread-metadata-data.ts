import 'server-only';

import { and, eq } from 'drizzle-orm';
import { getSessionContext } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { chatConversations } from '@/lib/db/schema/chat';

export const CHAT_THREAD_TITLE_FALLBACK = 'Thread | Jovie';

export async function loadChatThreadMetadataTitle(
  conversationId: string
): Promise<string> {
  try {
    const { user } = await getSessionContext({
      requireUser: false,
      requireProfile: false,
    });

    if (!user) return CHAT_THREAD_TITLE_FALLBACK;

    const [conversation] = await db
      .select({ title: chatConversations.title })
      .from(chatConversations)
      .where(
        and(
          eq(chatConversations.id, conversationId),
          eq(chatConversations.userId, user.id)
        )
      )
      .limit(1);

    const conversationTitle = conversation?.title?.trim();

    return conversationTitle
      ? `${conversationTitle} | Jovie`
      : CHAT_THREAD_TITLE_FALLBACK;
  } catch {
    return CHAT_THREAD_TITLE_FALLBACK;
  }
}
