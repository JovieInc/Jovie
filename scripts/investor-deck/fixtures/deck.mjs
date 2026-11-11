import { YC_DECK_SECTION_IDS } from '../../../apps/web/lib/investors/yc-deck.ts';
import { ANCHOR, HOLDOUTS } from '../calibration.mjs';
import { calibrationHolds } from '../eval.mjs';
import { PERSONAS } from '../personas.mjs';

export const LEDGER = {
  claims: {
    runway: {
      claim: '$500K funds about 23 months',
      values: ['$500K', '23 months'],
      source: 'plan',
      status: 'derived',
    },
    old_runway: {
      claim: 'old plan',
      values: ['29 months'],
      source: 'old',
      status: 'derived',
      superseded_by: 'runway',
    },
    dropped: {
      claim: '70M+ streams (DROPPED from all text 2026-10-31)',
      values: ['70M'],
      source: 'x',
      status: 'attested',
      attested_by: 'Tim',
    },
    founder: {
      claim: '15 years',
      values: ['15 years'],
      status: 'attested',
      attested_by: 'Tim',
    },
  },
  metrics: {
    mrr: {
      value: 0,
      render: '$0',
      source: 'stripe',
      as_of: '2026-10-31T22:47Z',
    },
  },
  facts: {},
};

export const slide = (id, title, cite = [], extra = {}) => ({
  id,
  title,
  cite,
  ...extra,
});
export const spine = YC_DECK_SECTION_IDS.map(id =>
  slide(id, `The ${id} slide.`)
);

export const sample = (p, extra = {}) => ({
  objections: [{ text: 'no revenue', kind: 'traction', slide: 'traction' }],
  for: ['founder'],
  p_invest: p,
  verdict: p >= 0.5 ? 'invest' : 'pass',
  most_fixable: { objection: 'market', fix: 'bottom-up', kind: 'story' },
  ...extra,
});

export function passingGateInput() {
  const calibrationRows = PERSONAS.flatMap(({ id: persona }) => [
    { persona, deck: ANCHOR.id, kind: 'anchor', verdict: 'pass', p: 0.3 },
    ...HOLDOUTS.map(({ id: deck }) => ({
      persona,
      deck,
      kind: 'holdout',
      verdict: 'pass',
      p: 0.1,
    })),
  ]);
  return {
    now: Date.parse('2026-11-05T21:00:00Z'),
    build: {
      deckSha256: 'synthetic',
      deckTextSha256: 'synthetic-text',
      issues: [],
    },
    evalReport: {
      deckSha256: 'synthetic',
      deckTextSha256: 'synthetic-text',
      calibrationRows,
      calibration: calibrationHolds(calibrationRows),
      personas: PERSONAS.map(({ id: persona }, i) => ({
        persona,
        verdict: 'pass',
        p: i < 4 ? 0.4 : 0.2,
        relative: i < 4 ? 'invest' : 'pass',
      })),
      yes: 4,
      at: '2026-11-05T21:00:00Z',
    },
  };
}
