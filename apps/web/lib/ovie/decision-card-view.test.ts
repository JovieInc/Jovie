import { describe, expect, it } from 'vitest';
import { decisionCardView, evidenceLabel } from './decision-card-view';
import { type OvieInboxCase, summerCardFacts } from './inbox';

const NOW = Date.parse('2026-10-29T12:00:00Z');

const base: Pick<
  OvieInboxCase,
  | 'title'
  | 'recommendation'
  | 'facts'
  | 'evidence'
  | 'decisionDefault'
  | 'escalation'
> = {
  title: '  Ship the agent connector legal pages ',
  recommendation: 'Copy matches connector behavior.',
  facts: ['Discloses the 7-day draft expiry', 'Closes the gate-3 check'],
  evidence: [
    'https://github.com/JovieInc/Jovie/pull/23602',
    'https://github.com/JovieInc/Jovie/pull/23602.diff',
    'https://linear.app/jovie/issue/JOV-9787/legal-pages',
    'https://example.com/a',
    'not-a-url',
  ],
  decisionDefault: {
    contract: 'jovie.decision-default/v1',
    decision: 'approve',
    summary: 'Merges the PR through normal gates.',
    deadline: '2026-10-30T19:00:00Z',
    declared: true,
  },
  escalation: null,
};

describe('decisionCardView', () => {
  it('projects the decision, relative default, facts and labelled evidence', () => {
    const view = decisionCardView(base, NOW);
    expect(view.decision).toBe('Ship the agent connector legal pages');
    expect(view.fallback).toMatchObject({
      decision: 'approve',
      relative: 'in 31h',
      tone: 'calm',
      summary: 'Merges the PR through normal gates.',
      conflict: false,
    });
    expect(view.facts).toEqual(base.facts);
    expect(view.evidence.map(item => item.label)).toEqual([
      'PR #23602',
      'PR #23602 diff',
      'JOV-9787',
    ]);
  });

  it('marks near and due deadlines', () => {
    const near = decisionCardView(
      {
        ...base,
        decisionDefault: {
          ...base.decisionDefault!,
          deadline: '2026-10-29T13:30:00Z',
        },
      },
      NOW
    );
    expect(near.fallback).toMatchObject({ tone: 'near', relative: 'in 2h' });
    const due = decisionCardView(
      {
        ...base,
        decisionDefault: {
          ...base.decisionDefault!,
          deadline: '2026-10-29T11:00:00Z',
        },
      },
      NOW
    );
    expect(due.fallback).toMatchObject({ tone: 'due', relative: null });
  });

  it.each([
    ['reject', 'Ship at the 48h deadline.'],
    ['approve', 'Do nothing at the deadline.'],
  ] as const)(
    'hides text contradicting the recorded %s default',
    (decision, summary) => {
      const view = decisionCardView(
        {
          ...base,
          decisionDefault: {
            ...base.decisionDefault!,
            decision,
            summary,
          },
        },
        NOW
      );
      expect(view.fallback).toMatchObject({
        decision,
        conflict: true,
        summary: null,
      });
    }
  );

  it('hides an undeclared conservative default summary and falls back to the recommendation', () => {
    const view = decisionCardView(
      {
        ...base,
        facts: [],
        decisionDefault: { ...base.decisionDefault!, declared: false },
      },
      NOW
    );
    expect(view.fallback?.summary).toBeNull();
    expect(view.facts).toEqual(['Copy matches connector behavior.']);
  });

  it('shows waiting time for no-default cards', () => {
    const view = decisionCardView(
      {
        ...base,
        decisionDefault: null,
        escalation: { level: 1, waitingHours: 26 },
      },
      NOW
    );
    expect(view.fallback).toBeNull();
    expect(view.waiting).toEqual({ hours: 26, level: 1 });
  });
});

describe('evidenceLabel', () => {
  it('labels known hosts and visual QA captures', () => {
    expect(evidenceLabel('https://github.com/JovieInc/Jovie/issues/9')).toBe(
      'Issue #9'
    );
    expect(evidenceLabel('https://www.jov.ie/pricing')).toBe('jov.ie');
    expect(evidenceLabel('/api/admin/hud/visual-qa/run/surface/after')).toBe(
      'After'
    );
    expect(evidenceLabel('::')).toBe('Evidence');
  });
});

describe('summerCardFacts', () => {
  it('puts money and audience first, then filed facts, capped at three', () => {
    expect(
      summerCardFacts({
        amountUsd: 400,
        recipient: 'claimed artists',
        facts: ['One', 'Two'],
        recommendation: 'Unused',
      })
    ).toEqual(['Spend: $400.00', 'To: claimed artists', 'One']);
    expect(
      summerCardFacts({
        amountUsd: null,
        recipient: null,
        facts: [],
        recommendation: 'Use the recommendation',
      })
    ).toEqual(['Use the recommendation']);
  });
});
