import type { Metadata } from 'next';
import { OnboardingInterviewModal } from '@/components/onboarding/OnboardingInterviewModal';
import { HydrateClient } from '@/lib/queries/HydrateClient';
import { getDehydratedState } from '@/lib/queries/server';
import { DeferredChatPageClient } from './chat/DeferredChatPageClient';

const HOME_DESCRIPTION =
  'Ask Jovie anything. Your composer and live canvas are one tap away.';
const HOME_TITLE = 'Home';

export function generateMetadata(): Metadata {
  return {
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
  };
}

type AppRootPageProps = Readonly<{
  readonly searchParams?: Promise<
    Record<string, string | string[] | undefined>
  >;
}>;

function readFirstParam(
  value: string | string[] | undefined
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Home is agent-first: the chat composer with the live canvas above it, the
 * same primitive as /app/chat. The opportunity inbox lives at /app/inbox;
 * legacy /app?view=… links are redirected there in next.config.js.
 */
export default async function AppRootPage({
  searchParams,
}: AppRootPageProps = {}) {
  const params = (await searchParams) ?? {};
  return (
    <HydrateClient state={getDehydratedState()}>
      <DeferredChatPageClient />
      <OnboardingInterviewModal
        initialRequested={readFirstParam(params.interview) === '1'}
      />
    </HydrateClient>
  );
}
