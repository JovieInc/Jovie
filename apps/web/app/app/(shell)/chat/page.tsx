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
 * Note: essential-shell routes stream this page behind a placeholder while
 * DashboardShellContent reconciles workspace data (JOV-14776). Cold Electron
 * usable time is still dominated by hosted document + JS load, not this page.
 */
export default function ChatPage() {
  return <DeferredChatPageClient />;
}
