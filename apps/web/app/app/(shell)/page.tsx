import type { Metadata } from 'next';
import { ChatPageClient } from './chat/ChatPageClient';

const DASHBOARD_DESCRIPTION = 'Start a new thread with Jovie AI';

export const metadata: Metadata = {
  title: 'Home | Jovie',
  description: DASHBOARD_DESCRIPTION,
};

// Chat-first experience: /app renders the new chat directly
export default function AppRootPage() {
  return <ChatPageClient />;
}
