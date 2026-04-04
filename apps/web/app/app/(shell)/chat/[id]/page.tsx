import { and, eq } from 'drizzle-orm';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { getSessionContext } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { chatConversations } from '@/lib/db/schema/chat';
import { getDashboardData } from '../../dashboard/actions';
import { checkAppleMusicConnection } from '../../dashboard/releases/actions';
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

export default async function ChatConversationPage({ params }: Props) {
  const dashboardData = await getDashboardData();

  if (dashboardData.needsOnboarding && !dashboardData.dashboardLoadError) {
    redirect(APP_ROUTES.ONBOARDING);
  }

  const appleMusicResult = await checkAppleMusicConnection().catch(() => ({
    connected: false,
    artistName: null,
    artistId: null,
  }));

  const { id } = await params;
  return (
    <DeferredChatPageClient
      conversationId={id}
      isFirstSession={dashboardData.isFirstSession}
      appleMusicConnected={appleMusicResult.connected}
      appleMusicArtistName={appleMusicResult.artistName}
    />
  );
}
