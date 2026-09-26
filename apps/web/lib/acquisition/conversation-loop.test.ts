import { describe, expect, it } from 'vitest';
import {
  activationSatisfied,
  COMMITMENT_EXPERIMENTS,
  CONVERSATION_ENTRY_SURFACES,
  commitmentStrengthRank,
  decideConversationOutcome,
  evaluatePublicChannelIntake,
  isLeadingQuestion,
  isPublicEntrySurface,
  PAYMENT_LINK_STATES,
  paymentTermsComplete,
  qualificationReceipt,
  reconcilePaymentLinkState,
  resolveConversationIdentity,
  selectCommitmentExperiment,
} from './conversation-loop';

const FULL_ANSWERS = {
  current_behavior: 'Manually edits thumbnails in Photoshop each week.',
  pain: 'Low CTR; spends Sunday nights redoing artwork.',
  spend: 'Pays a freelancer $150/mo for cover art.',
  urgency: 'Album drops in three weeks.',
  alternatives: 'Freelancer and Canva templates.',
  desired_outcome: 'Thumbnail redos before release without a designer.',
} as const;

describe('conversation loop (JOV-5947)', () => {
  it('resolves and dedupes identity; public surfaces require confirmation', () => {
    const resolved = resolveConversationIdentity({
      surface: 'direct_imessage',
      threadId: 'thread-1',
      phone: '+15551234567',
      existingProspectIds: ['lead-9'],
    });
    expect(resolved.deduplicated).toBe(true);
    expect(resolved.prospectKey).toBe('direct_imessage:lead-9');
    expect(resolved.authority).toBe('contact_evidence');
    expect(resolved.requiresConfirmation).toBe(false);

    const pub = resolveConversationIdentity({
      surface: 'public_dm',
      handle: '@fan',
      accountId: 'acct-1',
    });
    expect(pub.authority).toBe('verified_account');
    expect(pub.requiresConfirmation).toBe(true);
    expect(pub.publicSurface).toBe(true);
    expect(isPublicEntrySurface('landing_tap')).toBe(false);
    expect(CONVERSATION_ENTRY_SURFACES).toContain('landing_qr');
  });

  it('flags leading/vanity questions', () => {
    expect(isLeadingQuestion('Would you pay for this?')).toBe(true);
    expect(isLeadingQuestion('How much would you pay?')).toBe(true);
    expect(
      isLeadingQuestion('What did you do the last time this came up?')
    ).toBe(false);
  });

  it('emits a structured Mom Test qualification receipt', () => {
    const receipt = qualificationReceipt({
      answers: { ...FULL_ANSWERS },
      evidence: [
        { threadTurnId: 't1', dimension: 'current_behavior' },
        { threadTurnId: 't2', dimension: 'spend' },
      ],
      hasCurrentSpend: true,
      hasAuthority: true,
      hasConcreteUrgency: true,
    });
    expect(receipt.missingDimensions).toEqual([]);
    expect(receipt.willingnessToPay).toBe('demonstrated');
    expect(receipt.recommendedNextAction).toBe('commitment_payment');
    expect(receipt.confidence).toBeGreaterThan(0.5);
    expect(receipt.evidenceRefs).toHaveLength(2);
  });

  it('requests evidence when dimensions are missing and disqualifies on blockers', () => {
    const partial = qualificationReceipt({
      answers: { current_behavior: 'Uses Linktree.' },
      evidence: [],
      hasCurrentSpend: false,
      hasAuthority: true,
      hasConcreteUrgency: false,
    });
    expect(partial.recommendedNextAction).toBe('request_evidence');
    expect(partial.missingDimensions.length).toBeGreaterThan(0);

    const blocked = qualificationReceipt({
      answers: { ...FULL_ANSWERS },
      evidence: [],
      disqualifiers: ['no_budget'],
      hasCurrentSpend: true,
      hasAuthority: true,
      hasConcreteUrgency: true,
    });
    expect(blocked.recommendedNextAction).toBe('disqualify');
    expect(blocked.disqualifiers).toContain('no_budget');
  });

  it('routes missing authority to needs_you', () => {
    const receipt = qualificationReceipt({
      answers: { ...FULL_ANSWERS },
      evidence: [],
      hasCurrentSpend: true,
      hasAuthority: false,
      hasConcreteUrgency: true,
    });
    expect(receipt.recommendedNextAction).toBe('needs_you');
  });

  it('selects the smallest ethical commitment experiment', () => {
    const strong = qualificationReceipt({
      answers: { ...FULL_ANSWERS },
      evidence: FULL_ANSWERS && [
        { threadTurnId: 't1', dimension: 'current_behavior' },
        { threadTurnId: 't2', dimension: 'pain' },
        { threadTurnId: 't3', dimension: 'spend' },
        { threadTurnId: 't4', dimension: 'urgency' },
        { threadTurnId: 't5', dimension: 'alternatives' },
        { threadTurnId: 't6', dimension: 'desired_outcome' },
      ],
      hasCurrentSpend: true,
      hasAuthority: true,
      hasConcreteUrgency: true,
    });
    expect(selectCommitmentExperiment(strong)).toBe('payment');

    const weak = qualificationReceipt({
      answers: { ...FULL_ANSWERS },
      evidence: [],
      hasCurrentSpend: false,
      hasAuthority: true,
      hasConcreteUrgency: false,
    });
    const experiment = selectCommitmentExperiment(weak);
    expect(experiment).toBe('setup_effort');
    expect(commitmentStrengthRank(experiment as never)).toBeGreaterThan(
      commitmentStrengthRank('payment')
    );
    expect(COMMITMENT_EXPERIMENTS).toContain('scheduled_session');
  });

  it('reconciles payment-link states and rejects impossible transitions', () => {
    expect(reconcilePaymentLinkState('sent', 'opened').ok).toBe(true);
    expect(reconcilePaymentLinkState('opened', 'attempted').state).toBe(
      'attempted'
    );
    expect(reconcilePaymentLinkState('attempted', 'paid').ok).toBe(true);
    expect(reconcilePaymentLinkState('paid', 'refunded').ok).toBe(true);
    expect(reconcilePaymentLinkState('refunded', 'paid').ok).toBe(false);
    expect(reconcilePaymentLinkState('sent', 'refunded').ok).toBe(false);
    expect(PAYMENT_LINK_STATES).toContain('disputed');
  });

  it('requires explicit payment terms before a link is sent', () => {
    const incomplete = paymentTermsComplete({ price: '$49' });
    expect(incomplete.complete).toBe(false);
    expect(incomplete.missing).toContain('refund_policy');
    const complete = paymentTermsComplete({
      price: '$49',
      fulfillment_condition: 'page delivered in-thread',
      refund_policy: 'full refund before delivery',
      cancel_policy: 'cancel anytime pre-fulfillment',
      timing: '48h',
    });
    expect(complete.complete).toBe(true);
  });

  it('decides accept/waitlist/disqualify/needs_you against kernel states', () => {
    const identity = resolveConversationIdentity({
      surface: 'direct_imessage',
      threadId: 't',
      phone: '+15551234567',
    });
    const qualified = qualificationReceipt({
      answers: { ...FULL_ANSWERS },
      evidence: [],
      hasCurrentSpend: true,
      hasAuthority: true,
      hasConcreteUrgency: true,
    });

    const paid = decideConversationOutcome({
      identity,
      qualification: qualified,
      paymentState: 'paid',
      fulfillmentReady: true,
    });
    expect(paid.decision).toBe('accept');
    expect(paid.acquisitionState).toBe('claimed');

    const paidNotReady = decideConversationOutcome({
      identity,
      qualification: qualified,
      paymentState: 'paid',
      fulfillmentReady: false,
    });
    expect(paidNotReady.decision).toBe('waitlist');
    expect(paidNotReady.acquisitionState).toBe('contacted');

    const ambiguous = decideConversationOutcome({
      identity: { ...identity, authority: 'ambiguous' },
      qualification: qualified,
      fulfillmentReady: true,
    });
    expect(ambiguous.decision).toBe('needs_you');
    expect(ambiguous.needsYouReasons).toContain('ambiguous_identity');
    expect(ambiguous.acquisitionState).toBe('human_review');

    const disqualified = decideConversationOutcome({
      identity,
      qualification: { ...qualified, recommendedNextAction: 'disqualify' },
      fulfillmentReady: true,
    });
    expect(disqualified.acquisitionState).toBe('disqualified');
  });

  it('proves activation by delivered value, not signup', () => {
    expect(activationSatisfied(['account_created'])).toBe(false);
    expect(activationSatisfied(['provisioned'])).toBe(false);
    expect(activationSatisfied(['provisioned', 'first_use_confirmed'])).toBe(
      true
    );
    expect(activationSatisfied(['value_delivered'])).toBe(true);
  });

  it('blocks public-channel intake until the response loop is certified', () => {
    const blocked = evaluatePublicChannelIntake({
      responseLoopCertified: false,
      identityRulesCertified: true,
      moderationCertified: true,
      escalationCertified: true,
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.missing).toEqual(['response_loop']);

    expect(
      evaluatePublicChannelIntake({
        responseLoopCertified: true,
        identityRulesCertified: true,
        moderationCertified: true,
        escalationCertified: true,
      }).allowed
    ).toBe(true);
  });
});
