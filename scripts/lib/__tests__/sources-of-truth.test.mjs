import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  readSourcesOfTruth,
  renderSourcesOfTruth,
  validateSourcesOfTruth,
} from '../sources-of-truth.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

test('the committed map is sound', () => {
  assert.deepEqual(validateSourcesOfTruth(readSourcesOfTruth(root), root), []);
});

test('rejects missing owner, duplicate owner file and self-derived owner', () => {
  const map = {
    schema: 'jovie-sources-of-truth/v1',
    ownerKinds: { file: 'x', external: 'x' },
    domains: [
      { id: 'a', title: 'A', owner: { kind: 'file', ref: 'package.json' } },
      { id: 'b', title: 'B', owner: { kind: 'file', ref: 'package.json' } },
      {
        id: 'c',
        title: 'C',
        owner: { kind: 'file', ref: 'nope.txt' },
        derived: ['gone.txt'],
      },
      { id: 'd', title: 'D', owner: { kind: 'external', ref: 'package.json' } },
    ],
  };
  const out = validateSourcesOfTruth(map, root).join('\n');
  assert.match(out, /already the owner of a/);
  assert.match(out, /nope\.txt does not exist/);
  assert.match(out, /gone\.txt does not exist/);
  assert.match(out, /external owner needs authority/);
});

test('render lists every domain', () => {
  const map = readSourcesOfTruth(root);
  const md = renderSourcesOfTruth(map);
  for (const d of map.domains) assert.ok(md.includes(d.title));
});
