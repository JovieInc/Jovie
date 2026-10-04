import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { diffDocs, sliceDoc } from './pen-par-lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));

/** @returns {import('./pen-par-lib.mjs').PenDoc} */
const fixture = () => ({
  version: '2.20',
  themes: { mode: ['dark'] },
  children: [
    {
      id: 'page',
      type: 'frame',
      name: 'Page',
      x: 0,
      y: 0,
      width: 1440,
      height: 900,
      children: [
        { id: 'hero', type: 'text', content: 'Launch like a rockstar.', y: 40 },
        {
          id: 'btn1',
          type: 'ref',
          ref: 'button',
          descendants: { label: { type: 'ref', ref: 'icon' } },
        },
        { id: 'badge1', type: 'ref', ref: 'badge' },
      ],
    },
    {
      id: 'library',
      type: 'frame',
      name: 'Library',
      children: [
        {
          id: 'button',
          type: 'frame',
          reusable: true,
          width: 'fill_container',
          children: [
            { id: 'badge', type: 'frame', reusable: true, height: 20 },
          ],
        },
        { id: 'icon', type: 'icon', reusable: true },
        { id: 'unused', type: 'frame', reusable: true },
      ],
    },
    { id: 'other', type: 'frame', name: 'Other', children: [] },
  ],
});

/** @param {unknown} v @returns {any} */
const clone = v => JSON.parse(JSON.stringify(v));

test('guard passes a run that only adds a frame', () => {
  const src = fixture();
  const run = clone(src);
  run.children.push({
    id: 'new1',
    type: 'frame',
    name: 'PENPAR',
    children: [],
  });
  const r = diffDocs(src, run);
  assert.equal(r.ok, true);
  assert.deepEqual(
    r.added.map(a => a.id),
    ['new1']
  );
});

test('guard fails when an existing frame is removed', () => {
  const src = fixture();
  const run = clone(src);
  run.children = run.children.filter(
    (/** @type {any} */ n) => n.id !== 'other'
  );
  const r = diffDocs(src, run);
  assert.equal(r.ok, false);
  assert.deepEqual(r.removed, ['other']);
});

test('guard fails on a semantic edit inside an existing frame', () => {
  const src = fixture();
  const run = clone(src);
  run.children[0].children[0].content = 'Request access';
  const r = diffDocs(src, run);
  assert.equal(r.ok, false);
  assert.deepEqual(
    r.changed.map(c => c.id),
    ['page']
  );
});

test('guard treats key order, numeric/null layout and fill_container(0) as reflow', () => {
  const src = fixture();
  const run = clone(src);
  const page = run.children[0];
  run.children[0] = Object.fromEntries(Object.entries(page).reverse());
  run.children[0].children[0].y = null;
  run.children[0].height = 912;
  run.children[1].children[0].width = 'fill_container(0)';
  const r = diffDocs(src, run);
  assert.equal(r.ok, true);
  assert.deepEqual(r.changed, []);
  assert.deepEqual(r.reflowed.sort(), ['library', 'page']);
});

test('slice keeps the target and the transitive ref closure without duplicate ids', () => {
  const { slice, components } = sliceDoc(fixture(), ['page']);
  const ids = /** @type {string[]} */ ([]);
  const walk = (/** @type {any} */ n) => {
    ids.push(n.id);
    (n.children || []).forEach(walk);
  };
  slice.children.forEach(walk);
  assert.deepEqual(
    slice.children.map(n => n.id),
    ['page', 'button', 'icon']
  );
  assert.equal(components, 2);
  assert.equal(
    ids.filter(id => id === 'badge').length,
    1,
    'nested component is not lifted twice'
  );
  assert.ok(!ids.includes('unused'));
  assert.ok(!ids.includes('other'));
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(slice.themes, { mode: ['dark'] });
});

test('slice rejects a target that is not a top-level frame', () => {
  assert.throws(() => sliceDoc(fixture(), ['hero']), /not top-level/);
});

test('pen-fanin CLI exits 2 on a violation and 0 on a clean run', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pen-par-'));
  const src = fixture();
  const clean = clone(src);
  clean.children.push({ id: 'new1', type: 'frame', children: [] });
  const bad = clone(src);
  bad.children.pop();
  writeFileSync(join(dir, 'src.pen'), JSON.stringify(src));
  writeFileSync(join(dir, 'clean.pen'), JSON.stringify(clean));
  writeFileSync(join(dir, 'bad.pen'), JSON.stringify(bad));
  const cli = join(here, 'pen-fanin.mjs');
  const ok = spawnSync(process.execPath, [
    cli,
    join(dir, 'src.pen'),
    join(dir, 'clean.pen'),
  ]);
  assert.equal(ok.status, 0, ok.stderr.toString());
  const fail = spawnSync(process.execPath, [
    cli,
    join(dir, 'src.pen'),
    join(dir, 'bad.pen'),
  ]);
  assert.equal(fail.status, 2);
  assert.match(fail.stdout.toString(), /"removed": \[\s*"other"/);
});

test('pen-fanout refuses a workspace under ~/Documents', () => {
  const home = mkdtempSync(join(tmpdir(), 'pen-par-home-'));
  const ws = join(home, 'Documents', 'ws');
  spawnSync('mkdir', ['-p', ws]);
  writeFileSync(join(home, 'jobs.tsv'), '');
  const r = spawnSync(
    'bash',
    [join(here, 'pen-fanout.sh'), join(home, 'jobs.tsv'), 'b1', '1'],
    {
      env: { ...process.env, HOME: home, PEN_WS: ws },
    }
  );
  assert.equal(r.status, 9, r.stderr.toString());
});

test('pen-fanout runs every job, including directions longer than 255 bytes', () => {
  const root = mkdtempSync(join(tmpdir(), 'pen-par-run-'));
  const ws = join(root, 'ws');
  const bin = join(root, 'bin');
  spawnSync('mkdir', ['-p', ws, bin]);
  writeFileSync(join(ws, 'src.pen'), JSON.stringify(fixture()));
  // fake pen: copy --in to --out so the runner's success path is exercised offline
  writeFileSync(
    join(bin, 'pen'),
    '#!/usr/bin/env bash\nwhile [ $# -gt 0 ]; do case "$1" in --in) i=$2;; --out) o=$2;; esac; shift; done\ncp "$i" "$o"\n',
    { mode: 0o755 }
  );
  const long = 'keep every label on one line '.repeat(12);
  assert.ok(long.length > 255);
  const jobs = ['j1', 'j2']
    .map(id =>
      [id, 'claude', 'm', 'page', id === 'j2' ? long : 'short'].join('\t')
    )
    .join('\n');
  writeFileSync(join(root, 'jobs.tsv'), `${jobs}\n`);
  const r = spawnSync(
    'bash',
    [join(here, 'pen-fanout.sh'), join(root, 'jobs.tsv'), 'b1', '2'],
    {
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        PEN_WS: ws,
        PEN_SKILL: '/dev/null',
      },
    }
  );
  assert.equal(r.status, 0, r.stderr.toString());
  const out = r.stdout.toString();
  assert.match(out, /^j1\t.*rc=0/m);
  assert.match(out, /^j2\t.*rc=0/m);
});
