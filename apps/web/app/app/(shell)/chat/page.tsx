import type { Metadata } from 'next';
import { DeferredChatPageClient } from './DeferredChatPageClient';
import { loadFeatureIntroCatalog } from './feature-intro-data';

const CHAT_DESCRIPTION = 'Start a new conversation with Jovie AI';
const CHAT_TITLE = 'New Chat';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: CHAT_TITLE,
    description: CHAT_DESCRIPTION,
  };
}

/**
 * Chat page — renders with only the source-bound feature-intro digest.
 *
 * Apple Music connection status defaults to disconnected and hydrates
 * client-side via the dashboard context provider. DeferredChatPageClient keeps
 * the shared /app and /app/chat render path identical. The feature-intro
 * digest is built from the same changelog source as the public page and feeds.
 *
 * Note: skeleton-to-content time (~800ms) is dominated by the shared shell
 * layout (DashboardShellContent) resolving dashboard data, not this page.
 */
export default async function ChatPage() {
  const featureIntroCatalog = await loadFeatureIntroCatalog();

  return <DeferredChatPageClient featureIntroCatalog={featureIntroCatalog} />;
}
