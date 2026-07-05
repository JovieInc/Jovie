import { handleDistributionDraftDecision } from '@/lib/release-to-revenue/distribution-draft-decision-route';
import { rejectDistributionDraft } from '@/lib/release-to-revenue/distribution-drafts';

interface RouteParams {
  params: Promise<{ runId: string; draftId: string }>;
}

export async function POST(_request: Request, { params }: RouteParams) {
  const { runId, draftId } = await params;

  return handleDistributionDraftDecision({
    runId,
    draftId,
    decide: rejectDistributionDraft,
    route: '/api/release-to-revenue/runs/[runId]/drafts/[draftId]/reject',
    actionLabel: 'reject',
  });
}
