import { ChatPageClient } from '../ChatPageClient';

interface Props {
  readonly params: Promise<{
    readonly id: string;
  }>;
}

export const metadata = {
  title: 'Chat',
  description: 'Chat with Jovie AI',
};

export default async function ChatConversationPage({ params }: Props) {
  const { id } = await params;
  return <ChatPageClient conversationId={id} />;
}
