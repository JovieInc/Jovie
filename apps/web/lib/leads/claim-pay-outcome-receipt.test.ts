import { describe, expect, it } from 'vitest';
import { PREMADE_ARTIST_PROFILE_EXPERIMENT_ID } from '@/lib/acquisition/kernel';
import {
  CLAIM_PAY_FALSE_GREEN_WEBHOOK_FIXTURE,
  CLAIM_PAY_HAPPY_PATH_FIXTURE,
  CLAIM_PAY_PAID_EVENT,
  claimPayOutcomeAttribution,
  inspectClaimPayOutcomeReceipt,
} from '@/lib/leads/claim-pay-outcome-receipt';

describe('claimPayOutcomeAttribution', () => {
  it('stamps the JOV-5912 premade-artist-profile experiment on paid receipts', () => {
    expect(claimPayOutcomeAttribution()).toEqual({
      campaignKey: PREMADE_ARTIST_PROFILE_EXPERIMENT_ID,
      variantKey: 'launch-acquisition:premade-artist-profile:v1',
      experimentId: PREMADE_ARTIST_PROFILE_EXPERIMENT_ID,
    });
  });
});

describe('inspectClaimPayOutcomeReceipt', () => {
  it('classifies a happy-path paid outcome as complete and experiment-correlated', () => {
    const receipt = inspectClaimPayOutcomeReceipt(CLAIM_PAY_HAPPY_PATH_FIXTURE);

    expect(receipt).toEqual({
      status: 'complete',
      observable: true,
      experimentCorrelated: true,
      hasPaidReceipt: true,
    });
  });

  it('deliberate-red: a successful webhook without paid_converted is a false-green', () => {
    const receipt = inspectClaimPayOutcomeReceipt(
      CLAIM_PAY_FALSE_GREEN_WEBHOOK_FIXTURE
    );

    expect(CLAIM_PAY_FALSE_GREEN_WEBHOOK_FIXTURE.webhookReturnedSuccess).toBe(
      true
    );
    expect(
      CLAIM_PAY_FALSE_GREEN_WEBHOOK_FIXTURE.events.some(
        event => event.eventType === CLAIM_PAY_PAID_EVENT
      )
    ).toBe(false);
    expect(receipt).toEqual({
      status: 'false_green_webhook',
      observable: true,
      experimentCorrelated: false,
      hasPaidReceipt: false,
    });
  });

  it('classifies paidAt without a receipt as a missing paid receipt when the webhook failed closed', () => {
    const receipt = inspectClaimPayOutcomeReceipt({
      paidAt: '2026-09-12T00:00:00.000Z',
      webhookReturnedSuccess: false,
      events: [],
    });

    expect(receipt.status).toBe('missing_paid_receipt');
    expect(receipt.observable).toBe(true);
  });

  it('classifies a paid_converted row that omitted experiment correlation', () => {
    const receipt = inspectClaimPayOutcomeReceipt({
      paidAt: '2026-09-12T00:00:00.000Z',
      webhookReturnedSuccess: true,
      events: [{ eventType: CLAIM_PAY_PAID_EVENT, campaignKey: null }],
    });

    expect(receipt.status).toBe('broken_experiment_correlation');
    expect(receipt.observable).toBe(true);
    expect(receipt.hasPaidReceipt).toBe(true);
  });

  it('classifies signupAt without signup_completed as a missing activation receipt', () => {
    const receipt = inspectClaimPayOutcomeReceipt({
      signupAt: '2026-09-11T00:00:00.000Z',
      events: [{ eventType: 'claim_page_viewed', campaignKey: 'claim_invite' }],
    });

    expect(receipt.status).toBe('missing_activation_receipt');
    expect(receipt.observable).toBe(true);
  });
});
