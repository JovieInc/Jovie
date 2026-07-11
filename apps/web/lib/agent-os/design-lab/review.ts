import 'server-only';

import { logger } from '@/lib/utils/logger';
import { triggerDesignLabDispatch } from './dispatch';
import {
  createDesignLabLinearIssue,
  updateDesignLabLinearIssueStatus,
} from './linear';
import {
  deriveProposalStatus,
  getDesignProposal,
  saveDesignProposal,
  withDesignProposalLock,
} from './proposals';
import { appendDesignTasteMemoryEntry } from './taste-memory';
import type {
  DesignProposal,
  DesignProposalReviewDecision,
  ReviewDesignProposalResult,
} from './types';

function isApproval(decision: DesignProposalReviewDecision): boolean {
  return decision === 'yes' || decision === 'yes-with-notes';
}

async function dispatchApprovedProposal(
  proposal: DesignProposal,
  decision: DesignProposalReviewDecision,
  notes: string | null,
  reviewer: string
): Promise<{ proposal: DesignProposal; triggered: boolean }> {
  if (!isApproval(decision) || proposal.dispatchId) {
    return { proposal, triggered: false };
  }
  const dispatch = await triggerDesignLabDispatch({
    proposal,
    amendmentNotes: decision === 'yes-with-notes' ? notes : null,
    requestedBy: reviewer,
  });
  if (!dispatch.triggered || !dispatch.dispatchId) {
    return { proposal, triggered: false };
  }
  const dispatched = { ...proposal, dispatchId: dispatch.dispatchId };
  await saveDesignProposal(dispatched);
  return { proposal: dispatched, triggered: true };
}

async function ensureImplementationIssue(
  proposal: DesignProposal,
  decision: DesignProposalReviewDecision
): Promise<DesignProposal> {
  if (!isApproval(decision) || proposal.linearIssueId !== 'UNASSIGNED') {
    return proposal;
  }
  const issue = await createDesignLabLinearIssue(proposal);
  const assigned = {
    ...proposal,
    linearIssueId: issue.identifier,
    linearIssueUrl: issue.url,
  };
  await saveDesignProposal(assigned);
  return assigned;
}

async function reviewDesignProposalLocked(params: {
  readonly dayBucket: string;
  readonly proposalId: string;
  readonly decision: DesignProposalReviewDecision;
  readonly notes: string | null;
  readonly reviewer: string;
}): Promise<ReviewDesignProposalResult> {
  const existing = await getDesignProposal(params.dayBucket, params.proposalId);
  if (!existing) throw new Error('Design proposal not found.');

  const normalizedNotes = params.notes?.trim() ? params.notes.trim() : null;
  const finalStatus = deriveProposalStatus(params.decision);

  if (existing.status === 'implemented' || existing.status === 'rejected') {
    if (existing.reviewDecision !== params.decision) {
      throw new Error('Design proposal has already been reviewed.');
    }
    return {
      proposal: existing,
      tasteMemoryWritten: false,
      linearUpdated: false,
      dispatchTriggered: false,
      dispatchId: existing.dispatchId,
    };
  }

  if (existing.status === 'approved') {
    if (existing.reviewDecision !== params.decision) {
      throw new Error('Design proposal has already been reviewed.');
    }
    const retry = await dispatchApprovedProposal(
      existing,
      params.decision,
      normalizedNotes,
      params.reviewer
    );
    return {
      proposal: retry.proposal,
      tasteMemoryWritten: false,
      linearUpdated: false,
      dispatchTriggered: retry.triggered,
      dispatchId: retry.proposal.dispatchId,
    };
  }

  if (
    existing.status === 'reviewing' &&
    existing.reviewDecision &&
    existing.reviewDecision !== params.decision
  ) {
    throw new Error('Design proposal review is already in progress.');
  }

  const reviewedAt = existing.reviewedAt ?? new Date().toISOString();
  const reviewing: DesignProposal = {
    ...existing,
    status: 'reviewing',
    reviewedAt,
    reviewer: params.reviewer,
    reviewNotes: normalizedNotes,
    reviewDecision: params.decision,
    dayBucket: params.dayBucket,
  };
  await saveDesignProposal(reviewing);

  // Approval is durable before any external dispatch. A retry can safely resume it.
  const assigned = await ensureImplementationIssue(reviewing, params.decision);
  const decided: DesignProposal = { ...assigned, status: finalStatus };
  await saveDesignProposal(decided);

  const dispatch = await dispatchApprovedProposal(
    decided,
    params.decision,
    normalizedNotes,
    params.reviewer
  );

  let tasteMemoryWritten = false;
  try {
    await appendDesignTasteMemoryEntry({
      timestamp: reviewedAt,
      surfaceId: existing.surfaceId,
      surfaceName: existing.surfaceName,
      direction: existing.proposalText,
      decision: params.decision === 'no' ? 'rejected' : 'accepted',
      notes: normalizedNotes,
      reviewer: params.reviewer,
      linearIssueId: existing.linearIssueId,
    });
    tasteMemoryWritten = true;
  } catch (error) {
    logger.error('[design-lab/review] Taste memory append failed', { error });
  }

  const linearUpdated =
    params.decision === 'no' && decided.linearIssueId !== 'UNASSIGNED'
      ? await updateDesignLabLinearIssueStatus(
          decided.linearIssueId,
          'canceled'
        )
      : false;

  return {
    proposal: dispatch.proposal,
    tasteMemoryWritten,
    linearUpdated,
    dispatchTriggered: dispatch.triggered,
    dispatchId: dispatch.proposal.dispatchId,
  };
}

export async function reviewDesignProposal(params: {
  readonly dayBucket: string;
  readonly proposalId: string;
  readonly decision: DesignProposalReviewDecision;
  readonly notes: string | null;
  readonly reviewer: string;
}): Promise<ReviewDesignProposalResult> {
  return withDesignProposalLock(params.dayBucket, params.proposalId, () =>
    reviewDesignProposalLocked(params)
  );
}
