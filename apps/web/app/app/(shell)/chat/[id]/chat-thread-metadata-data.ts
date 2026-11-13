import 'server-only';

import { and, eq } from 'drizzle-orm';
import { cache } from 'react';
import { getSessionContext } from '@/lib/auth/session';
import { sanitizeConversationTitle } from '@/lib/chat/title';
import { db } from '@/lib/db';
import { chatConversations } from '@/lib/db/schema/chat';

export const CHAT_THREAD_TITLE_FALLBACK = 'Chat';

async function readChatThreadTitle(
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

/**
 * `generateMetadata` and the page both need the thread title. React `cache()`
 * dedupes them per request, so one navigation costs one session-context read
 * and one query instead of two of each.
 */
export const loadChatThreadTitle = cache(readChatThreadTitle);

export async function loadChatThreadMetadataTitle(
  conversationId: string
): Promise<string> {
  const conversationTitle = await loadChatThreadTitle(conversationId);
  return conversationTitle ?? CHAT_THREAD_TITLE_FALLBACK;
}
