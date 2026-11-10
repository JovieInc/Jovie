import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  contrastRatio,
  nearMissAxes,
  parseHex,
  runChecks,
  solidFill,
} from './lib.mjs';

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
