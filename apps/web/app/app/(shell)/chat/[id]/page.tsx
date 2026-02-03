import { redirect } from 'next/navigation';
import { JovieChat } from '@/components/jovie/JovieChat';
import { getCachedAuth } from '@/lib/auth/cached';
import { getDashboardData } from '../../dashboard/actions';

export const metadata = {
  title: 'Chat with Jovie',
  description: 'Ask Jovie about your music career',
};

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface ChatConversationPageProps {
  params: Promise<{ id: string }>;
}

export default async function ChatConversationPage({
  params,
}: ChatConversationPageProps) {
  const { id } = await params;
  const { userId } = await getCachedAuth();

  if (!userId) {
    redirect(`/sign-in?redirect_url=/app/chat/${id}`);
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

  return <JovieChat artistContext={artistContext} conversationId={id} />;
}
