import { describe, expect, it } from 'vitest';
import type { CanonicalAnswer } from './answer-reuse';
import {
  type FollowupApproval,
  type FollowupEmailDraft,
  type FollowupLedgerEvent,
  InvestorFollowupError,
  isInvestorFollowupReplay,
  prepareInvestorFollowupApproval,
  prepareInvestorFollowupDraft,
  previewInvestorFollowup,
  recheckInvestorFollowupBeforeDelivery,
  transitionInvestorFollowup,
} from './followup-contract';

const NOW = '2026-09-28T12:00:00.000Z';
const LATER = '2026-09-28T12:05:00.000Z';
const EXPIRY = '2026-09-28T13:00:00.000Z';

const ANSWER: CanonicalAnswer = {
  answerId: 'pricing-and-availability',
  version: 'jov-6290-2026-09-20',
  directAnswer:
    'Jovie gives every artist one public profile with a smart link, and the paid tier adds release and audience tools.',
  owner: 'Tim White',
  review: {
    state: 'approved',
    reviewedBy: 'Tim White',
    reviewedAt: '2026-09-20T00:00:00Z',
    approvalBasis: 'Approved canonical pricing answer.',
  },
  privateContext: {
    question: 'Does Jovie charge artists to claim a profile?',
    identities: ['inquiry-question-9f2'],
  },
  claims: [
    {
      claimId: 'public-profile-availability',
      revisionId: 'jov-6216-public-profile-2026-09-17',
      kind: 'current-availability',
      statement:
        'A claimable public profile page is generally available with open access.',
      disclosure: 'public',
      evidenceQuality: 'verified',
      evidenceRefs: ['apps/web/data/marketing/featureAvailability.ts'],
      revisedAt: '2026-09-17',
    },
  ],
};

const QUESTION = {
  questionId: 'question-9f2',
  askedAt: '2026-09-27T18:30:00.000Z',
  concern: 'Does Jovie charge artists to claim a profile?',
};

const RECIPIENT = {
  email: 'investor@example.com',
  displayName: 'Riley',
  investorLinkId: '8f3a1c2e-0000-4000-8000-000000000001',
};

const SENDER = { senderId: 'founder-tim', address: 'tim@jovie.app' };

const CLAIM_USES = [
  {
    claimId: 'public-profile-availability',
    revisionId: 'jov-6216-public-profile-2026-09-17',
  },
] as const;

function preparedDraft(
  overrides: Partial<Parameters<typeof prepareInvestorFollowupDraft>[0]> = {}
): FollowupEmailDraft {
  return prepareInvestorFollowupDraft({
    question: QUESTION,
    answer: ANSWER,
    claimUses: [...CLAIM_USES],
    recipient: RECIPIENT,
    sender: SENDER,
    link: null,
    nextStep: 'If you want the deck, I can send the current memo.',
    now: NOW,
    ...overrides,
  });
}

function approved(draft: FollowupEmailDraft): FollowupApproval {
  return prepareInvestorFollowupApproval({
    draft,
    approvedBy: 'Tim White',
    now: NOW,
    expiresAt: EXPIRY,
    destination: 'provider',
    permittedAction: 'send-once',
  });
}

function event(
  state: FollowupLedgerEvent['state'],
  occurredAt: string
): FollowupLedgerEvent {
  return { state, occurredAt, actor: 'system', reference: 'ref-1' };
}

describe('prepareInvestorFollowupDraft', () => {
  it('composes a draft that directly answers with at most one next step', () => {
    const draft = preparedDraft({
      link: { url: 'https://jovie.app/blog/pricing', scope: 'public-article' },
    });
    expect(draft.state).toBe('draft');
    expect(draft.payload.bodyText).toContain(ANSWER.directAnswer);
    expect(draft.payload.bodyText).toContain('https://jovie.app/blog/pricing');
    expect(draft.payload.bodyText).toContain('current memo');
    expect(draft.questionId).toBe('question-9f2');
    expect(draft.threadId).toBeUndefined();
  });

  it('carries the existing thread when the question has one', () => {
    const draft = preparedDraft({
      question: { ...QUESTION, existingThreadId: 'thread-77' },
    });
    expect(draft.threadId).toBe('thread-77');
  });

  it('derives a stable idempotency key across replays', () => {
    expect(preparedDraft().idempotencyKey).toBe(preparedDraft().idempotencyKey);
    expect(preparedDraft().idempotencyKey).toContain(
      'investor-followup:question-9f2'
    );
  });

  it('changes the idempotency key when content or recipient changes', () => {
    const otherRecipient = preparedDraft({
      recipient: { ...RECIPIENT, email: 'other@example.com' },
    });
    expect(otherRecipient.idempotencyKey).not.toBe(
      preparedDraft().idempotencyKey
    );
  });

  it('rejects an unapproved source answer', () => {
    expect(() =>
      preparedDraft({
        answer: { ...ANSWER, review: { state: 'draft' } },
      })
    ).toThrowError(InvestorFollowupError);
    expect(() =>
      preparedDraft({
        answer: { ...ANSWER, review: { state: 'withdrawn' } },
      })
    ).toThrowError(/approved canonical answer/);
  });

  it('rejects claim uses that do not bind the current revision', () => {
    expect(() =>
      preparedDraft({
        claimUses: [
          { claimId: 'public-profile-availability', revisionId: 'stale' },
        ],
      })
    ).toThrowError(/exact current canonical claim revisions/);
  });

  it('rejects a second next step', () => {
    expect(() =>
      preparedDraft({ nextStep: 'Reply here.\nOr book a call.' })
    ).toThrowError(/at most one relevant next step/);
  });

  it('rejects public links carrying name, email, question, or tokens', () => {
    for (const url of [
      'https://jovie.app/blog/pricing?from=investor@example.com',
      'https://jovie.app/blog/pricing?utm=Riley',
      'https://jovie.app/blog/pricing?ref=Does%20Jovie%20charge%20artists%20to%20claim%20a%20profile%3F',
      'https://jovie.app/private/memo?t=secret-token',
      'http://jovie.app/blog/pricing',
    ]) {
      expect(() =>
        preparedDraft({ link: { url, scope: 'public-article' } })
      ).toThrowError(InvestorFollowupError);
    }
  });

  it('requires explicit access expiry on private memo links', () => {
    expect(() =>
      preparedDraft({
        link: { url: 'https://jovie.app/memo/x', scope: 'private-memo' },
      })
    ).toThrowError(/access expiry/);
    const draft = preparedDraft({
      link: {
        url: 'https://jovie.app/memo/x',
        scope: 'private-memo',
        accessExpiresAt: EXPIRY,
      },
    });
    expect(draft.link?.scope).toBe('private-memo');
  });

  it('rejects fabricated urgency and familiarity', () => {
    for (const nextStep of [
      'Act now — only 3 allocations left.',
      'Great catching up last week.',
    ]) {
      expect(() => preparedDraft({ nextStep })).toThrowError(
        /urgency, familiarity, or scarcity/
      );
    }
  });
});

describe('previewInvestorFollowup', () => {
  it('returns the payload without consuming approval or changing state', () => {
    const draft = preparedDraft();
    expect(previewInvestorFollowup(draft)).toEqual(draft.payload);
    expect(draft.state).toBe('draft');
  });
});

describe('prepareInvestorFollowupApproval', () => {
  it('binds exact payload, recipient, sender, destination, and expiry', () => {
    const draft = preparedDraft();
    const approval = approved(draft);
    expect(approval.payloadHash).toBe(draft.payloadHash);
    expect(approval.recipientEmail).toBe(RECIPIENT.email);
    expect(approval.senderId).toBe(SENDER.senderId);
    expect(approval.permittedAction).toBe('send-once');
  });

  it('rejects expiry at or before approval time', () => {
    expect(() =>
      prepareInvestorFollowupApproval({
        draft: preparedDraft(),
        approvedBy: 'Tim White',
        now: NOW,
        expiresAt: NOW,
        destination: 'provider',
        permittedAction: 'send-once',
      })
    ).toThrowError(/expiry must be after/);
  });

  it('supports the manual copy-and-send fallback destination', () => {
    const approval = prepareInvestorFollowupApproval({
      draft: preparedDraft(),
      approvedBy: 'Tim White',
      now: NOW,
      expiresAt: EXPIRY,
      destination: 'operator-manual',
      permittedAction: 'copy-manual',
    });
    expect(approval.destination).toBe('operator-manual');
  });
});

describe('recheckInvestorFollowupBeforeDelivery', () => {
  function recheck(
    overrides: Partial<
      Parameters<typeof recheckInvestorFollowupBeforeDelivery>[0]
    > = {}
  ) {
    const draft = preparedDraft();
    return recheckInvestorFollowupBeforeDelivery({
      draft,
      approval: approved(draft),
      currentAnswerVersion: ANSWER.version,
      currentClaimRevisions: new Map(
        CLAIM_USES.map(use => [use.claimId, use.revisionId])
      ),
      recipientAccessActive: true,
      recipientSuppressed: false,
      outboundEnabled: true,
      now: LATER,
      ...overrides,
    });
  }

  it('allows delivery when nothing changed', () => {
    expect(recheck().state).toBe('deliverable');
  });

  it('requires a new approval when the answer was revised', () => {
    const result = recheck({ currentAnswerVersion: 'newer-version' });
    expect(result.state).toBe('requires-new-approval');
  });

  it('requires a new approval when a cited claim changed', () => {
    const result = recheck({
      currentClaimRevisions: new Map([
        ['public-profile-availability', 'revised-2026-09-28'],
      ]),
    });
    expect(result.state).toBe('requires-new-approval');
  });

  it('requires a new approval when the payload changed after approval', () => {
    const draft = preparedDraft();
    const other = preparedDraft({ nextStep: 'Want the current memo?' });
    const result = recheck({
      draft,
      approval: { ...approved(draft), payloadHash: other.payloadHash },
    });
    expect(result.state).toBe('requires-new-approval');
  });

  it('honors recipient suppression and the outbound kill switch', () => {
    expect(recheck({ recipientSuppressed: true }).state).toBe('suppressed');
    expect(recheck({ outboundEnabled: false }).state).toBe('revoked');
  });

  it('blocks delivery on expired approvals and revoked private access', () => {
    expect(recheck({ now: '2026-09-28T14:00:00.000Z' }).state).toBe(
      'requires-new-approval'
    );
    const draft = preparedDraft({
      link: {
        url: 'https://jovie.app/memo/x',
        scope: 'private-memo',
        accessExpiresAt: EXPIRY,
      },
    });
    const result = recheck({
      draft,
      approval: approved(draft),
      recipientAccessActive: false,
    });
    expect(result.state).toBe('requires-new-approval');
    if (result.state === 'requires-new-approval') {
      expect(result.reason).toContain('access');
    }
  });
});

describe('transitionInvestorFollowup', () => {
  it('walks draft through queued, accepted, and delivered', () => {
    let ledger: FollowupLedgerEvent[] = [];
    const push = (state: FollowupLedgerEvent['state'], at: string) => {
      const entry = event(state, at);
      transitionInvestorFollowup({ ledger, event: entry, attemptCount: 0 });
      ledger = [...ledger, entry];
    };
    push('approved', NOW);
    push('queued', NOW);
    push('provider_accepted', LATER);
    push('delivered', '2026-09-28T12:10:00.000Z');
    expect(ledger.at(-1)?.state).toBe('delivered');
  });

  it('routes ambiguous acknowledgments to unknown and forbids blind resend', () => {
    const ledger = [
      event('approved', NOW),
      event('queued', NOW),
      event('provider_accepted', LATER),
      event('unknown', '2026-09-28T12:10:00.000Z'),
    ];
    expect(() =>
      transitionInvestorFollowup({
        ledger,
        event: event('queued', '2026-09-28T12:15:00.000Z'),
        attemptCount: 1,
      })
    ).toThrowError(/reconcile/i);
    expect(
      transitionInvestorFollowup({
        ledger,
        event: event('delivered', '2026-09-28T12:20:00.000Z'),
        attemptCount: 1,
      })
    ).toBe('delivered');
  });

  it('refuses sends from terminal states', () => {
    const ledger = [
      event('approved', NOW),
      event('queued', NOW),
      event('provider_accepted', LATER),
      event('bounced', '2026-09-28T12:10:00.000Z'),
    ];
    expect(() =>
      transitionInvestorFollowup({
        ledger,
        event: event('queued', '2026-09-28T12:15:00.000Z'),
        attemptCount: 1,
      })
    ).toThrowError(InvestorFollowupError);
  });

  it('bounds retries from failed', () => {
    const ledger = [
      event('approved', NOW),
      event('queued', NOW),
      event('provider_accepted', LATER),
      event('failed', '2026-09-28T12:10:00.000Z'),
    ];
    expect(
      transitionInvestorFollowup({
        ledger,
        event: event('queued', '2026-09-28T12:15:00.000Z'),
        attemptCount: 1,
      })
    ).toBe('queued');
    expect(() =>
      transitionInvestorFollowup({
        ledger,
        event: event('queued', '2026-09-28T12:20:00.000Z'),
        attemptCount: 2,
      })
    ).toThrowError(/bounded/);
  });
});

describe('isInvestorFollowupReplay', () => {
  it('marks duplicate delivery jobs for the same draft', () => {
    const draft = preparedDraft();
    expect(
      isInvestorFollowupReplay(draft, [
        { ...event('provider_accepted', LATER), draftId: draft.draftId },
      ])
    ).toBe(true);
    expect(isInvestorFollowupReplay(draft, [])).toBe(false);
    expect(
      isInvestorFollowupReplay(draft, [
        { ...event('delivered', LATER), draftId: 'other-draft' },
      ])
    ).toBe(false);
  });
});
