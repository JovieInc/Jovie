import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  encodePng,
  fillRect,
  solidImage,
} from '../invariants/pen-still-diff-lib.mjs';
import { exportRefs } from './export-refs.mjs';

const scratch = t => {
  const dir = mkdtempSync(join(tmpdir(), 'pen-recovery-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};
const image = () => {
  const img = solidImage(160, 96, [6, 6, 6, 255]);
  fillRect(img, 105, 65, 30, 6, [220, 220, 220, 255]);
  return img;
};
const textFacts = {
  id: 'F',
  name: 'PROPOSAL / test',
  w: 320,
  h: 192,
  nodes: [
    { id: 'text', t: 'text', tx: 'Hello', d: 1, x: 200, y: 120, w: 80, h: 40 },
  ],
};

test('reference manifest rejects inkless text instead of bypassing facts checks', t => {
  const dir = scratch(t);
  const manifest = exportRefs({ test: 'F' }, dir, {
    exporter: () => [
      { id: 'F', path: join(dir, 'F.png'), buf: encodePng(image()), md5: 'a' },
    ],
    factsReader: id => {
      assert.equal(id, 'F');
      return { ...textFacts, nodes: [{ ...textFacts.nodes[0], x: 0, y: 0 }] };
    },
    pen: () => [],
  });
  assert.equal(manifest.surfaces.test.trusted, false);
  assert.match(manifest.surfaces.test.guard.join(' '), /missing text/);
  assert.equal(
    JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')).surfaces.test
      .trusted,
    false
  );
});

test('reference CLI runs from paths containing spaces and unicode', t => {
  const dir = join(scratch(t), 'a space ü');
  mkdirSync(dir);
  // Copy only the module graph: an invalid CLI pair
  // must produce an error. The old pathname comparison silently exited zero.
  cpSync(dirname(fileURLToPath(import.meta.url)), join(dir, 'pen-review'), {
    recursive: true,
  });
  mkdirSync(join(dir, 'invariants'));
  cpSync(
    new URL('../invariants/pen-still-diff-lib.mjs', import.meta.url),
    join(dir, 'invariants/pen-still-diff-lib.mjs')
  );
  const result = spawnSync(
    process.execPath,
    [join(dir, 'pen-review/export-refs.mjs'), '--sheet', 'invalid'],
    { encoding: 'utf8' }
  );
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /split/);
});
