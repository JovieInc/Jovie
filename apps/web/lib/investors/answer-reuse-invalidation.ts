import type {
  AnswerReusePack,
  AnswerSourceChange,
  AnswerSourceChangeResult,
  CanonicalAnswer,
  DistributionDecision,
} from './answer-reuse-types';

function isIsoDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value) &&
    !Number.isNaN(new Date(value).getTime())
  );
}

function revokeDecision(
  decision: DistributionDecision,
  change: AnswerSourceChange
): DistributionDecision {
  return decision.state === 'approved'
    ? {
        state: 'revoked',
        revokedBy: change.actor,
        decidedAt: change.at,
        reason: change.reason,
        previousApprovedBy: decision.approvedBy,
        previousDecidedAt: decision.decidedAt,
      }
    : decision;
}

/** Revoke stale receipts without performing an external publish or removal. */
export function applyAnswerSourceChange(
  pack: AnswerReusePack,
  nextSourceAnswer: CanonicalAnswer,
  change: AnswerSourceChange
): AnswerSourceChangeResult {
  if (nextSourceAnswer.answerId !== pack.sourceAnswer.answerId) {
    throw new Error('Source changes must preserve the canonical answer id.');
  }
  if (!isIsoDate(change.at)) {
    throw new Error('Source changes require a real ISO event date.');
  }

  const changedClaims = new Set(change.changedClaimIds ?? []);
  const affectsAll =
    change.type === 'answer-revision' || change.type === 'answer-withdrawal';
  const impactedDerivativeIds: string[] = [];
  const releaseActions: AnswerSourceChangeResult['releaseActions'][number][] =
    [];

  const derivatives = pack.derivatives.map(derivative => {
    const impacted =
      affectsAll ||
      derivative.claimUses.some(claimUse =>
        changedClaims.has(claimUse.claimId)
      );
    if (!impacted) return derivative;

    impactedDerivativeIds.push(derivative.derivativeId);
    if (derivative.releaseState === 'published') {
      releaseActions.push({
        derivativeId: derivative.derivativeId,
        action:
          change.privacySafeRemovalRequired ||
          change.type === 'answer-withdrawal' ||
          change.type === 'claim-withdrawal'
            ? 'privacy-safe-remove-through-existing-release'
            : 'correct-through-existing-release',
      });
    }

    return {
      ...derivative,
      review: {
        state:
          change.type === 'answer-withdrawal'
            ? ('withdrawn' as const)
            : ('needs-review' as const),
      },
      distribution: {
        publicPublishing: revokeDecision(
          derivative.distribution.publicPublishing,
          change
        ),
        emailSocialSending: revokeDecision(
          derivative.distribution.emailSocialSending,
          change
        ),
        paidPromotion: revokeDecision(
          derivative.distribution.paidPromotion,
          change
        ),
      },
      releaseState:
        derivative.releaseState === 'published'
          ? ('correction-required' as const)
          : derivative.releaseState,
      history: [
        ...derivative.history,
        {
          event: 'source-change' as const,
          at: change.at,
          actor: change.actor,
          reason: change.reason,
          fromSourceVersion: derivative.sourceAnswerVersion,
          toSourceVersion: nextSourceAnswer.version,
          previousReviewState: derivative.review.state,
          previousReviewedBy: derivative.review.reviewedBy,
          previousReviewedAt: derivative.review.reviewedAt,
        },
      ],
    };
  });

  return {
    pack: { sourceAnswer: nextSourceAnswer, derivatives },
    impactedDerivativeIds,
    releaseActions,
  };
}
