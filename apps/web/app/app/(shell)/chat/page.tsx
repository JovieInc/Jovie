import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { getSessionContext } from '@/lib/auth/session';
import { getDashboardData } from '../dashboard/actions';
import { checkAppleMusicConnection } from '../dashboard/releases/actions';
import { ChatPageClient } from './ChatPageClient';

const CHAT_DESCRIPTION = 'Start a new thread with Jovie AI';

const getDashboardTitle = async () => {
  const { profile } = await getSessionContext({ requireProfile: false });
  const displayName = profile?.displayName?.trim();

  return displayName ? `${displayName} | Jovie` : 'Home | Jovie';
};

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: await getDashboardTitle(),
    description: CHAT_DESCRIPTION,
  };
}

export default async function ChatPage() {
  const dashboardData = await getDashboardData();

  if (dashboardData.needsOnboarding && !dashboardData.dashboardLoadError) {
    redirect(APP_ROUTES.ONBOARDING);
  }

  const appleMusicResult = await checkAppleMusicConnection().catch(() => ({
    connected: false,
    artistName: null,
    artistId: null,
  }));

  return (
    <ChatPageClient
      isFirstSession={dashboardData.isFirstSession}
      appleMusicConnected={appleMusicResult.connected}
      appleMusicArtistName={appleMusicResult.artistName}
    />
  );
}
