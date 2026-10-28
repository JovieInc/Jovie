import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RAW_HEX_PATTERN,
  RAW_PALETTE_PATTERN,
} from './design-system-source-ratchet.mjs';

const all = (source, pattern) =>
  source.match(new RegExp(pattern.source, pattern.flags)) ?? [];

test('raw hex rule catches 6/8 digit literals, not token refs or short ids', () => {
  assert.deepEqual(all('color: "#FFFFFF", b: "#00000000"', RAW_HEX_PATTERN), [
    '#FFFFFF',
    '#00000000',
  ]);
  assert.deepEqual(all('href="#section" var(--color-bg)', RAW_HEX_PATTERN), []);
});

test('raw palette rule catches palette families, leaves semantic tokens and white/black to eslint', () => {
  assert.deepEqual(
    all(
      'bg-amber-500 text-emerald-300 border-rose-500/40',
      RAW_PALETTE_PATTERN
    ),
    ['bg-amber-500', 'text-emerald-300', 'border-rose-500']
  );
  assert.deepEqual(
    all(
      'text-primary-token bg-surface-1 text-white bg-black',
      RAW_PALETTE_PATTERN
    ),
    []
  );
});
