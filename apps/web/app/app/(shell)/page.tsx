import type { Metadata } from 'next';
// Must render the same chat UI as /app/chat — see AGENTS.md guardrail #16
import { HydrateClient } from '@/lib/queries/HydrateClient';
import { getDehydratedState } from '@/lib/queries/server';
import { DeferredChatPageClient } from './chat/DeferredChatPageClient';

const DASHBOARD_DESCRIPTION = 'Start a new thread with Jovie AI';
const DASHBOARD_TITLE = 'Home | Jovie';

export function generateMetadata(): Metadata {
  return {
    title: DASHBOARD_TITLE,
    description: DASHBOARD_DESCRIPTION,
  };
}

export default async function AppRootPage() {
  return (
    <HydrateClient state={getDehydratedState()}>
      <DeferredChatPageClient />
    </HydrateClient>
  );
}
