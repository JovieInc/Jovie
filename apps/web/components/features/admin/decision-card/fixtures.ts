import type { DecisionCardView } from '@/lib/ovie/decision-card-view';
import type { DecisionCardStatus } from './DecisionCard';

/**
 * Story and test fixtures, written to the copy contract the live cards are
 * now filed against (`jovie.decision-card-copy/v1`). The legal card mirrors
 * sc_ef46924c; prices stay out of fixtures (they belong to their owner).
 */
export const LAYOUT_VIEW: DecisionCardView = {
  decision: 'Put the open asks above the pulse on Ovie Home',
  fallback: {
    decision: 'approve',
    relative: 'in 31h',
    deadline: '2026-10-31T06:11:13.202Z',
    tone: 'calm',
    summary: 'Ships with the next deploy; one flag reverts it.',
    conflict: false,
  },
  waiting: null,
  facts: [
    'Asks get answered first when they lead the screen',
    'The pulse stays one row; no new chrome',
    'Same tokens and components as today',
  ],
  evidence: [
    // ui-casing-allow: Linear issue identifier
    { href: 'https://linear.app/jovie/issue/JOV-9650', label: 'JOV-9650' },
    {
      href: 'https://github.com/JovieInc/Jovie/pull/23570',
      label: 'PR #23570',
    },
  ],
};

export const LEGAL_VIEW: DecisionCardView = {
  decision: 'Publish agent connector disclosures in Privacy and Terms',
  fallback: {
    decision: 'approve',
    relative: 'in 47m',
    deadline: '2026-10-31T06:15:00.000Z',
    tone: 'near',
    summary: 'Merges PR #23602 through normal gates.',
    conflict: false,
  },
  waiting: null,
  facts: [
    'Discloses that unpurged drafts expire after 7 days',
    'Closes the gate-3 legal consistency check',
  ],
  evidence: [
    {
      href: 'https://github.com/JovieInc/Jovie/pull/23602',
      label: 'PR #23602',
    },
    // ui-casing-allow: Linear issue identifier
    { href: 'https://linear.app/jovie/issue/JOV-9787', label: 'JOV-9787' },
  ],
};

export const DECISION_CARD_STORY_STATES = {
  Pending: { view: LAYOUT_VIEW, status: { kind: 'pending' } },
  NearDeadline: { view: LEGAL_VIEW, status: { kind: 'pending' } },
  Decided: {
    view: LAYOUT_VIEW,
    status: { kind: 'decided', decision: 'approve', by: 'founder' },
  },
  AutoShipped: {
    view: {
      ...LEGAL_VIEW,
      fallback: { ...LEGAL_VIEW.fallback!, relative: null, tone: 'due' },
    },
    status: { kind: 'decided', decision: 'approve', by: 'default' },
  },
  Error: {
    view: LAYOUT_VIEW,
    status: { kind: 'error', message: 'Not recorded. Retry.' },
  },
} as const satisfies Record<
  string,
  { readonly view: DecisionCardView; readonly status: DecisionCardStatus }
>;
