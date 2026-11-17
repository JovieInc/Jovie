import assert from 'node:assert/strict';
import { test } from 'node:test';
import { brandChecks, sidebarFindings } from './brand-checks.mjs';

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

test('DS rules: elevation inversion, accent misuse, raw radius and spacing', async () => {
  const { dsFindings } = await import('./brand-checks.mjs');
  const f = (nodes, theme = null) =>
    dsFindings({
      name: 'P',
      theme,
      nodes: [
        {
          id: 'F',
          t: 'frame',
          d: 0,
          w: 1348,
          h: 900,
          r: { fill: '$atom-surface-canvas' },
        },
        ...nodes,
      ],
    }).map(x => x.check);
  const card = {
    id: 'c',
    t: 'frame',
    p: 'F',
    d: 1,
    w: 300,
    h: 200,
    r: { fill: '$atom-surface-card' },
  };
  assert.deepEqual(
    f([
      card,
      {
        id: 'w',
        t: 'frame',
        p: 'c',
        d: 2,
        w: 100,
        h: 40,
        r: { fill: '$atom-surface-canvas' },
      },
    ]),
    ['elevation']
  );
  assert.deepEqual(
    f([
      card,
      {
        id: 'w',
        t: 'frame',
        p: 'c',
        d: 2,
        w: 100,
        h: 40,
        r: { fill: '$atom-surface-elevated' },
      },
    ]),
    []
  );
  assert.deepEqual(
    f(
      [
        card,
        {
          id: 'w',
          t: 'frame',
          p: 'c',
          d: 2,
          w: 100,
          h: 40,
          r: { fill: '$atom-surface-canvas' },
        },
      ],
      { 'mode-2': 'light' }
    ),
    []
  );
  assert.deepEqual(
    f([
      {
        id: 'a',
        t: 'frame',
        p: 'F',
        d: 1,
        w: 300,
        h: 200,
        r: { fill: '$ion' },
      },
    ]),
    ['accent']
  );
  assert.deepEqual(
    f([
      { id: 'b', t: 'frame', p: 'F', d: 1, w: 120, h: 44, r: { fill: '$ion' } },
    ]),
    []
  );
  assert.deepEqual(
    f([
      {
        id: 't',
        t: 'text',
        p: 'F',
        d: 1,
        w: 300,
        h: 20,
        fs: 14,
        tx: 'A long paragraph of body copy set in the accent colour',
        r: { fill: '$ion' },
      },
    ]),
    ['accent']
  );
  assert.deepEqual(
    f([
      { id: 'b', t: 'frame', p: 'F', d: 1, w: 20, h: 20, r: { fill: '$ion' } },
      {
        id: 'b2',
        t: 'frame',
        p: 'F',
        d: 1,
        w: 20,
        h: 20,
        r: { fill: '$pulse' },
      },
    ]),
    ['accent']
  );
  assert.deepEqual(
    f([
      {
        id: 'r',
        t: 'frame',
        p: 'F',
        d: 1,
        w: 20,
        h: 20,
        r: { cornerRadius: 13, gap: 9, padding: [0, '$app-space-2'] },
      },
    ]).sort(),
    ['ds-radius', 'ds-spacing']
  );
});

test('sidebar header: saturated count badge and detached circle fail; muted count passes', async () => {
  const { sidebarFindings } = await import('./brand-checks.mjs');
  const base = [
    { id: 'F', t: 'frame', d: 0, w: 1348, h: 900 },
    {
      id: 'S',
      t: 'frame',
      nm: 'Sidebar / Contacts',
      p: 'F',
      d: 1,
      w: 244,
      h: 884,
      r: {},
    },
  ];
  const run = nodes =>
    sidebarFindings({ name: 'P', nodes: [...base, ...nodes] }).map(
      f => f.check
    );
  assert.deepEqual(
    run([
      {
        id: 'b',
        t: 'frame',
        nm: 'Unread Count',
        p: 'S',
        d: 2,
        w: 24,
        h: 20,
        r: { fill: '$ion', cornerRadius: '$radius-pill' },
      },
      { id: 'bt', t: 'text', p: 'b', d: 3, tx: '3' },
    ]),
    ['sidebar-badge']
  );
  assert.deepEqual(
    run([
      {
        id: 'b',
        t: 'frame',
        nm: 'Count / neutral',
        p: 'S',
        d: 2,
        w: 20,
        h: 18,
        r: { fill: '$atom-surface-elevated', cornerRadius: '$radius-pill' },
      },
      { id: 'bt', t: 'text', p: 'b', d: 3, tx: '3' },
    ]),
    []
  );
  assert.deepEqual(
    run([
      {
        id: 'n',
        t: 'frame',
        nm: 'New chat',
        p: 'S',
        d: 2,
        w: 32,
        h: 32,
        r: { fill: '$atom-surface-elevated', cornerRadius: '$radius-pill' },
      },
      { id: 'ni', t: 'icon', p: 'n', d: 3 },
    ]),
    ['sidebar-detached-button']
  );
  assert.deepEqual(
    run([
      {
        id: 'n',
        t: 'frame',
        nm: 'Icon button / New chat',
        p: 'S',
        d: 2,
        w: 28,
        h: 28,
        r: { fill: '$atom-transparent', cornerRadius: '$radius-xs' },
      },
      { id: 'ni', t: 'icon', p: 'n', d: 3 },
    ]),
    []
  );
});

test('inherited sidebar findings stay visible as warnings, owned badges still block', () => {
  const nodes = [
    { id: 'shell', d: 1, t: 'frame', nm: 'Sidebar', refName: 'Sidebar' },
    {
      id: 'shell/b',
      p: 'shell',
      d: 2,
      t: 'frame',
      segRefName: 'Sidebar',
      w: 24,
      h: 20,
      r: { fill: '$ion', cornerRadius: '$radius-pill' },
    },
    {
      id: 'shell/t',
      p: 'shell/b',
      d: 3,
      t: 'text',
      segRefName: 'Sidebar',
      tx: '3',
    },
    {
      id: 'own',
      p: 'shell',
      d: 2,
      t: 'frame',
      w: 24,
      h: 20,
      r: { fill: '$ion', cornerRadius: '$radius-pill' },
    },
    { id: 'text', p: 'own', d: 3, t: 'text', tx: '3' },
  ];
  const findings = sidebarFindings({ nodes });
  assert.equal(findings.find(f => f.node === 'shell/b').severity, 'warn');
  assert.equal(findings.find(f => f.node === 'own').severity, 'block');
});
