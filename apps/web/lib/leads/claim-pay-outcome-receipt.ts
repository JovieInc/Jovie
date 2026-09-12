/**
 * JOV-6166 / JOV-5912 claim→pay outcome-receipt inspection.
 *
 * Lead funnel events remain the durable store. This module does not open a
 * second monitoring silo — it makes a missing paid_converted receipt
 * observable against paidAt + webhook success, and stamps the JOV-5912
 * experiment correlation that paid_converted previously omitted.
 */

import {
  acquisitionFunnelAttribution,
  PREMADE_ARTIST_PROFILE_EXPERIMENT_ID,
} from '@/lib/acquisition/kernel';

export const CLAIM_PAY_PAID_EVENT = 'paid_converted' as const;
export const CLAIM_PAY_CLAIM_EVENT = 'claim_page_viewed' as const;
export const CLAIM_PAY_SIGNUP_EVENT = 'signup_completed' as const;
export const CLAIM_PAY_ACTIVATION_EVENT = 'onboarding_completed' as const;

export const CLAIM_PAY_OUTCOME_GAPS = [
  'complete',
  'missing_paid_receipt',
  'false_green_webhook',
  'broken_experiment_correlation',
  'missing_claim_receipt',
  'missing_activation_receipt',
] as const;

export type ClaimPayOutcomeGap = (typeof CLAIM_PAY_OUTCOME_GAPS)[number];

export interface ClaimPayOutcomeEvent {
  readonly eventType: string;
  readonly campaignKey?: string | null;
  readonly metadata?: {
    readonly experimentId?: unknown;
  } | null;
}

export interface ClaimPayOutcomeReceipt {
  readonly status: ClaimPayOutcomeGap;
  readonly observable: boolean;
  readonly experimentCorrelated: boolean;
  readonly hasPaidReceipt: boolean;
}

export function claimPayOutcomeAttribution(): {
  readonly campaignKey: string;
  readonly variantKey: string;
  readonly experimentId: typeof PREMADE_ARTIST_PROFILE_EXPERIMENT_ID;
} {
  const attribution = acquisitionFunnelAttribution(
    PREMADE_ARTIST_PROFILE_EXPERIMENT_ID
  );
  return {
    campaignKey: attribution.campaignKey,
    variantKey: attribution.variantKey,
    experimentId: PREMADE_ARTIST_PROFILE_EXPERIMENT_ID,
  };
}

function eventTypes(events: readonly ClaimPayOutcomeEvent[]): Set<string> {
  return new Set(events.map(event => event.eventType));
}

function paidReceiptExperimentId(
  events: readonly ClaimPayOutcomeEvent[]
): string | null {
  const paid = events.find(event => event.eventType === CLAIM_PAY_PAID_EVENT);
  if (!paid) return null;
  if (typeof paid.metadata?.experimentId === 'string') {
    return paid.metadata.experimentId;
  }
  return paid.campaignKey ?? null;
}

/**
 * Inspect one lead's claim→activation→paid receipts.
 * `observable` is true when a gap can be classified — the failure is not silent.
 */
export function inspectClaimPayOutcomeReceipt(input: {
  readonly paidAt?: Date | string | null;
  readonly signupAt?: Date | string | null;
  readonly events: readonly ClaimPayOutcomeEvent[];
  readonly webhookReturnedSuccess?: boolean;
}): ClaimPayOutcomeReceipt {
  const types = eventTypes(input.events);
  const hasPaidReceipt = types.has(CLAIM_PAY_PAID_EVENT);
  const experimentId = paidReceiptExperimentId(input.events);
  const experimentCorrelated =
    experimentId === PREMADE_ARTIST_PROFILE_EXPERIMENT_ID;

  if (input.paidAt && !hasPaidReceipt && input.webhookReturnedSuccess) {
    return {
      status: 'false_green_webhook',
      observable: true,
      experimentCorrelated: false,
      hasPaidReceipt,
    };
  }

  if (input.paidAt && !hasPaidReceipt) {
    return {
      status: 'missing_paid_receipt',
      observable: true,
      experimentCorrelated: false,
      hasPaidReceipt,
    };
  }

  if (hasPaidReceipt && !experimentCorrelated) {
    return {
      status: 'broken_experiment_correlation',
      observable: true,
      experimentCorrelated: false,
      hasPaidReceipt,
    };
  }

  if (input.signupAt && !types.has(CLAIM_PAY_SIGNUP_EVENT)) {
    return {
      status: 'missing_activation_receipt',
      observable: true,
      experimentCorrelated,
      hasPaidReceipt,
    };
  }

  if (
    (input.signupAt || input.paidAt) &&
    !types.has(CLAIM_PAY_CLAIM_EVENT) &&
    !types.has(CLAIM_PAY_SIGNUP_EVENT)
  ) {
    return {
      status: 'missing_claim_receipt',
      observable: true,
      experimentCorrelated,
      hasPaidReceipt,
    };
  }

  return {
    status: 'complete',
    observable: true,
    experimentCorrelated,
    hasPaidReceipt,
  };
}

/**
 * Deliberate-red fixture: billing/webhook succeeded, paid_converted never
 * landed, and the handler still returned success. JOV-6166 closes this hole.
 */
export const CLAIM_PAY_FALSE_GREEN_WEBHOOK_FIXTURE = {
  paidAt: '2026-09-12T00:00:00.000Z',
  signupAt: '2026-09-11T00:00:00.000Z',
  webhookReturnedSuccess: true,
  events: [
    { eventType: CLAIM_PAY_CLAIM_EVENT, campaignKey: 'claim_invite' },
    { eventType: CLAIM_PAY_SIGNUP_EVENT, campaignKey: 'claim_invite' },
    { eventType: CLAIM_PAY_ACTIVATION_EVENT, campaignKey: 'claim_invite' },
  ],
} as const satisfies Parameters<typeof inspectClaimPayOutcomeReceipt>[0];

export const CLAIM_PAY_HAPPY_PATH_FIXTURE = {
  paidAt: '2026-09-12T00:00:00.000Z',
  signupAt: '2026-09-11T00:00:00.000Z',
  webhookReturnedSuccess: true,
  events: [
    { eventType: CLAIM_PAY_CLAIM_EVENT, campaignKey: 'claim_invite' },
    { eventType: CLAIM_PAY_SIGNUP_EVENT, campaignKey: 'claim_invite' },
    { eventType: CLAIM_PAY_ACTIVATION_EVENT, campaignKey: 'claim_invite' },
    {
      eventType: CLAIM_PAY_PAID_EVENT,
      campaignKey: PREMADE_ARTIST_PROFILE_EXPERIMENT_ID,
      metadata: { experimentId: PREMADE_ARTIST_PROFILE_EXPERIMENT_ID },
    },
  ],
} as const satisfies Parameters<typeof inspectClaimPayOutcomeReceipt>[0];
