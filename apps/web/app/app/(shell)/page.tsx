import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ChatPageClient } from './chat/ChatPageClient';
import { getDashboardDataEssential } from './dashboard/actions';

const DASHBOARD_DESCRIPTION = 'Start a new thread with Jovie AI';

export async function generateMetadata(): Promise<Metadata> {
  // Use essential fetch (deduplicated via React.cache()) — only needs
  // profile data for the title, not tipping stats or social links.
  const data = await getDashboardDataEssential();
  const displayName = data.selectedProfile?.displayName?.trim();

  return {
    title: displayName ? `${displayName} | Jovie` : 'Home | Jovie',
    description: DASHBOARD_DESCRIPTION,
  };
}

// Chat-first experience: /app renders the new chat directly
export default async function AppRootPage() {
  const dashboardData = await getDashboardDataEssential();

  // Only redirect to onboarding for genuine missing profiles, not DB errors.
  // When getDashboardData() catches a DB error it sets needsOnboarding: true
  // as a fallback, but the proxy doesn't agree — causing a redirect loop:
  // /app → /onboarding → proxy redirects back → /app → repeat.
  if (dashboardData.needsOnboarding && !dashboardData.dashboardLoadError) {
    redirect('/onboarding');
  }

  return <ChatPageClient isFirstSession={dashboardData.isFirstSession} />;
}
