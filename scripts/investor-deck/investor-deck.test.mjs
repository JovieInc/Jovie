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
} from '../../apps/web/lib/investors/yc-deck.ts';
import { exportPdf, loadLedger } from './build.mjs';
import { checkConsistency, retiredValues } from './consistency.mjs';
import { LEDGER, slide, spine } from './fixtures/deck.mjs';
import { DECK_CSS, renderDeckHtml, tokenCss } from './render.mjs';

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
