import type { OpportunityInboxData } from '@/lib/connectors/opportunity-inbox-types';
import type { OvieInbox } from '@/lib/ovie/inbox';

// The production opportunity mapper caps the rendered inbox at 50 cards.
export const DECISION_FIXTURE_SIZE = 50;
export const opportunityDecisionFixture: OpportunityInboxData = {
  availability: { suggestedActions: 'available', tourDates: 'not_requested' },
  emptyActionCards: [],
  cards: Array.from({ length: DECISION_FIXTURE_SIZE }, (_, index) => ({
    id: `decision-${index}`,
    sourceKind: 'social.reply',
    signalType: 'fan_reply',
    typeLabel: 'Fan reply',
    createdAt: '2026-10-01T12:00:00.000Z',
    title: `Synthetic reply ${index}`,
    why: 'A synthetic fan comment awaits a creator decision.',
    primaryActionLabel: 'Approve reply',
    status: 'pending',
    category: 'social_reply',
    socialReply: {
      platform: 'YouTube',
      authorLabel: 'Synthetic listener',
      typeLabel: 'Comment',
      inboundText: 'When is the next release?',
      draftedText: 'Thanks for listening. More music soon.',
      sourceUrl: null,
      executionState: 'pending',
      revisionCount: 0,
    },
  })),
};

export const ovieDecisionFixture: OvieInbox = {
  issues: [],
  cases: Array.from({ length: 80 }, (_, index) => ({
    contract: 'jovie.interaction-case/v1',
    id: `summer:${index}`,
    kind: 'spend',
    source: { system: 'summer', id: String(index), revision: null },
    title: `Synthetic decision ${index}`,
    body: 'Synthetic proposal evidence.\n'.repeat(48),
    recommendation: 'Review scope before recording the decision.',
    owner: 'founder',
    state: 'needs_you',
    priority: 1,
    createdAt: '2026-10-01T12:00:00.000Z',
    nextAction: 'Review',
    waitingUntil: null,
    confidence: null,
    evidence: [],
    decisionTarget: { kind: 'summer', id: String(index) },
  })),
};
