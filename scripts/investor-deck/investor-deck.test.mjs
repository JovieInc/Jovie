import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import {
  buildLedgerYcDeck,
  claimNumbers,
  isRetiredClaim,
  YC_DECK_SECTION_IDS,
} from '../../apps/web/lib/investors/yc-deck.ts';
import { callRelay } from '../output-quality/judge-core.mjs';
import { exportPdf, loadLedger } from './build.mjs';
import { ANCHOR, HOLDOUTS } from './calibration.mjs';
import { checkConsistency, retiredValues } from './consistency.mjs';
import {
  calibrationHolds,
  investContaminated,
  investRoute,
  judgeDeck,
  relativeVerdicts,
} from './eval.mjs';
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

test('calibration needs all holdouts below the anchor for at least five personas', () => {
  const { evalReport } = passingGateInput();
  const rows = evalReport.calibrationRows;
  rows.find(r => r.persona === PERSONAS[2].id && r.deck === HOLDOUTS[0].id).p =
    0.4;
  const cal = calibrationHolds(rows);
  assert.equal(cal.ok, true);
  assert.deepEqual(cal.unseparated, [PERSONAS[2].id]);
  const scored = relativeVerdicts(
    [
      { persona: PERSONAS[0].id, p: 0.35 },
      { persona: PERSONAS[1].id, p: 0.2 },
      { persona: PERSONAS[2].id, p: 0.9 },
    ],
    cal
  );
  assert.deepEqual(
    scored.map(s => s.relative),
    ['invest', 'pass', 'unscored']
  );
  rows.find(r => r.persona === PERSONAS[1].id && r.deck === ANCHOR.id).verdict =
    'abstain';
  assert.equal(calibrationHolds(rows).ok, false);
});

test('gate fails closed', () => {
  const { build, evalReport, now } = passingGateInput();
  assert.deepEqual(gateDecision({ build, evalReport, now }), {
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
  assert.match(
    gateDecision({
      build,
      evalReport: {
        ...evalReport,
        calibration: { ok: false, unseparated: ['x', 'y'] },
      },
    }).reasons.join(),
    /calibration failed/u
  );
  assert.equal(gateDecision({ build, evalReport: null }).open, false);
});

test('investor contamination ignores ordinary investor words', () => {
  assert.deepEqual(
    investContaminated({ t: 'ICP is unclear this summer' }, 'prompt'),
    []
  );
  assert.deepEqual(investContaminated({ t: 'like Ovie' }, 'prompt'), ['ovie']);
});

function passingGateInput() {
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

test('consistency requires nonempty draft prose and support for every deck quantity', () => {
  for (const drafts of [
    {},
    { a: '' },
    { a: '> source only' },
    { a: 'Synthetic narrative without runway.' },
  ]) {
    const result = checkConsistency({
      deckText: '23 months',
      drafts,
      ledger: LEDGER,
    });
    assert.equal(result.ok, false, JSON.stringify(drafts));
  }
});

test('percentage raise phrases are compared at punctuation and end of text', () => {
  for (const suffix of ['', '.', ', with support', ' next year']) {
    const result = checkConsistency({
      deckText: `$750K for 10%${suffix}`,
      drafts: { a: '$500K for 10%' },
      ledger: LEDGER,
    });
    assert.equal(result.ok, false);
    assert.deepEqual(result.families.raise, {
      deck: ['750k'],
      drafts: ['500k'],
    });
  }
  assert.equal(
    checkConsistency({
      deckText: '$500K for 10%',
      drafts: { a: '$500K for 10%' },
      ledger: LEDGER,
    }).ok,
    true
  );
});

test('ledger loading refuses a missing or empty application draft set', t => {
  const dir = mkdtempSync(join(tmpdir(), 'investor-ledger-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const registry = join(dir, 'registry');
  mkdirSync(registry);
  for (const name of ['claims.yaml', 'metrics.yaml', 'deck.yaml'])
    writeFileSync(join(registry, name), '{}');
  assert.throws(() => loadLedger(registry), /draft/iu);
  mkdirSync(join(dir, 'drafts'));
  assert.throws(() => loadLedger(registry), /draft/iu);
  writeFileSync(
    join(dir, 'drafts', 'YC-synthetic.md'),
    'Synthetic company narrative.'
  );
  assert.equal(Object.keys(loadLedger(registry).drafts).length, 1);
});

test('gate rejects noninteger or out-of-range thresholds', () => {
  const input = passingGateInput();
  assert.equal(gateDecision(input).open, true);
  for (const threshold of [NaN, Infinity, -1, 0, 1.5, 7, '4', null]) {
    assert.equal(
      gateDecision({ ...input, threshold: /** @type {number} */ (threshold) })
        .open,
      false,
      String(threshold)
    );
  }
});

test('gate requires a valid vote count that agrees with the six persona results', () => {
  const input = passingGateInput();
  for (const yes of [undefined, NaN, Infinity, -1, 1.5, 7, '4', 6]) {
    assert.equal(
      gateDecision({ ...input, evalReport: { ...input.evalReport, yes } }).open,
      false,
      String(yes)
    );
  }
  for (const personas of [
    undefined,
    [],
    {},
    Array(6).fill(input.evalReport.personas[0]),
  ]) {
    assert.equal(
      gateDecision({ ...input, evalReport: { ...input.evalReport, personas } })
        .open,
      false
    );
  }
});

test('gate rejects malformed build/calibration receipts and future evaluations without throwing', () => {
  const input = passingGateInput();
  for (const build of [
    {},
    { deckSha256: 'synthetic' },
    { issues: [], deckSha256: '' },
  ]) {
    assert.equal(gateDecision({ ...input, build }).open, false);
  }
  for (const calibration of [{ ok: 'yes' }, { ok: false }, {}]) {
    assert.equal(
      gateDecision({
        ...input,
        evalReport: { ...input.evalReport, calibration },
      }).open,
      false
    );
  }
  for (const at of ['invalid', '2026-11-06T21:00:00Z']) {
    assert.equal(
      gateDecision({ ...input, evalReport: { ...input.evalReport, at } }).open,
      false
    );
  }
});

test('calibration requires every expected persona and every distinct holdout', () => {
  const { evalReport } = passingGateInput();
  assert.equal(calibrationHolds(evalReport.calibrationRows).ok, true);
  const onePersona = evalReport.calibrationRows.filter(
    r => r.persona === PERSONAS[0].id
  );
  assert.equal(calibrationHolds(onePersona).ok, false);
  const noThirdHoldout = evalReport.calibrationRows.filter(
    r => r.deck !== HOLDOUTS[2].id
  );
  assert.equal(calibrationHolds(noThirdHoldout).ok, false);
  const duplicated = noThirdHoldout.concat(
    noThirdHoldout.filter(r => r.deck === HOLDOUTS[0].id)
  );
  assert.equal(calibrationHolds(duplicated).ok, false);
});

test('PDF export resolves and escapes relative output paths and closes the browser', async () => {
  let url;
  let closed = 0;
  const page = {
    goto: async value => {
      url = value;
    },
    evaluate: async () => {},
    pdf: async () => {},
    $$: async () => [],
    $$eval: async () => [],
  };
  const chromium = {
    launch: async () => ({
      newPage: async () => page,
      close: async () => {
        closed++;
      },
    }),
  };
  await exportPdf('synthetic out/#deck.html', 'synthetic out', 0, chromium);
  assert.equal(url, pathToFileURL(resolve('synthetic out/#deck.html')).href);
  assert.equal(closed, 1);
  page.goto = async () => {
    throw new Error('synthetic navigation error');
  };
  await assert.rejects(
    exportPdf('out/deck.html', 'out', 0, chromium),
    /synthetic navigation/u
  );
  assert.equal(closed, 2);
});

test('investor samples use maintained shared transport policy and investor-specific contamination', async () => {
  const requests = [];
  const options = [];
  /** @type {typeof import('../../packages/api-client/client.ts').createApiClient} */
  const createClient = option => {
    options.push(option);
    return {
      provider: option.provider,
      credential: option.credential,
      state: async () => null,
      request: async request => {
        requests.push(request);
        return {
          status: 200,
          headers: new Headers(),
          text: '',
          fromCache: null,
          attempts: 1,
          json: () =>
            JSON.parse(
              JSON.stringify({
                choices: [
                  {
                    message: {
                      content: JSON.stringify(
                        sample(0.6, { for: ['ICP is clear this summer'] })
                      ),
                    },
                  },
                ],
                usage: {},
              })
            ),
        };
      },
    };
  };
  const result = await judgeDeck({
    persona: PERSONAS[0],
    deck: 'Synthetic company.',
    samples: 3,
    route: {
      model: 'synthetic-model',
      baseUrl: 'https://synthetic.invalid/v1',
    },
    call: args =>
      callRelay({
        ...args,
        env: { WORKERS_AI_TOKEN: 'synthetic-test-credential' },
        createClient,
      }),
  });
  assert.equal(result.samples, 3);
  assert.equal(result.verdict, 'invest');
  assert.deepEqual(result.failures, []);
  assert.equal(requests.length, 3);
  assert.ok(options.every(option => option.provider === 'cloudflare'));
  for (const request of requests) {
    assert.equal(request.url, 'https://synthetic.invalid/v1/chat/completions');
    assert.equal(request.body.model, 'synthetic-model');
    assert.equal(request.body.max_tokens, 16000);
    assert.equal(request.maxAttempts, 2);
    assert.equal(request.priority, 'default');
  }
});

test('invalid sample counts are rejected before the transport is called', async () => {
  let calls = 0;
  for (const samples of [NaN, Infinity, 0, -1, 1.5]) {
    await assert.rejects(
      judgeDeck({
        persona: PERSONAS[0],
        deck: 'Synthetic',
        samples,
        call: async () => {
          calls++;
          throw new Error('unexpected transport call');
        },
      }),
      /positive integer/u
    );
  }
  assert.equal(calls, 0);
});

test('calibration rejects unknown fixtures even when kind is absent', () => {
  const { evalReport } = passingGateInput();
  for (const replaced of [HOLDOUTS[2].id, ANCHOR.id]) {
    const rows = evalReport.calibrationRows.map(row => {
      if (row.deck !== replaced) return row;
      const { kind, ...rest } = row;
      return { ...rest, deck: 'unknown-fixture' };
    });
    assert.equal(calibrationHolds(rows).ok, false);
  }
});

test('deck binding rejects changed rendered HTML or evaluation text at the gate CLI', t => {
  const dir = mkdtempSync(join(tmpdir(), 'investor-binding-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const { build, evalReport } = passingGateInput();
  const html = '<p>Synthetic investor deck</p>';
  const text = 'Synthetic investor deck';
  const digest = value => createHash('sha256').update(value).digest('hex');
  build.deckSha256 = evalReport.deckSha256 = digest(html);
  build.deckTextSha256 = evalReport.deckTextSha256 = digest(text);
  evalReport.at = new Date().toISOString();
  writeFileSync(join(dir, 'build.json'), JSON.stringify(build));
  writeFileSync(join(dir, 'invest-eval.json'), JSON.stringify(evalReport));
  writeFileSync(join(dir, 'deck.html'), html);
  writeFileSync(join(dir, 'deck.txt'), text);
  const run = () =>
    spawnSync(
      process.execPath,
      [new URL('./gate.mjs', import.meta.url).pathname, '--deck', dir],
      { encoding: 'utf8' }
    );
  assert.equal(run().status, 0);
  writeFileSync(join(dir, 'deck.txt'), 'Different synthetic evaluation text');
  assert.equal(run().status, 1);
  const evaluation = spawnSync(
    process.execPath,
    [new URL('./eval.mjs', import.meta.url).pathname, '--deck', dir],
    { encoding: 'utf8', env: {} }
  );
  assert.equal(evaluation.status, 1);
  assert.match(evaluation.stderr, /evaluation text does not match/u);
  writeFileSync(join(dir, 'deck.txt'), text);
  writeFileSync(
    join(dir, 'deck.html'),
    '<p>Different synthetic rendered deck</p>'
  );
  assert.equal(run().status, 1);
});

test('synthetic build CLI emits artifact hashes and rejects an empty draft directory', t => {
  const dir = mkdtempSync(join(tmpdir(), 'investor-build-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const registry = join(dir, 'registry');
  const drafts = join(dir, 'drafts');
  const out = join(dir, 'out');
  mkdirSync(registry);
  mkdirSync(drafts);
  writeFileSync(join(registry, 'claims.yaml'), JSON.stringify({ claims: {} }));
  writeFileSync(
    join(registry, 'metrics.yaml'),
    JSON.stringify({ metrics: {}, facts: {} })
  );
  writeFileSync(
    join(registry, 'deck.yaml'),
    JSON.stringify({
      schema: 'synthetic',
      program: 'synthetic',
      title: 'Synthetic company',
      slides: spine,
    })
  );
  const run = () =>
    spawnSync(
      process.execPath,
      [
        new URL('./build.mjs', import.meta.url).pathname,
        '--ledger',
        registry,
        '--out',
        out,
        '--no-pdf',
        '--json',
      ],
      { encoding: 'utf8' }
    );
  assert.equal(run().status, 1);
  writeFileSync(
    join(drafts, 'YC-synthetic.md'),
    'Synthetic company narrative.'
  );
  const built = run();
  assert.equal(built.status, 0, built.stderr || built.stdout);
  const receipt = JSON.parse(built.stdout);
  const digest = path =>
    createHash('sha256').update(readFileSync(path)).digest('hex');
  assert.equal(receipt.deckSha256, digest(join(out, 'deck.html')));
  assert.equal(receipt.deckTextSha256, digest(join(out, 'deck.txt')));
  assert.deepEqual(receipt.issues, []);
});

test('investor orchestration caps concurrent personas and fixtures at eight', async () => {
  let active = 0;
  let peak = 0;
  /** @type {() => void} */
  let release = () => assert.fail('fixture barrier not initialized');
  const barrier = new Promise(resolve => {
    release = () => resolve(undefined);
  });
  const call = async () => {
    active += 1;
    peak = Math.max(peak, active);
    try {
      await barrier;
      return { text: JSON.stringify(sample(0.8)), usage: {} };
    } finally {
      active -= 1;
    }
  };
  const jobs = PERSONAS.slice(0, 2).map(persona =>
    judgeDeck({
      persona,
      deck: 'synthetic concurrency fixture',
      samples: 9,
      call,
      route: { model: 'fixture', baseUrl: 'https://fixture.invalid' },
    })
  );
  try {
    assert.equal(active, 8);
  } finally {
    release();
    await Promise.all(jobs);
  }
  assert.equal(peak, 8);
  assert.equal(active, 0);
});

test('pool hands a reserved slot to its waiter before a reentrant arrival', async () => {
  const { pooled, MAX_IN_FLIGHT } = await import('./eval.mjs');
  const releases = [];
  let active = 0;
  let peak = 0;
  const enter = () =>
    pooled(() => {
      active += 1;
      peak = Math.max(peak, active);
      return new Promise(resolve =>
        releases.push(() => {
          active -= 1;
          resolve();
        })
      );
    });
  const jobs = Array.from({ length: MAX_IN_FLIGHT + 1 }, enter);
  releases.shift()();
  await new Promise(resolve =>
    queueMicrotask(() => {
      jobs.push(enter());
      resolve();
    })
  );
  while (releases.length) {
    releases.splice(0).forEach(release => release());
    await new Promise(resolve => setImmediate(resolve));
  }
  await Promise.all(jobs);
  assert.equal(peak, MAX_IN_FLIGHT);
  assert.equal(active, 0);
  await assert.rejects(
    pooled(() => {
      throw new Error('sync fixture');
    }),
    /sync fixture/
  );
  await assert.rejects(
    pooled(async () => {
      throw new Error('async fixture');
    }),
    /async fixture/
  );
  assert.equal(await pooled(() => 42), 42);
});
