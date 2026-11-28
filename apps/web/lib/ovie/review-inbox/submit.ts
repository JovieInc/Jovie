/**
 * Admission surface for Push / Content Engine: submit editorial review items
 * into the single Ovie review inbox contract (pilot delegates here).
 */

import {
  REVIEW_INBOX_DECISION_CONTRACT,
  REVIEW_INBOX_PILOT_TENANT,
  type ReviewInboxDecisionBody,
} from './contract';

export const REVIEW_INBOX_SUBMIT_CONTRACT =
  'jovie.review-inbox-submit/v1' as const;

export interface ReviewInboxSubmitRequest {
  readonly contract: typeof REVIEW_INBOX_SUBMIT_CONTRACT;
  readonly tenant: string;
  readonly source: { readonly system: string; readonly id: string };
  readonly title: string;
  readonly revision: string;
}

/** Pilot: only validates shape; production routes to domain stores. */
export function parseReviewInboxSubmit(
  body: unknown
): ReviewInboxSubmitRequest | null {
  if (!body || typeof body !== 'object') return null;
  const value = body as Partial<ReviewInboxSubmitRequest>;
  if (value.contract !== REVIEW_INBOX_SUBMIT_CONTRACT) return null;
  if (typeof value.tenant !== 'string') return null;
  if (!value.source || typeof value.source.system !== 'string') return null;
  if (typeof value.source.id !== 'string') return null;
  if (typeof value.title !== 'string') return null;
  if (typeof value.revision !== 'string') return null;
  return value as ReviewInboxSubmitRequest;
}

/** Map a submit request to a decision-shaped envelope for the pilot API tests. */
export function submitToReviewInboxDecisionStub(
  submit: ReviewInboxSubmitRequest,
  actionId: string
): ReviewInboxDecisionBody | null {
  if (submit.tenant !== REVIEW_INBOX_PILOT_TENANT) return null;
  return {
    contract: REVIEW_INBOX_DECISION_CONTRACT,
    tenant: REVIEW_INBOX_PILOT_TENANT,
    caseId: REVIEW_INBOX_PILOT_TENANT,
    revision: submit.revision,
    command: 'favorite',
    actionId,
  };
}
