import type { Metadata } from 'next';
import { DeferredChatPageClient } from './DeferredChatPageClient';

const CHAT_DESCRIPTION = 'Start a new conversation with Jovie AI';
const CHAT_TITLE = 'New Chat';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: CHAT_TITLE,
    description: CHAT_DESCRIPTION,
  };
}

/**
 * Chat page. DeferredChatPageClient keeps the shared /app and /app/chat
 * render path identical.
 *
 * Note: skeleton-to-content time (~800ms) is dominated by the shared shell
 * layout (DashboardShellContent) resolving dashboard data, not this page.
 */
export default function ChatPage() {
  return <DeferredChatPageClient />;
}
