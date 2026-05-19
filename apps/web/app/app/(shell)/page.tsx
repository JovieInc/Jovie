import type { Metadata } from 'next';
import { OnboardingInterviewModal } from '@/components/onboarding/OnboardingInterviewModal';
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

export default async function AppRootPage({ searchParams }: AppRootPageProps) {
  const params = (await searchParams) ?? {};
  const interviewRequested = readFirstParam(params.interview) === '1';

  return (
    <HydrateClient state={getDehydratedState()}>
      <DeferredChatPageClient />
      <OnboardingInterviewModal initialRequested={interviewRequested} />
    </HydrateClient>
  );
}
