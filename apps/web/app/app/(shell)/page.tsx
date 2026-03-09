import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/auth/session';
import { ChatPageClient } from './chat/ChatPageClient';
import { getDashboardData } from './dashboard/actions';

const DASHBOARD_DESCRIPTION = 'Start a new thread with Jovie AI';

const getDashboardTitle = async () => {
  const { profile } = await getSessionContext({ requireProfile: false });
  const displayName = profile?.displayName?.trim();

  return displayName ? `${displayName} | Jovie` : 'Home | Jovie';
};

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: await getDashboardTitle(),
    description: DASHBOARD_DESCRIPTION,
  };
}

// Chat-first experience: /app renders the new chat directly
export default async function AppRootPage() {
  const dashboardData = await getDashboardData();

  // Only redirect to onboarding for genuine missing profiles, not DB errors.
  // When getDashboardData() catches a DB error it sets needsOnboarding: true
  // as a fallback, but the proxy doesn't agree — causing a redirect loop:
  // /app → /onboarding → proxy redirects back → /app → repeat.
  if (dashboardData.needsOnboarding && !dashboardData.dashboardLoadError) {
    redirect('/onboarding');
  }

  return <ChatPageClient isFirstSession={dashboardData.isFirstSession} />;
}
