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
 * Chat page — renders with zero server-side data dependencies.
 *
 * Apple Music connection status defaults to disconnected and hydrates
 * client-side via the dashboard context provider. The DeferredChatPageClient
 * wrapper code-splits the heavy chat bundle (~640 lines + AI SDK).
 *
 * Note: skeleton-to-content time (~800ms) is dominated by the shared shell
 * layout (DashboardShellContent) resolving dashboard data, not this page.
 */
export default function ChatPage() {
  return <DeferredChatPageClient />;
}
