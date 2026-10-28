import assert from 'node:assert/strict';
import test from 'node:test';
import { scanSource } from './scan.mjs';

const big = n =>
  Array.from({ length: n }, (_, i) => `  'item number ${i}',`).join('\n');

test('flags a large string array', () => {
  const src = `export const ITEMS = [\n${big(70)}\n];\n`;
  assert.equal(scanSource(src)[0].name, 'ITEMS');
});
test('ignores small literals', () => {
  assert.deepEqual(scanSource(`export const A = [\n${big(5)}\n];\n`), []);
});
test('honors the waiver comment', () => {
  const src = `// data-vs-code: code enum of behavior\nexport const A = [\n${big(70)}\n];\n`;
  assert.deepEqual(scanSource(src), []);
});
