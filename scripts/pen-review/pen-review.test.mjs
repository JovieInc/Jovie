import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { parseJudgeReply, personaPrompt, textInventory } from './judges.mjs';
import {
  contrastRatio,
  nearMissAxes,
  parseHex,
  runChecks,
  solidFill,
} from './lib.mjs';
import {
  acquireLease,
  decideRound,
  foreignUnsaved,
  frameDigest,
  isProposalFrame,
  markReady,
  percentiles,
  readLease,
  releaseLease,
  stripReady,
} from './loop-state.mjs';
import { parseShellOutput } from './pen-bridge.mjs';
import { glyphFindings, renderGuard } from './render-guard.mjs';

const root = {
  id: 'F',
  t: 'frame',
  nm: 'PROPOSAL / X',
  p: null,
  d: 0,
  x: 0,
  y: 0,
  w: 800,
  h: 600,
  fill: '#030406',
  r: { fill: '$bg' },
};
const node = o => ({ p: 'F', d: 1, x: 40, y: 40, w: 100, h: 20, r: {}, ...o });
const facts = nodes => ({ name: 'PROPOSAL / X', nodes: [root, ...nodes] });
const checks = (nodes, ctx = {}) =>
  runChecks(facts(nodes), { typeScale: [12, 14, 16, 24], ...ctx });
const has = (list, check, severity = 'block') =>
  list.some(f => f.check === check && f.severity === severity);

test('colour parsing and WCAG contrast', () => {
  assert.deepEqual(parseHex('#fff'), { r: 255, g: 255, b: 255, a: 1 });
  assert.equal(parseHex('#00000080').a.toFixed(2), '0.50');
  assert.equal(parseHex('red'), null);
  assert.equal(
    Math.round(contrastRatio(parseHex('#000'), parseHex('#fff'))),
    21
  );
  assert.deepEqual(
    solidFill([{ type: 'color', color: '#111111' }, { type: 'image' }]),
    parseHex('#111111')
  );
});

test('raw colours and raw font sizes fail; tokens pass', () => {
  const bad = checks([
    node({ id: 'a', t: 'frame', r: { fill: '#123456' } }),
    node({
      id: 't',
      t: 'text',
      tx: 'Hello there',
      fs: 13,
      fill: '#f5f7fb',
      r: { fontSize: 13 },
    }),
  ]);
  assert.ok(has(bad, 'ds-tokens'));
  assert.ok(has(bad, 'type-scale'));
  const good = checks([
    node({
      id: 't',
      t: 'text',
      tx: 'Hello there',
      fs: 14,
      ff: 'Inter',
      fill: '#f5f7fb',
      r: { fontSize: '$type-size-sm', fill: '$ink' },
    }),
  ]);
  assert.equal(good.filter(f => f.severity === 'block').length, 0);
});

test('transparent fills are not raw colours', () => {
  assert.ok(
    !has(
      checks([node({ id: 'a', t: 'frame', r: { fill: '#00000000' } })]),
      'ds-tokens'
    )
  );
});

test('low-contrast text fails, large text uses 3:1', () => {
  assert.ok(
    has(
      checks([
        node({
          id: 't',
          t: 'text',
          tx: 'Muted label',
          fs: 14,
          fill: '#2a2c30',
          r: { fontSize: '$a' },
        }),
      ]),
      'contrast'
    )
  );
  const large = checks([
    node({
      id: 't',
      t: 'text',
      tx: 'Big heading',
      fs: 24,
      fill: '#6b6f78',
      r: { fontSize: '$a' },
    }),
  ]);
  assert.ok(!has(large, 'contrast'));
});

test('findings inside a shell instance are advisory', () => {
  const list = checks([
    node({
      id: 'side/t',
      t: 'text',
      tx: 'Sidebar row',
      fs: 12.5,
      fill: '#f5f7fb',
      r: { fontSize: 12.5 },
      segRefName: 'Canonical / App Sidebar / Runtime',
    }),
  ]);
  assert.ok(has(list, 'type-scale', 'warn'));
  assert.ok(!has(list, 'type-scale', 'block'));
});

test('two filled primary actions fail one-primary; small targets fail', () => {
  const btn = (id, x) => [
    node({
      id,
      t: 'frame',
      nm: 'Primary / Go',
      x,
      w: 120,
      h: 32,
      fill: '#f5f7fb',
    }),
    node({
      id: `${id}l`,
      p: id,
      d: 2,
      t: 'text',
      tx: 'Go',
      fs: 14,
      fill: '#030406',
      r: { fontSize: '$a' },
    }),
  ];
  assert.ok(has(checks([...btn('b1', 40), ...btn('b2', 200)]), 'one-primary'));
  assert.ok(!has(checks(btn('b1', 40)), 'one-primary'));
  const tiny = checks([
    node({ id: 's', t: 'frame', nm: 'Source / Upload', w: 140, h: 15 }),
    node({
      id: 'sl',
      p: 's',
      d: 2,
      t: 'text',
      tx: 'Upload',
      fs: 14,
      fill: '#f5f7fb',
      r: { fontSize: '$a' },
    }),
  ]);
  assert.ok(has(tiny, 'touch-target'));
});

test('sub-pixel geometry and off-grid spacing fail on owned nodes', () => {
  assert.ok(has(checks([node({ id: 'a', t: 'frame', x: 10.5 })]), 'grid'));
  assert.ok(
    has(checks([node({ id: 'a', t: 'frame', r: { gap: 5 } })]), 'grid')
  );
  assert.ok(
    !has(
      checks([node({ id: 'a', t: 'frame', r: { gap: 8, padding: [12, 16] } })]),
      'grid'
    )
  );
});

test('optical axis: a left edge 1-3px off a shared axis fails', () => {
  const t = (id, x) => ({ id, t: 'text', x, tx: id });
  const out = nearMissAxes([t('a', 40), t('b', 40), t('c', 40), t('d', 42)]);
  assert.equal(out.length, 1);
  assert.equal(out[0].node, 'd');
  assert.equal(nearMissAxes([t('a', 40), t('b', 40), t('c', 80)]).length, 0);
});

test('copy floor, dead ends, numeric claims and ALL CAPS', () => {
  const ctx = {
    lintCopy: s => ({
      blocking: /seamless/i.test(s) ? [{ rule: 'slop', message: 'slop' }] : [],
    }),
    deadEndRules: [
      {
        id: 'dead-end-coming-soon',
        pattern: /coming soon/i,
        message: 'defers',
      },
    ],
    claimPatterns: [{ id: 'multiple', regex: /\b\d+x faster\b/i }],
  };
  const tx = (id, s) =>
    node({
      id,
      t: 'text',
      tx: s,
      fs: 14,
      fill: '#f5f7fb',
      r: { fontSize: '$a' },
    });
  const list = checks(
    [
      tx('a', 'Seamless sync'),
      tx('b', 'Coming soon'),
      tx('c', 'Import 10x faster'),
      tx('d', 'Your 10x faster import'),
      tx('e', 'IMPORT NETWORK'),
      tx('f', 'A&R'),
    ],
    ctx
  );
  assert.ok(list.some(f => f.check === 'copy' && f.node === 'a'));
  assert.ok(list.some(f => f.check === 'dead-end' && f.node === 'b'));
  assert.ok(list.some(f => f.check === 'claims' && f.node === 'c'));
  assert.ok(!list.some(f => f.check === 'claims' && f.node === 'd'));
  assert.ok(list.some(f => f.check === 'casing' && f.node === 'e'));
  assert.ok(!list.some(f => f.check === 'casing' && f.node === 'f'));
});

const img = (w, h, fn) => {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = fn(x, y);
      data.set([v, v, v, 255], (y * w + x) * 4);
    }
  return { width: w, height: h, data };
};

test('render guard: identical renders, white noise and blank renders fail', () => {
  const dark = img(64, 64, (x, y) =>
    x > 20 && x < 40 && y > 20 && y < 30 ? 240 : 6
  );
  const white = img(64, 64, (x, y) => ((x * 7 + y * 3) % 11 === 0 ? 30 : 250));
  assert.equal(
    renderGuard([
      { id: 'a', md5: 'h', img: dark },
      { id: 'b', md5: 'h', img: dark },
    ]).length,
    2
  );
  assert.match(
    renderGuard([{ id: 'a', md5: '1', img: white }])[0].reason,
    /noise/
  );
  assert.match(
    renderGuard([{ id: 'a', md5: '1', img: img(8, 8, () => 6) }])[0].reason,
    /blank/
  );
  assert.equal(renderGuard([{ id: 'a', md5: '1', img: dark }]).length, 0);
});

test('render guard: identical fallback glyphs and inkless text fail', () => {
  // Every icon cell draws the same "?" glyph although the icons differ.
  const q = img(200, 40, (x, y) =>
    x % 40 > 14 && x % 40 < 22 && y > 10 && y < 30 ? 230 : 6
  );
  const icons = ['search', 'home', 'link', 'user', 'bell'].map((ic, i) => ({
    id: `i${i}`,
    t: 'icon_font',
    ic,
    d: 1,
    x: i * 40 + 6,
    y: 6,
    w: 28,
    h: 28,
  }));
  assert.match(
    glyphFindings({ img: q }, { nodes: icons })[0],
    /missing icon glyphs/
  );
  const blankText = [
    { id: 't', t: 'text', tx: 'Hello world', d: 1, x: 0, y: 0, w: 100, h: 20 },
  ];
  assert.match(
    glyphFindings({ img: img(120, 30, () => 6) }, { nodes: blankText })[0],
    /missing text/
  );
});

test('loop decision: two quiet rounds pass, findings fix, max rounds fail', () => {
  const quiet = {
    checks: [],
    gates: { failed: [] },
    judges: [{ material: true, confirmed: false }],
  };
  const first = decideRound({ ...quiet, quietRounds: 0 });
  assert.equal(first.action, 'rejudge');
  assert.equal(
    decideRound({ ...quiet, quietRounds: first.quietRounds }).action,
    'pass'
  );
  const block = {
    checks: [
      { check: 'grid', severity: 'block', message: 'x', node: 'n' },
      { check: 'contrast', severity: 'block', message: 'c', node: 'm' },
    ],
  };
  const fix = decideRound({ ...block, round: 0 });
  assert.equal(fix.action, 'fix');
  assert.equal(fix.topIssue.check, 'contrast');
  assert.equal(
    decideRound({ ...block, round: 7, maxRounds: 8 }).action,
    'fail'
  );
  const judged = decideRound({
    judges: [
      {
        material: true,
        confirmed: true,
        issue: 'CTA unclear',
        persona: 'buyer',
        key: 'cta',
      },
    ],
  });
  assert.equal(judged.topIssue.source, 'judge');
});

test('proposal matcher, ready marker and digest', () => {
  assert.ok(isProposalFrame({ name: 'PROPOSAL / Network CRM · S1' }));
  assert.ok(
    isProposalFrame({
      name: 'App / Chat / Assembling profile · 1 early · PROPOSAL',
    })
  );
  assert.ok(
    !isProposalFrame({ name: 'PROPOSAL AREA · Jovie marketing family' })
  );
  const marked = markReady('PROPOSAL / A', 'abcdef0123456789');
  assert.equal(marked, 'PROPOSAL / A · ready for Tim rabcdef01');
  assert.equal(stripReady(marked), 'PROPOSAL / A');
  assert.equal(
    frameDigest({ name: 'a', x: 1, children: [{ id: 'q' }] }),
    frameDigest({ x: 1, name: 'b', children: [{ id: 'q' }] })
  );
  assert.notEqual(frameDigest({ x: 1 }), frameDigest({ x: 2 }));
});

test('writer lease: exclusive, renewable, expiring, releasable', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'lease-')), 'w.json');
  let t = 1_000_000;
  const now = () => t;
  assert.ok(acquireLease(path, { holder: 'a', ttlMs: 1000, now }).ok);
  const held = acquireLease(path, { holder: 'b', ttlMs: 1000, now });
  assert.equal(held.ok, false);
  assert.equal(held.heldBy.holder, 'a');
  assert.ok(acquireLease(path, { holder: 'a', ttlMs: 1000, now }).renewed);
  t += 5000;
  assert.ok(acquireLease(path, { holder: 'b', ttlMs: 1000, now }).ok);
  assert.equal(releaseLease(path, 'a'), false);
  assert.ok(releaseLease(path, 'b'));
  assert.equal(readLease(path), null);
});

test('save guard flags unsaved nodes this writer did not touch', () => {
  const disk = { A: '1', B: '1' };
  const live = { A: '2', B: '1', T1E2z: '1' };
  assert.deepEqual(foreignUnsaved(live, disk, new Set(['A'])), ['T1E2z']);
  assert.deepEqual(foreignUnsaved(live, disk, new Set(['A', 'T1E2z'])), []);
});

test('pen shell output parsing', () => {
  const out =
    '\u001b[36mpen\u001b[39m > {\n  "message": "OK\\n\\n## Print output\\nFACTS{\\"a\\":1}  \\nline2\\n"\n}\nGoodbye.';
  const [r] = parseShellOutput(out);
  assert.ok(r.ok);
  assert.deepEqual(r.lines, ['FACTS{"a":1}', 'line2']);
  assert.throws(() => parseShellOutput('nothing here'), /no result/);
  const headless =
    '[INFO] Ready.\n\u001b[36mpen\u001b[39m > [WARN] [IPC] request \'read-file\' failed\n    at x (y)\n  code: \'FILE_NOT_FOUND\'\n}\nOK\n\nGlobal variables carry over\n\n## Print output\nMAP["a","b"]\n\n[WARN] late\npen > OK\n\n## Print output\nsecond\n\nGoodbye.';
  const parsed = parseShellOutput(headless);
  assert.equal(parsed.length, 2);
  assert.ok(parsed.every(p => p.ok));
  assert.deepEqual(parsed[0].lines, ['MAP["a","b"]']);
  assert.deepEqual(parsed[1].lines, ['second']);
});

test('judge reply parsing, persona prompts and inventory', () => {
  assert.deepEqual(
    parseJudgeReply(
      'ok ```{"material": true, "issue": "CTA hidden", "element": "button", "fix": "raise it"}```'
    ),
    { material: true, issue: 'CTA hidden', element: 'button', fix: 'raise it' }
  );
  assert.equal(parseJudgeReply('no json'), null);
  assert.throws(() => personaPrompt('nobody', {}, ''), /unknown persona/);
  const p = personaPrompt(
    'heritage-manager',
    { surface: 'S1', mission: 'm', audience: 'a' },
    '- x'
  );
  assert.match(p, /intended state|deliberately shows one state/);
  assert.match(
    textInventory({
      nodes: [
        { t: 'text', tx: 'B', x: 0, y: 2 },
        { t: 'text', tx: 'A', x: 0, y: 1 },
      ],
    }),
    /^- A\n- B/
  );
});

test('percentiles for stage timing', () => {
  assert.deepEqual(percentiles([5, 1, 3, 2, 4]), { n: 5, p50: 3, p95: 5 });
  assert.deepEqual(percentiles([]), { n: 0, p50: null, p95: null });
});
