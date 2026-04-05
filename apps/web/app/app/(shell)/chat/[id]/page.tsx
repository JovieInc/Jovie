import { and, eq } from 'drizzle-orm';
import type { Metadata } from 'next';
import { getSessionContext } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { chatConversations } from '@/lib/db/schema/chat';
import { DeferredChatPageClient } from '../DeferredChatPageClient';

interface Props {
  readonly params: Promise<{
    readonly id: string;
  }>;
}

const CONVERSATION_DESCRIPTION = 'Thread with Jovie AI';

const getConversationTitle = async (conversationId: string) => {
  try {
    const { user } = await getSessionContext({
      requireUser: false,
      requireProfile: false,
    });

    if (!user) return 'Thread | Jovie';

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
      : 'Thread | Jovie';
  } catch {
    return 'Thread | Jovie';
  }
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;

  return {
    title: await getConversationTitle(id),
    description: CONVERSATION_DESCRIPTION,
  };
}

/**
 * Chat conversation page — zero server-side data dependencies.
 *
 * Previously called getDashboardData() + checkAppleMusicConnection() on every
 * conversation switch, causing unnecessary server work. Now matches the base
 * chat/page.tsx pattern: ChatPageClient reads isFirstSession from
 * DashboardDataContext and defaults appleMusicConnected to false (hydrates
 * client-side). The generateMetadata above handles the title DB query
 * independently (doesn't block rendering).
 */
export default async function ChatConversationPage({ params }: Props) {
  const { id } = await params;
  return <DeferredChatPageClient conversationId={id} />;
}
