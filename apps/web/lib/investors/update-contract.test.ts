import { describe, expect, it } from 'vitest';
import {
  assertInvestorUpdateDeliveryEventTiming,
  assertInvestorUpdateTrackingDisabled,
  composeInvestorUpdateDraft,
  INVESTOR_UPDATE_RECIPIENT_ROLES,
  type InvestorUpdateCandidate,
  type InvestorUpdateCandidateDecision,
  type InvestorUpdateRecipientSegment,
  InvestorUpdateWorkflowError,
  investorStakeholderRecordSchema,
  investorUpdateCandidateDecisionSchema,
  prepareInvestorUpdateFinalApproval,
  serializeInvestorUpdateApprovalSnapshot,
  validateInvestorUpdateSegments,
} from './update-contract';

const WIN_ID = '11111111-1111-4111-8111-111111111111';
const ASK_ID = '22222222-2222-4222-8222-222222222222';
const SOURCE_ID = '33333333-3333-4333-8333-333333333333';

function candidate(
  overrides: Partial<InvestorUpdateCandidate> = {}
): InvestorUpdateCandidate {
  return {
    id: WIN_ID,
    kind: 'win',
    category: 'shipping_velocity',
    metricLabel: 'Merged pull requests',
    metricValue: '19',
    metricUnit: 'count',
    windowStart: '2026-08-01T00:00:00.000Z',
    windowEnd: '2026-08-31T23:59:59.000Z',
    sourceRecordId: SOURCE_ID,
    sourceLabel: 'GitHub merged pull request receipt set',
    sourceUrl: 'https://github.com/JovieInc/Jovie/pulls?q=is%3Amerged',
    sourceObservedAt: '2026-08-29T16:00:00.000Z',
    confidence: 0.98,
    caveats: [
      'Shipping velocity is operating leverage, not customer traction.',
    ],
    proposedClaim: 'We merged 19 pull requests in August.',
    relevanceScore: 0.8,
    createdAt: '2026-08-29T16:00:00.000Z',
    ...overrides,
  };
}

function decision(
  overrides: Partial<InvestorUpdateCandidateDecision> = {}
): InvestorUpdateCandidateDecision {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    candidateId: WIN_ID,
    decision: 'share',
    editedClaim: null,
    decidedByUserId: 'user_founder',
    decidedAt: '2026-08-29T16:10:00.000Z',
    ...overrides,
  };
}

function segments(): InvestorUpdateRecipientSegment[] {
  return [
    { role: 'investor', included: true, recipientCount: 12 },
    { role: 'advisor', included: false, recipientCount: 0 },
    { role: 'founder_self', included: true, recipientCount: 1 },
    { role: 'other_explicit', included: false, recipientCount: 0 },
  ];
}

describe('investor update approval contract', () => {
  it('ranks relevant candidates and composes only Share and Edit decisions', () => {
    const ask = candidate({
      id: ASK_ID,
      kind: 'ask',
      relevanceScore: 0.95,
      proposedClaim: 'Introduce us to two creator-economy operators.',
    });
    const decisions = new Map([
      [
        WIN_ID,
        decision({
          decision: 'edit',
          editedClaim: 'We merged 19 source-verified pull requests in August.',
        }),
      ],
      [
        ASK_ID,
        decision({
          id: '55555555-5555-4555-8555-555555555555',
          candidateId: ASK_ID,
          decision: 'exclude',
        }),
      ],
    ]);

    expect(
      composeInvestorUpdateDraft({
        subject: 'Jovie August Update',
        candidates: [candidate(), ask],
        decisionsByCandidateId: decisions,
      })
    ).toEqual({
      renderedCopy:
        'Jovie August Update\n\nWins\n- We merged 19 source-verified pull requests in August.',
      includedCandidateIds: [WIN_ID],
      pendingCandidateIds: [],
    });
  });

  it('keeps undecided wins and asks out of the living draft', () => {
    const result = composeInvestorUpdateDraft({
      subject: 'Jovie August Update',
      candidates: [candidate()],
      decisionsByCandidateId: new Map(),
    });

    expect(result.renderedCopy).toBe('Jovie August Update');
    expect(result.pendingCandidateIds).toEqual([WIN_ID]);
  });

  it('requires exact replacement copy for Edit decisions', () => {
    expect(
      investorUpdateCandidateDecisionSchema.safeParse(
        decision({ decision: 'edit', editedClaim: null })
      ).success
    ).toBe(false);
    expect(
      investorUpdateCandidateDecisionSchema.safeParse(
        decision({ decision: 'share', editedClaim: 'Unexpected copy' })
      ).success
    ).toBe(false);
  });

  it('requires every role to be explicitly included or excluded', () => {
    expect(() =>
      validateInvestorUpdateSegments({
        segments: segments().slice(0, 3),
        recipientCount: 13,
      })
    ).toThrowError(
      new InvestorUpdateWorkflowError(
        'segments_invalid',
        'Every recipient role must be explicitly included or excluded exactly once.'
      )
    );

    expect(
      validateInvestorUpdateSegments({
        segments: segments(),
        recipientCount: 13,
      }).map(segment => segment.role)
    ).toEqual(INVESTOR_UPDATE_RECIPIENT_ROLES);
  });

  it('requires the approval count to equal the segment total', () => {
    expect(() =>
      validateInvestorUpdateSegments({
        segments: segments(),
        recipientCount: 12,
      })
    ).toThrow(/explicit segment total \(13\)/);
  });

  it('keeps open and click tracking disabled without compliant substrate', () => {
    expect(
      assertInvestorUpdateTrackingDisabled({
        opens: false,
        clicks: false,
        privacyDisclosureVersion: null,
        consentBasis: null,
      })
    ).toMatchObject({ opens: false, clicks: false });

    expect(() =>
      assertInvestorUpdateTrackingDisabled({
        opens: true,
        clicks: false,
        privacyDisclosureVersion: 'v1',
        consentBasis: 'consent',
      })
    ).toThrow(/consent-aware substrate/);

    expect(() =>
      assertInvestorUpdateTrackingDisabled({
        opens: false,
        clicks: false,
        privacyDisclosureVersion: null,
        consentBasis: null,
        extraField: true,
      } as never)
    ).toThrow(InvestorUpdateWorkflowError);
  });

  it('requires all candidate decisions and byte-exact reviewed copy', () => {
    const base = {
      subject: 'Jovie August Update',
      candidates: [candidate()],
      segments: segments(),
      recipientCount: 13,
      trackingSettings: {
        opens: false,
        clicks: false,
        privacyDisclosureVersion: null,
        consentBasis: null,
      },
    } as const;

    expect(() =>
      prepareInvestorUpdateFinalApproval({
        ...base,
        decisionsByCandidateId: new Map(),
        expectedRenderedCopy: 'Jovie August Update',
      })
    ).toThrow(/requires a founder decision/);

    expect(() =>
      prepareInvestorUpdateFinalApproval({
        ...base,
        decisionsByCandidateId: new Map([[WIN_ID, decision()]]),
        expectedRenderedCopy: 'stale copy',
      })
    ).toThrow(/changed after review/);
  });

  it('accepts an exact approval snapshot without exposing a send transition', () => {
    const expectedRenderedCopy =
      'Jovie August Update\n\nWins\n- We merged 19 pull requests in August.';
    const approval = prepareInvestorUpdateFinalApproval({
      subject: 'Jovie August Update',
      candidates: [candidate()],
      decisionsByCandidateId: new Map([[WIN_ID, decision()]]),
      segments: segments(),
      recipientCount: 13,
      trackingSettings: {
        opens: false,
        clicks: false,
        privacyDisclosureVersion: null,
        consentBasis: null,
      },
      expectedRenderedCopy,
    });

    expect(approval.renderedCopy).toBe(expectedRenderedCopy);
    expect(approval).not.toHaveProperty('send');
    expect(approval).not.toHaveProperty('provider');
  });

  it('fingerprints candidates, decision records, copy, roles, count, and tracking deterministically', () => {
    const first = serializeInvestorUpdateApprovalSnapshot({
      candidateIds: [ASK_ID, WIN_ID],
      decisionRecordIds: ['decision-b', 'decision-a'],
      renderedCopy: 'Exact copy',
      segments: [...segments()].reverse(),
      recipientCount: 13,
      trackingSettings: {
        opens: false,
        clicks: false,
        privacyDisclosureVersion: null,
        consentBasis: null,
      },
    });
    const reordered = serializeInvestorUpdateApprovalSnapshot({
      candidateIds: [WIN_ID, ASK_ID],
      decisionRecordIds: ['decision-a', 'decision-b'],
      renderedCopy: 'Exact copy',
      segments: segments(),
      recipientCount: 13,
      trackingSettings: {
        opens: false,
        clicks: false,
        privacyDisclosureVersion: null,
        consentBasis: null,
      },
    });
    expect(first).toBe(reordered);
    expect(first).not.toBe(
      serializeInvestorUpdateApprovalSnapshot({
        candidateIds: [WIN_ID],
        decisionRecordIds: ['decision-a'],
        renderedCopy: 'Exact copy',
        segments: segments(),
        recipientCount: 13,
        trackingSettings: {
          opens: false,
          clicks: false,
          privacyDisclosureVersion: null,
          consentBasis: null,
        },
      })
    );
  });

  it('requires provider acceptance inside approval and rejects future observations', () => {
    expect(() =>
      assertInvestorUpdateDeliveryEventTiming({
        eventType: 'provider_accepted',
        approvedAt: '2026-08-29T16:00:00.000Z',
        expiresAt: '2026-08-29T16:15:00.000Z',
        occurredAt: '2026-08-29T16:10:00.000Z',
        observedAt: '2026-08-29T16:11:00.000Z',
      })
    ).not.toThrow();
    expect(() =>
      assertInvestorUpdateDeliveryEventTiming({
        eventType: 'provider_accepted',
        approvedAt: '2026-08-29T16:00:00.000Z',
        expiresAt: '2026-08-29T16:15:00.000Z',
        occurredAt: '2026-08-29T16:16:00.000Z',
        observedAt: '2026-08-29T16:17:00.000Z',
      })
    ).toThrow(/inside the exact final-approval window/);
    expect(() =>
      assertInvestorUpdateDeliveryEventTiming({
        eventType: 'provider_accepted',
        approvedAt: '2026-08-29T16:00:00.000Z',
        expiresAt: '2026-08-29T16:15:00.000Z',
        occurredAt: '2026-08-29T16:10:00.000Z',
        observedAt: '2026-08-29T16:09:00.000Z',
      })
    ).toThrow(/occur in the future/);
  });

  it('allows post-window delivery only after a provider-accepted receipt', () => {
    expect(() =>
      assertInvestorUpdateDeliveryEventTiming({
        eventType: 'delivered',
        approvedAt: '2026-08-29T16:00:00.000Z',
        expiresAt: '2026-08-29T16:15:00.000Z',
        providerAcceptedAt: '2026-08-29T16:10:00.000Z',
        occurredAt: '2026-08-29T18:00:00.000Z',
        observedAt: '2026-08-29T18:01:00.000Z',
      })
    ).not.toThrow();
    expect(() =>
      assertInvestorUpdateDeliveryEventTiming({
        eventType: 'delivered',
        approvedAt: '2026-08-29T16:00:00.000Z',
        expiresAt: '2026-08-29T16:15:00.000Z',
        occurredAt: '2026-08-29T18:00:00.000Z',
        observedAt: '2026-08-29T18:01:00.000Z',
      })
    ).toThrow(/provider-accepted receipt/);
  });

  it('distinguishes sourced known, estimated, and unknown contributions', () => {
    const observed = {
      referenceLabel: 'Stakeholder record',
      role: 'investor' as const,
      contributionAmountCents: 25_000_00,
      contributionCurrency: 'USD',
      contributionSourceRecordId: SOURCE_ID,
      contributionAsOf: '2026-08-29T16:00:00.000Z',
    };
    expect(
      investorStakeholderRecordSchema.safeParse({
        ...observed,
        contributionKnowledge: 'known',
      }).success
    ).toBe(true);
    expect(
      investorStakeholderRecordSchema.safeParse({
        ...observed,
        contributionKnowledge: 'estimated',
      }).success
    ).toBe(true);
    expect(
      investorStakeholderRecordSchema.safeParse({
        ...observed,
        contributionKnowledge: 'unknown',
      }).success
    ).toBe(false);
    expect(
      investorStakeholderRecordSchema.safeParse({
        referenceLabel: 'Stakeholder record',
        role: 'advisor',
        contributionKnowledge: 'unknown',
        contributionAmountCents: null,
        contributionCurrency: null,
        contributionSourceRecordId: null,
        contributionAsOf: null,
      }).success
    ).toBe(true);
  });
});
