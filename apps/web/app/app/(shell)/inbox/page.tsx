import type { Metadata } from 'next';
import { OnboardingInterviewModal } from '@/components/onboarding/OnboardingInterviewModal';
import { HydrateClient } from '@/lib/queries/HydrateClient';
import { getDehydratedState } from '@/lib/queries/server';
import { OpportunityInboxRoute } from '../OpportunityInboxRoute';

export function generateMetadata(): Metadata {
  return {
    title: 'Inbox',
    description:
      'Review Jovie suggestions, approve actions, and send feedback from your inbox.',
  };
}

type InboxPageProps = Readonly<{
  readonly searchParams?: Promise<
    Record<string, string | string[] | undefined>
  >;
}>;

function readFirstParam(
  value: string | string[] | undefined
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function InboxPage({ searchParams }: InboxPageProps = {}) {
  const params = (await searchParams) ?? {};
  return (
    <HydrateClient state={getDehydratedState()}>
      <OpportunityInboxRoute
        initialView={readFirstParam(params.view) === 'done' ? 'done' : 'needs'}
      />
      <OnboardingInterviewModal
        initialRequested={readFirstParam(params.interview) === '1'}
      />
    </HydrateClient>
  );
}
