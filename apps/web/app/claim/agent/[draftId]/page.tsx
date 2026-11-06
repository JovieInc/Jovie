import type { Metadata } from 'next';
import { APP_NAME } from '@/constants/app';
import { loadAgentClaimView } from '@/lib/agent-acquisition/draft-claim.server';
import { getOptionalAuth } from '@/lib/auth/cached';
import { AgentClaimScreen } from './AgentClaimScreen';
import { claimAgentDraftAction } from './actions';
import { parseAgentClaimErrorCode } from './claim-states';

export const metadata: Metadata = {
  title: `Claim your draft | ${APP_NAME}`,
  description: 'Claim the artist draft your assistant prepared on Jovie.',
  robots: { index: false, follow: false },
};

interface PageProps {
  readonly params: Promise<{ readonly draftId: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AgentDraftClaimPage({
  params,
  searchParams,
}: PageProps) {
  const { draftId } = await params;
  const query = await searchParams;
  const handoff = typeof query.h === 'string' ? query.h : null;
  const { userId } = await getOptionalAuth();
  const view = await loadAgentClaimView(draftId, handoff, userId);
  return (
    <AgentClaimScreen
      draftId={draftId}
      handoff={handoff}
      view={view}
      signedIn={Boolean(userId)}
      error={parseAgentClaimErrorCode(query.e)}
      claimAction={claimAgentDraftAction}
    />
  );
}
