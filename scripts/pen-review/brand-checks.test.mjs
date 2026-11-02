import assert from 'node:assert/strict';
import { test } from 'node:test';
import { brandChecks } from './brand-checks.mjs';
import { decideRound } from './loop-state.mjs';

const node = o => ({ p: 'F', d: 1, x: 0, y: 0, w: 100, h: 20, ...o });
const facts = (name, nodes) => ({
  name,
  nodes: [{ id: 'F', t: 'frame', d: 0, w: 1348, h: 900 }, ...nodes],
});
const checks = (name, nodes) =>
  brandChecks(facts(name, nodes)).map(f => f.check);

test('artist dignity: diminishing copy fails, confident copy passes', () => {
  const bad = [
    'UNMARKED makes slow, late-night electronic music for long drives and empty rooms.',
    'Playing to nobody on a Tuesday',
    'a struggling artist from Leeds',
    'still waiting for a break',
  ];
  for (const tx of bad)
    assert.deepEqual(
      checks('PROPOSAL / X', [node({ id: 't', t: 'text', tx })]),
      ['artist-dignity'],
      tx
    );
  assert.deepEqual(
    checks('PROPOSAL / X', [
      node({
        id: 't',
        t: 'text',
        tx: 'UNMARKED makes slow, late-night electronic music that packs rooms after midnight.',
      }),
    ]),
    []
  );
});

test('logo size: brand marks over 32px fail; 28px and container frames pass', () => {
  assert.deepEqual(
    checks('P', [
      node({
        id: 'm',
        t: 'ref',
        ref: 'Dl0KZ',
        nm: 'Jovie O-mark',
        w: 48,
        h: 48,
      }),
    ]),
    ['logo-size']
  );
  assert.deepEqual(
    checks('P', [
      node({
        id: 'm',
        t: 'frame',
        nm: 'Jovie / approved O-mark',
        w: 60,
        h: 60,
      }),
    ]),
    ['logo-size']
  );
  assert.deepEqual(
    checks('P', [
      node({ id: 'w', t: 'ref', ref: 'OeW2u', nm: 'Wordmark', w: 140, h: 40 }),
    ]),
    ['logo-size']
  );
  assert.deepEqual(
    checks('P', [
      node({
        id: 'm',
        t: 'ref',
        ref: 'Dl0KZ',
        nm: 'Jovie O-mark',
        w: 28,
        h: 28,
      }),
    ]),
    []
  );
  assert.deepEqual(
    checks('P', [
      node({ id: 'c', t: 'frame', nm: 'Footer Brand Mark', w: 168, h: 24 }),
    ]),
    []
  );
  assert.deepEqual(
    checks('P', [
      node({
        id: 'c',
        t: 'frame',
        nm: 'Logo bar / canonical',
        w: 1440,
        h: 156,
      }),
    ]),
    []
  );
});

test('private ratings: Never push only on a fictional catalog frame', () => {
  const t = node({ id: 'r', t: 'text', tx: 'Never push' });
  assert.deepEqual(checks('PROPOSAL / Fan engine · F5 Catalog taste', [t]), [
    'private-ratings',
  ]);
  assert.deepEqual(
    checks('PROPOSAL / Fan engine · F5 Catalog taste · fictional catalog', [t]),
    []
  );
});

test('brand findings outrank everything else as the next fix', () => {
  const findings = [
    { check: 'grid', severity: 'block', node: 'a', message: 'gap 9' },
    {
      check: 'artist-dignity',
      severity: 'block',
      node: 'b',
      message: 'empty rooms',
    },
  ];
  assert.equal(
    decideRound({ checks: findings }).topIssue.check,
    'artist-dignity'
  );
});
