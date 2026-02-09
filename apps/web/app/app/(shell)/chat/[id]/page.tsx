import { ChatPageClient } from '../ChatPageClient';

interface Props {
  readonly params: Promise<{
    readonly id: string;
  }>;
}

export const metadata = {
  title: 'Thread',
  description: 'Thread with Jovie AI',
};

export default async function ChatConversationPage({ params }: Props) {
  const { id } = await params;
  return <ChatPageClient conversationId={id} />;
}
