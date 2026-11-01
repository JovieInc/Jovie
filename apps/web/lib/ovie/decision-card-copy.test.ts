import { describe, expect, it } from 'vitest';
import {
  DECISION_CARD_COPY_LIMITS,
  decisionCardCopyErrors,
  defaultContradictsDecision,
  lintDecisionCardCopy,
} from './decision-card-copy';

const clean = {
  title: 'Price Artist Presence at $19/mo and $190/yr',
  recommendation: 'Approve: comparables sit at $19-25 and $12 payers keep $12.',
  defaultIfSilent: 'Applies the new price to new payers only.',
  defaultDecision: 'approve' as const,
  facts: [
    'Comparables: Feature.fm $19, Laylo Pro $25',
    'Existing $12 payers keep $12 for life',
  ],
};

const rules = (input: Parameters<typeof lintDecisionCardCopy>[0]) =>
  lintDecisionCardCopy(input).map(v => `${v.severity}:${v.rule}:${v.field}`);

describe('decision card copy lint', () => {
  it('passes a clean card', () => {
    expect(lintDecisionCardCopy(clean)).toEqual([]);
  });

  it('refuses emoji, assistant filler and hedges as errors', () => {
    expect(rules({ ...clean, title: 'Ship the pricing page 🚀' })).toContain(
      'error:emoji:title'
    );
    expect(
      rules({
        ...clean,
        recommendation: "Here's what I found: the copy is ready.",
      })
    ).toContain('error:filler:recommendation');
    expect(
      rules({ ...clean, facts: ['This could potentially lift conversion'] })
    ).toContain('error:hedge:facts');
    expect(rules({ ...clean, recommendation: 'I think we ship it.' })).toEqual([
      'error:filler:recommendation',
    ]);
  });

  it('refuses a default that says the opposite of what the deadline records', () => {
    // The live privacy/terms and pricing cards: text said "Ship"/"Apply" but
    // defaultDecision was omitted, so the deadline would have rejected.
    const live = {
      ...clean,
      defaultIfSilent: 'Ship at the 48h deadline: undraft and merge the PR.',
      defaultDecision: null,
    };
    expect(rules(live)).toContain(
      'error:default_contradiction:defaultIfSilent'
    );
    expect(
      rules({ ...clean, defaultIfSilent: 'Do nothing; keep $12.' })
    ).toContain('error:default_contradiction:defaultIfSilent');
    expect(defaultContradictsDecision('Ship it.', 'approve')).toBe(false);
    expect(defaultContradictsDecision('Ship it.', 'none')).toBe(false);
    expect(defaultContradictsDecision(null, 'reject')).toBe(false);
  });

  it('caps facts: at most three, one line each', () => {
    expect(rules({ ...clean, facts: ['a', 'b', 'c', 'd'] })).toContain(
      'error:too_many_facts:facts'
    );
    expect(
      rules({
        ...clean,
        facts: ['x'.repeat(DECISION_CARD_COPY_LIMITS.fact + 1)],
      })
    ).toContain('error:too_long:facts');
  });

  it('warns, but files, long lines, questions, label prefixes and absolute deadlines', () => {
    const warned = lintDecisionCardCopy({
      ...clean,
      title: `Taste JOV-1 @ abc1234: Should we ${'x'.repeat(80)}?`,
      defaultIfSilent: 'Applies on 2026-10-31 18:00 PT.',
    });
    expect(warned.map(v => `${v.severity}:${v.rule}`)).toEqual(
      expect.arrayContaining([
        'warn:too_long',
        'warn:question',
        'warn:label_prefix',
        'warn:absolute_deadline',
      ])
    );
    expect(decisionCardCopyErrors(warned)).toEqual([]);
  });

  it('does not flag ordinary words that contain a banned stem', () => {
    expect(
      lintDecisionCardCopy({
        ...clean,
        title: 'Approve the Maybelline brand deal',
        facts: ['Thinkific integration ships behind a flag'],
      })
    ).toEqual([]);
  });
});
