import assert from 'node:assert/strict';
import { test } from 'node:test';

test('taste issues go to the strong fixer, mechanical ones to the cheap one', async () => {
  const { fixerModel } = await import('./fixer.mjs');
  assert.equal(fixerModel({ source: 'judge' }, {}), 'opus');
  assert.equal(fixerModel({ source: 'clef-gate' }, {}), 'opus');
  assert.equal(fixerModel({ source: 'check' }, {}), 'sonnet');
});
