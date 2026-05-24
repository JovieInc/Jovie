import type { Metadata } from 'next';
import { DeferredChatPageClient } from '../DeferredChatPageClient';
import {
  loadChatThreadMetadataTitle,
  loadChatThreadTitle,
} from './chat-thread-metadata-data';

interface Props {
  readonly params: Promise<{
    readonly id: string;
  }>;
}

const CONVERSATION_DESCRIPTION = 'Thread with Jovie AI';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;

  return {
    title: await loadChatThreadMetadataTitle(id),
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
 * client-side). The generateMetadata above delegates the title lookup to a
 * server-only route-data helper so it does not pollute the render path.
 */
export default async function ChatConversationPage({ params }: Props) {
  const { id } = await params;
  const initialConversationTitle = await loadChatThreadTitle(id);

  return (
    <DeferredChatPageClient
      conversationId={id}
      initialConversationTitle={initialConversationTitle}
    />
  );
}
