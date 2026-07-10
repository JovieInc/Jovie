import type { Metadata } from 'next';
import { OnboardingInterviewModal } from '@/components/onboarding/OnboardingInterviewModal';
import { HydrateClient } from '@/lib/queries/HydrateClient';
import { getDehydratedState } from '@/lib/queries/server';
import { OpportunityInboxRoute } from './OpportunityInboxRoute';

const DASHBOARD_DESCRIPTION =
  'Review Jovie suggestions, approve actions, and send feedback from your inbox.';
const DASHBOARD_TITLE = 'Home';
const INBOX_TITLE = 'Inbox';

export function generateMetadata(): Metadata {
  // Title agreement with the sidebar nav label when inbox_home is on
  // (client copy also gates on the flag; metadata stays Inbox-forward so the
  // flag-on surface is discoverable without a request-time flag read here).
  return {
    title: INBOX_TITLE,
    description: DASHBOARD_DESCRIPTION,
    // Keep Home as alternate for flag-off SEO continuity.
    other: { 'x-jovie-home-title': DASHBOARD_TITLE },
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

export default async function AppRootPage({
  searchParams,
}: AppRootPageProps = {}) {
  const params = (await searchParams) ?? {};
  const interviewRequested = readFirstParam(params.interview) === '1';

  return (
    <HydrateClient state={getDehydratedState()}>
      <OpportunityInboxRoute />
      <OnboardingInterviewModal initialRequested={interviewRequested} />
    </HydrateClient>
  );
}
