import { redirect } from 'next/navigation';
import { ChatPageClient } from './chat/ChatPageClient';
import { getDashboardData } from './dashboard/actions';

export const metadata = {
  title: 'New Thread',
  description: 'Start a new thread with Jovie AI',
};

// Chat-first experience: /app renders the new chat directly
export default async function AppRootPage() {
  const dashboardData = await getDashboardData();

  if (dashboardData.needsOnboarding) {
    redirect('/onboarding');
  }

  return <ChatPageClient />;
}
