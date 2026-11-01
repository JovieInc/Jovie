import { describe, expect, it } from 'vitest';
import {
  buildLedgerYcDeck,
  claimNumbers,
  type FundraisingLedger,
  isRetiredClaim,
  type LedgerDeckStorySlide,
  normalizeClaimNumber,
  YC_DECK_SECTION_IDS,
} from '@/lib/investors/yc-deck';

const ledger: FundraisingLedger = {
  claims: {
    runway: {
      claim: '$500K funds about 23 months',
      values: ['$500K', '23 months'],
      source: 'financial plan',
      as_of: '2026-10-31',
      status: 'derived',
    },
    old_runway: {
      claim: 'old plan',
      values: ['29 months'],
      source: 'engine',
      status: 'derived',
      superseded_by: 'runway',
    },
    dropped: {
      claim: '70M+ streams (DROPPED from all text 2026-10-31)',
      values: ['70M'],
      source: 'bio',
      status: 'attested',
      attested_by: 'Tim',
    },
    founder: {
      claim: 'Musician for 15 years',
      values: ['15 years'],
      status: 'attested',
      attested_by: 'Tim',
    },
    unattested: { claim: 'x', values: [], status: 'attested' },
    unsourced: { claim: 'y', values: [], status: 'verified' },
  },
  metrics: {
    mrr: {
      value: 0,
      render: '$0',
      source: 'stripe',
      as_of: '2026-10-31T22:47Z',
    },
    nosource: { value: 3 },
  },
  facts: {
    blank: { status: 'unknown' },
    handle: { value: '@itstimwhite', source: 'gmail', status: 'verified' },
  },
};

const slide = (
  id: string,
  title: string,
  cite: string[] = [],
  extra: Partial<LedgerDeckStorySlide> = {}
): LedgerDeckStorySlide => ({ id, title, cite, ...extra });

const spine = () => YC_DECK_SECTION_IDS.map(id => slide(id, `The ${id}.`));

describe('buildLedgerYcDeck', () => {
  it('builds the YC spine with cited numbers, stats, tables and sources', () => {
    const slides = spine();
    slides[2] = slide('traction', 'Nobody pays yet.', ['m:mrr'], {
      stats: [{ value: '$0', label: 'MRR' }],
    });
    slides[6] = slide('ask', 'The deal funds about 23 months.', ['runway'], {
      kicker: 'The ask',
      table: { head: ['Raise'], rows: [['$500K']] },
      note: 'Zero revenue assumed.',
    });
    const result = buildLedgerYcDeck(
      {
        schema: 's',
        program: 'p',
        title: 'T',
        slides: [slide('cover', 'Jovie', ['f:handle']), ...slides],
      },
      ledger
    );
    expect(result.issues).toEqual([]);
    expect(result.slides.map(s => s.id)).toEqual([
      'cover',
      ...YC_DECK_SECTION_IDS,
    ]);
    const ask = result.slides.at(-1);
    expect(ask?.sources).toEqual([
      { ref: 'runway', asOf: '2026-10-31', status: 'derived' },
    ]);
    expect(ask?.kicker).toBe('The ask');
    expect(result.slides[3]?.sources[0]?.status).toBe('metric');
  });

  it('fails uncited numbers, retired or unsourced refs, dashes and bad structure', () => {
    const { issues } = buildLedgerYcDeck(
      {
        schema: 's',
        program: 'p',
        title: 'T',
        slides: [
          slide('traction', 'We have $0 MRR and 10% growth.', ['m:mrr']),
          slide('problem', 'Artists lose 70M plays — badly.', ['dropped']),
          slide('team', 'I have done this for 15 years', [
            'founder',
            'old_runway',
            'unattested',
            'unsourced',
            'missing',
            'm:nosource',
            'm:absent',
            'f:blank',
          ]),
          slide('team', 'Again.'),
          slide('mystery', 'Unknown.'),
        ],
      },
      ledger
    );
    const text = issues.join('\n');
    expect(text).toContain('"10%" is not covered');
    expect(text).toContain('claim dropped is retired');
    expect(text).toContain(
      'claim old_runway is retired (superseded by runway)'
    );
    expect(text).toContain('claim unattested is attested without attested_by');
    expect(text).toContain('claim unsourced has no source');
    expect(text).toContain('unknown claim missing');
    expect(text).toContain('m:nosource has no source');
    expect(text).toContain('unknown metric absent');
    expect(text).toContain('f:blank has no value');
    expect(text).toContain('em/en dash');
    expect(text).toContain(
      'slide team: the dominant sentence must be a full sentence'
    );
    expect(text).toContain('slide team: duplicate slide id');
    expect(text).toContain('slide mystery: unknown slide id');
    expect(text).toContain('missing YC section solution');
    expect(text).toContain('YC sections out of order');
  });
});

describe('claim number helpers', () => {
  it('normalizes and extracts claim-like numbers', () => {
    expect(claimNumbers('3.6M views since 2014, $21.4K a month')).toEqual([
      '3.6m',
      '2014',
      '$21.4k',
    ]);
    expect(normalizeClaimNumber('$12/mo')).toBe('$12');
    expect(isRetiredClaim({ claim: 'SUPERSEDED, not used' })).toBe(true);
    expect(isRetiredClaim({ claim: 'live' })).toBe(false);
  });
});
