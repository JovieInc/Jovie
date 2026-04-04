import type { Metadata } from 'next';
// Must render the same chat UI as /app/chat — see AGENTS.md guardrail #16
import { DeferredChatPageClient } from './chat/DeferredChatPageClient';

const DASHBOARD_DESCRIPTION = 'Start a new thread with Jovie AI';
const DASHBOARD_TITLE = 'Home | Jovie';

export function generateMetadata(): Metadata {
  return {
    title: DASHBOARD_TITLE,
    description: DASHBOARD_DESCRIPTION,
  };
}

export default function AppRootPage() {
  return <DeferredChatPageClient />;
}
