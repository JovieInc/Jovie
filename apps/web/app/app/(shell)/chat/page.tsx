import type { Metadata } from 'next';
import { DeferredChatPageClient } from './DeferredChatPageClient';

const CHAT_DESCRIPTION = 'Start a new thread with Jovie AI';
const CHAT_TITLE = 'Home | Jovie';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: CHAT_TITLE,
    description: CHAT_DESCRIPTION,
  };
}

/**
 * Chat page — renders instantly with no server-side data dependencies.
 *
 * Apple Music connection status defaults to disconnected and hydrates
 * client-side via the dashboard context provider. This eliminates the
 * ~600ms getDashboardData() call that was blocking first paint.
 */
export default function ChatPage() {
  return <DeferredChatPageClient />;
}
