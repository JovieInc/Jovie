import 'server-only';

import { and, eq } from 'drizzle-orm';
import { getSessionContext } from '@/lib/auth/session';
import { sanitizeConversationTitle } from '@/lib/chat/title';
import { db } from '@/lib/db';
import { chatConversations } from '@/lib/db/schema/chat';

export const CHAT_THREAD_TITLE_FALLBACK = 'Thread | Jovie';

export async function loadChatThreadTitle(
  conversationId: string
): Promise<string | null> {
  try {
    const { user } = await getSessionContext({
      requireUser: false,
      requireProfile: false,
    });

    if (!user) return null;

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

    const conversationTitle = sanitizeConversationTitle(conversation?.title);

    return conversationTitle;
  } catch {
    return null;
  }
}

export async function loadChatThreadMetadataTitle(
  conversationId: string
): Promise<string> {
  const conversationTitle = await loadChatThreadTitle(conversationId);
  return conversationTitle
    ? `${conversationTitle} | Jovie`
    : CHAT_THREAD_TITLE_FALLBACK;
}
