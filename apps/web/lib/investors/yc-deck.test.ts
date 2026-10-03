import { describe, expect, it } from 'vitest';
import { fundraisingRegistry } from '@/lib/investors/fundraising-registry';
import {
  type SourcedInvestorStat,
  selectInvestorFacingStats,
} from '@/lib/investors/sourced-metrics';
import {
  buildInvestorYcDeck,
  YC_DECK_SECTION_IDS,
} from '@/lib/investors/yc-deck';

const committed: SourcedInvestorStat = {
  id: 'raise_committed_usd',
  label: 'Committed',
  value: '25000',
  unit: 'usd',
  sourceKind: 'stripe',
  sourceLabel: 'Stripe',
  observedAt: '2026-10-02',
};

describe('buildInvestorYcDeck', () => {
  it('uses the YC section order and leaves traction empty without sourced stats', () => {
    const sections = buildInvestorYcDeck(fundraisingRegistry, {
      asOf: null,
      stats: [],
    });

    expect(sections.map(section => section.id)).toEqual([
      ...YC_DECK_SECTION_IDS,
    ]);
    const traction = sections.find(section => section.id === 'traction');
    expect(traction?.support).toEqual([]);
    expect(traction?.dominantSentence).toMatch(/does not claim/u);
    expect(JSON.stringify(sections)).not.toMatch(/\$|90M|25K/u);
  });

  it('puts only sourced stats on the traction section', () => {
    const sections = buildInvestorYcDeck(
      fundraisingRegistry,
      selectInvestorFacingStats([
        committed,
        {
          ...committed,
          sourceKind: 'note' as SourcedInvestorStat['sourceKind'],
        },
      ])
    );
    const traction = sections.find(section => section.id === 'traction');

    expect(traction?.dominantSentence).toBe(
      'Sourced company metrics as of 2026-10-02.'
    );
    expect(traction?.support).toEqual([
      'Committed: 25000 usd (stripe, Stripe, observed 2026-10-02).',
    ]);
  });
});
