import type { Metadata } from 'next';
import { inboxNavItem } from '@/components/features/dashboard/dashboard-nav/config';
import { OnboardingInterviewModal } from '@/components/onboarding/OnboardingInterviewModal';
import { HydrateClient } from '@/lib/queries/HydrateClient';
import { getDehydratedState } from '@/lib/queries/server';
import { OpportunityInboxRoute } from '../OpportunityInboxRoute';

const DASHBOARD_DESCRIPTION =
  'Review Jovie suggestions, approve actions, and send feedback from your inbox.';
const DASHBOARD_TITLE = inboxNavItem.name;

export function generateMetadata(): Metadata {
  return {
    title: DASHBOARD_TITLE,
    description: DASHBOARD_DESCRIPTION,
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
  const interviewRequested = readFirstParam(params.interview) === '1';

  return (
    <HydrateClient state={getDehydratedState()}>
      <OpportunityInboxRoute
        initialView={readFirstParam(params.view) === 'done' ? 'done' : 'needs'}
      />
      <OnboardingInterviewModal initialRequested={interviewRequested} />
    </HydrateClient>
  );
}
