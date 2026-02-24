import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { getDashboardData } from '../../dashboard/actions';
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
  const dashboardData = await getDashboardData();

  if (dashboardData.needsOnboarding) {
    redirect(APP_ROUTES.ONBOARDING);
  }

  const { id } = await params;
  return (
    <ChatPageClient
      conversationId={id}
      isFirstSession={dashboardData.isFirstSession}
    />
  );
}
