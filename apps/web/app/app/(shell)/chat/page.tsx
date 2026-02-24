import { redirect } from 'next/navigation';
import { getDashboardData } from '../dashboard/actions';
import { ChatPageClient } from './ChatPageClient';

export const metadata = {
  title: 'New Thread',
  description: 'Start a new thread with Jovie AI',
};

export default async function ChatPage() {
  const dashboardData = await getDashboardData();

  if (dashboardData.needsOnboarding) {
    redirect('/onboarding');
  }

  return <ChatPageClient isFirstSession={dashboardData.isFirstSession} />;
}
