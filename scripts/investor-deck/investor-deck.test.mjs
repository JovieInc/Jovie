import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  buildLedgerYcDeck,
  claimNumbers,
  isRetiredClaim,
  YC_DECK_SECTION_IDS,
} from '../../apps/web/lib/investors/yc-deck.ts';
import { ANCHOR, HOLDOUTS } from './calibration.mjs';
import { checkConsistency, retiredValues } from './consistency.mjs';
import { calibrationHolds, investRoute, judgeDeck } from './eval.mjs';
import { gateDecision } from './gate.mjs';
import { PERSONA_LABEL, PERSONAS } from './personas.mjs';
import { DECK_CSS, renderDeckHtml, tokenCss } from './render.mjs';
import { aggregateInvest, parseInvestSample } from './rubric.mjs';

const LEDGER = {
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

const slide = (id, title, cite = [], extra = {}) => ({
  id,
  title,
  cite,
  ...extra,
});
const spine = YC_DECK_SECTION_IDS.map(id => slide(id, `The ${id} slide.`));

test('a complete spine with cited numbers builds clean', () => {
  const story = {
    schema: 's',
    program: 'p',
    title: 'T',
    slides: [
      ...spine.slice(0, 6),
      slide('ask', 'The deal funds about 23 months.', ['runway'], {
        support: ['$500K for 10% on a SAFE.'],
      }),
    ],
  };
  // "10%" is not cited: that must fail.
  const { issues } = buildLedgerYcDeck(story, LEDGER);
  assert.deepEqual(issues, [
    'slide ask: "10%" is not covered by a cited claim or metric',
  ]);
});

test('uncited numbers, retired claims, dashes, order and missing spine all fail', () => {
  const story = {
    schema: 's',
    program: 'p',
    title: 'T',
    slides: [
      slide('traction', 'We have $0 MRR.', ['m:mrr']),
      slide('problem', 'Artists lose 70M plays — badly.', ['dropped']),
      slide('team', 'I have done this for 15 years.', [
        'founder',
        'old_runway',
      ]),
    ],
  };
  const { issues } = buildLedgerYcDeck(story, LEDGER);
  assert.ok(issues.some(i => i.includes('claim dropped is retired')));
  assert.ok(
    issues.some(i =>
      i.includes('claim old_runway is retired (superseded by runway)')
    )
  );
  assert.ok(issues.some(i => i.includes('em/en dash')));
  assert.ok(issues.some(i => i.includes('"70m" is not covered')));
  assert.ok(issues.some(i => i.includes('missing YC section solution')));
  assert.ok(issues.some(i => i.includes('out of order')));
});

test('claim numbers include years and view counts', () => {
  assert.deepEqual(claimNumbers('3.6M views since 2014, $21.4K a month'), [
    '3.6m',
    '2014',
    '$21.4k',
  ]);
  assert.equal(isRetiredClaim(LEDGER.claims.dropped), true);
});

test('consistency flags retired values and family mismatches with drafts', () => {
  assert.equal(retiredValues(LEDGER).get('29 months'), 'old_runway');
  const result = checkConsistency({
    deckText: '$500K funds 29 months. $21.7K a month.',
    drafts: { 'YC.md': '$500K funds about 23 months at about $21.4K a month.' },
    ledger: LEDGER,
  });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some(i => i.includes('retired claim old_runway')));
  assert.ok(
    result.issues.some(i => i.startsWith('runway-months: deck says 29'))
  );
  assert.ok(
    result.issues.some(i => i.startsWith('monthly-burn: deck says 21.7k'))
  );
  assert.equal(
    checkConsistency({
      deckText: '23 months',
      drafts: { a: 'about 23 months' },
      ledger: LEDGER,
    }).ok,
    true
  );
});

test('renderer uses only DS token variables, never raw colours', () => {
  assert.doesNotMatch(DECK_CSS, /#[0-9a-f]{3,8}\b|rgba?\(|oklch\(|hsl\(/iu);
  const tokens = JSON.parse(
    readFileSync(new URL('../../design.tokens.json', import.meta.url), 'utf8')
  );
  assert.match(tokenCss(tokens), /--ds-surface-canvas: #/u);
  const html = renderDeckHtml(
    [
      {
        id: 'cover',
        kicker: 'K',
        dominantSentence: 'D <b>',
        support: [],
        stats: [],
        table: null,
        note: null,
        sources: [],
      },
    ],
    { title: 'T', tokens }
  );
  assert.match(html, /D &lt;b&gt;/u);
});

test('personas are labeled simulations built from public sources', () => {
  assert.equal(PERSONAS.length, 6);
  assert.match(PERSONA_LABEL, /SIMULATION/u);
  for (const p of PERSONAS) assert.ok(p.modelledOn && p.brief && p.program);
  assert.equal(HOLDOUTS.length >= 3, true);
  assert.ok(ANCHOR.deck.length > 200);
});

test('route is Workers AI only, never a subscription CLI', () => {
  const route = investRoute();
  assert.match(route.baseUrl, /workers\.dev/u);
  assert.throws(
    () =>
      investRoute({
        callers: [
          { id: 'dev.investor-eval', route: 'gateway-first', models: ['m'] },
        ],
        providers: {},
      }),
    /workers-ai-only/u
  );
});

const sample = (p, extra = {}) => ({
  objections: [{ text: 'no revenue', kind: 'traction', slide: 'traction' }],
  for: ['founder'],
  p_invest: p,
  verdict: p >= 0.5 ? 'invest' : 'pass',
  most_fixable: { objection: 'market', fix: 'bottom-up', kind: 'story' },
  ...extra,
});

test('samples must be coherent; aggregation needs median and floor', () => {
  const mismatch = parseInvestSample(sample(0.2, { verdict: 'invest' }));
  assert.equal(mismatch.verdict, 'pass');
  assert.equal(mismatch.verdictMismatch, true);
  assert.throws(() => parseInvestSample(sample(1.4)), /out of range/u);
  const yes = aggregateInvest(
    [0.6, 0.55, 0.7].map(p => parseInvestSample(sample(p)))
  );
  assert.equal(yes.verdict, 'invest');
  const lowFloor = aggregateInvest(
    [0.6, 0.55, 0.2].map(p => parseInvestSample(sample(p)))
  );
  assert.equal(lowFloor.verdict, 'pass');
  assert.equal(
    aggregateInvest([parseInvestSample(sample(0.9))]).verdict,
    'abstain'
  );
});

test('a relay failure abstains, it never yields invest', async () => {
  const result = await judgeDeck({
    persona: PERSONAS[0],
    deck: 'SLIDE 1',
    samples: 3,
    route: { model: 'm', baseUrl: 'https://x.workers.dev/v1' },
    call: async () => {
      throw new Error('workers-ai relay 502');
    },
  });
  assert.equal(result.verdict, 'abstain');
  assert.equal(result.failures.length, 3);
});

test('calibration and gate fail closed', () => {
  assert.equal(
    calibrationHolds([
      { kind: 'holdout', deck: 'h', persona: 'a', verdict: 'invest' },
      { kind: 'anchor', deck: 'a', persona: 'a', verdict: 'invest' },
    ]).ok,
    false
  );
  const build = { deckSha256: 'abc', issues: [] };
  const evalReport = {
    deckSha256: 'abc',
    calibration: { ok: true, holdoutYes: [], anchorYes: 4, anchorTotal: 6 },
    personas: Array.from({ length: 6 }, (_, i) => ({
      verdict: i < 4 ? 'invest' : 'pass',
    })),
    yes: 4,
    at: new Date().toISOString(),
  };
  assert.deepEqual(gateDecision({ build, evalReport }), {
    open: true,
    reasons: [],
  });
  assert.equal(
    gateDecision({ build: { ...build, deckSha256: 'zzz' }, evalReport }).open,
    false
  );
  assert.equal(
    gateDecision({ build, evalReport: { ...evalReport, yes: 3 } }).open,
    false
  );
  assert.equal(
    gateDecision({ build, evalReport: { ...evalReport, calibration: null } })
      .open,
    false
  );
  assert.equal(gateDecision({ build, evalReport: null }).open, false);
});
