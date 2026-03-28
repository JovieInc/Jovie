import type { Metadata } from 'next';
import { getSessionContext } from '@/lib/auth/session';
import { checkAppleMusicConnection } from '../dashboard/releases/actions';
import { DeferredChatPageClient } from './DeferredChatPageClient';

const CHAT_DESCRIPTION = 'Start a new thread with Jovie AI';

const getDashboardTitle = async () => {
  try {
    const { profile } = await getSessionContext({
      requireUser: false,
      requireProfile: false,
    });
    const displayName = profile?.displayName?.trim();
    return displayName ? `${displayName} | Jovie` : 'Home | Jovie';
  } catch {
    return 'Home | Jovie';
  }
};

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: await getDashboardTitle(),
    description: CHAT_DESCRIPTION,
  };
}

export default async function ChatPage() {
  const isE2EClientRuntime = process.env.NEXT_PUBLIC_E2E_MODE === '1';

  const appleMusicResult = isE2EClientRuntime
    ? {
        connected: false,
        artistName: null,
        artistId: null,
      }
    : await checkAppleMusicConnection().catch(() => ({
        connected: false,
        artistName: null,
        artistId: null,
      }));

  return (
    <DeferredChatPageClient
      appleMusicConnected={appleMusicResult.connected}
      appleMusicArtistName={appleMusicResult.artistName}
    />
  );
}
