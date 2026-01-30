import { redirect } from 'next/navigation';
import { JovieChat } from '@/components/jovie/JovieChat';
import { getCachedAuth } from '@/lib/auth/cached';
import { getDashboardData } from '../actions';

export const metadata = {
  title: 'Chat with Jovie',
  description: 'Ask Jovie about your music career',
};

export const runtime = 'nodejs';

export default async function ChatPage() {
  const { userId } = await getCachedAuth();

  if (!userId) {
    redirect('/sign-in?redirect_url=/app/dashboard/chat');
  }

  const dashboardData = await getDashboardData();

  if (dashboardData.needsOnboarding) {
    redirect('/onboarding');
  }

  const profile = dashboardData.selectedProfile;

  if (!profile) {
    redirect('/onboarding');
  }

  // Prepare context for the chat
  const artistContext = {
    displayName: profile.displayName ?? profile.username,
    username: profile.username,
    bio: profile.bio,
    genres: profile.genres ?? [],
    spotifyFollowers: profile.spotifyFollowers,
    spotifyPopularity: profile.spotifyPopularity,
    profileViews: profile.profileViews ?? 0,
    hasSocialLinks: dashboardData.hasSocialLinks,
    hasMusicLinks: dashboardData.hasMusicLinks,
    tippingStats: dashboardData.tippingStats,
  };

  return <JovieChat artistContext={artistContext} />;
}
