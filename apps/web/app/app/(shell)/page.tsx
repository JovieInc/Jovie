import { ChatPageClient } from './chat/ChatPageClient';

export const metadata = {
  title: 'New Thread',
  description: 'Start a new thread with Jovie AI',
};

// Chat-first experience: /app renders the new chat directly
export default function AppRootPage() {
  return <ChatPageClient />;
}
