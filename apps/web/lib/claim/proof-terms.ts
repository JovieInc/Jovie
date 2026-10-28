/**
 * Plain terms shown wherever a free-admission artist can pay while their page
 * is private. The review window is deliberately not stated: there is no
 * measured time-to-decision yet, and a number we cannot keep would be an
 * invented claim. Set `PROOF_REVIEW_WINDOW` from measured requestedAt to
 * decidedAt data (p50/p95) before stating one.
 */
export const PROOF_REVIEW_WINDOW: string | null = null;

export const PROOF_PENDING_TERMS = `Your page goes live once we confirm it's you${
  PROOF_REVIEW_WINDOW ? `, usually within ${PROOF_REVIEW_WINDOW}` : ''
}. Paying does not change that, and you can use everything privately in the meantime. If we can't confirm it's you, we cancel your subscription and refund your first month.`;
