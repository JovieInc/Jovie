import 'server-only';

import { triggerDesignLabDispatch } from './dispatch';
import { updateDesignLabLinearIssueStatus } from './linear';
import {
  deriveProposalStatus,
  getDesignProposal,
  saveDesignProposal,
} from './proposals';
import { appendDesignTasteMemoryEntry } from './taste-memory';
import type {
  DesignProposalReviewDecision,
  ReviewDesignProposalResult,
} from './types';

function mapDecisionToTaste(
  decision: DesignProposalReviewDecision
): 'accepted' | 'rejected' {
  return decision === 'no' ? 'rejected' : 'accepted';
}

function shouldTriggerDispatch(
  decision: DesignProposalReviewDecision
): boolean {
  return decision === 'yes' || decision === 'yes-with-notes';
}

export async function reviewDesignProposal(params: {
  readonly dayBucket: string;
  readonly proposalId: string;
  readonly decision: DesignProposalReviewDecision;
  readonly notes: string | null;
  readonly reviewer: string;
}): Promise<ReviewDesignProposalResult> {
  const existing = await getDesignProposal(params.dayBucket, params.proposalId);
  if (!existing) {
    throw new Error('Design proposal not found.');
  }

  // Persisted legacy records and test fixtures may still expose `pending`,
  // while the expanded schema normalizes that state to `proposed`.
  const existingStatus: string = existing.status;
  if (existingStatus !== 'pending' && existingStatus !== 'proposed') {
    throw new Error('Design proposal has already been reviewed.');
  }

  const reviewedAt = new Date().toISOString();
  const normalizedNotes = params.notes?.trim() ? params.notes.trim() : null;

  let dispatchId: string | null = null;
  let dispatchTriggered = false;

  if (shouldTriggerDispatch(params.decision)) {
    const dispatch = await triggerDesignLabDispatch({
      proposal: existing,
      amendmentNotes:
        params.decision === 'yes-with-notes' ? normalizedNotes : null,
      requestedBy: params.reviewer,
    });
    dispatchTriggered = dispatch.triggered;
    dispatchId = dispatch.dispatchId;
  }

  const updatedProposal = {
    ...existing,
    status: deriveProposalStatus(params.decision),
    reviewedAt,
    reviewer: params.reviewer,
    reviewNotes: normalizedNotes,
    reviewDecision: params.decision,
    dispatchId,
    dayBucket: params.dayBucket,
  };

  await saveDesignProposal(updatedProposal);

  await appendDesignTasteMemoryEntry({
    timestamp: reviewedAt,
    surfaceId: existing.surfaceId,
    surfaceName: existing.surfaceName,
    direction: existing.proposalText,
    decision: mapDecisionToTaste(params.decision),
    notes: normalizedNotes,
    reviewer: params.reviewer,
    linearIssueId: existing.linearIssueId,
  });

  const linearUpdated = await updateDesignLabLinearIssueStatus(
    existing.linearIssueId,
    params.decision === 'no' ? 'canceled' : 'completed'
  );

  return {
    proposal: updatedProposal,
    tasteMemoryWritten: true,
    linearUpdated,
    dispatchTriggered,
    dispatchId,
  };
}
