import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findDesignAuthorityViolations,
  hasExactSerifException,
  isSerifDeclaration,
} from './design-authority-guard.mjs';

test('active design authorities and product source have no contradictions', () => {
  assert.deepEqual(findDesignAuthorityViolations(), []);
});

test('serif detector targets declarations, not prose or sans-serif', () => {
  assert.equal(isSerifDeclaration('A user wrote the word serif.'), false);
  assert.equal(isSerifDeclaration('font-family: Inter, sans-serif;'), false);
  assert.equal(isSerifDeclaration('font-family: Georgia, serif;'), true);
  assert.equal(isSerifDeclaration("fontFamily: 'Source Serif 4'"), true);
});

test('serif exceptions require an exact path and match', () => {
  const exceptions = [
    { path: 'apps/web/media.tsx', match: 'Source Serif 4', used: false },
  ];
  assert.ok(
    hasExactSerifException(
      exceptions,
      'apps/web/media.tsx',
      "fontFamily: 'Source Serif 4'"
    )
  );
  assert.equal(
    hasExactSerifException(exceptions, 'apps/web/other.tsx', 'Source Serif 4'),
    undefined
  );
});
