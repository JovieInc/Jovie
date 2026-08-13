import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findDesignAuthorityViolations,
  hasExactSerifException,
  isSerifDeclaration,
  validateSerifException,
} from './design-authority-guard.mjs';

test('active design authorities and product source have no contradictions', () => {
  assert.deepEqual(findDesignAuthorityViolations(), []);
});

test('serif detector targets declarations, not prose or sans-serif', () => {
  assert.equal(isSerifDeclaration('A user wrote the word serif.'), false);
  assert.equal(isSerifDeclaration('font-family: Inter, sans-serif;'), false);
  assert.equal(isSerifDeclaration('font: 500 1rem/1.4 sans-serif;'), false);
  assert.equal(isSerifDeclaration('font: 500 1rem/1.4 serif;'), true);
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

test('serif exceptions reject broad or wildcard exemptions', () => {
  assert.throws(
    () =>
      validateSerifException({
        path: 'apps/web/*.tsx',
        match: 'Source Serif 4',
        kind: 'media',
        owner: 'Design',
        reason: 'A media asset needs its original typeface.',
      }),
    /paths must be exact/
  );
  assert.throws(
    () =>
      validateSerifException({
        path: 'apps/web/media.tsx',
        match: 'serif',
        kind: 'media',
        owner: 'Design',
        reason: 'A media asset needs its original typeface.',
      }),
    /concrete declaration/
  );
  assert.deepEqual(
    validateSerifException({
      path: 'apps/web/media.tsx',
      match: 'font-serif',
      kind: 'media',
      owner: 'Design',
      reason: 'A media asset needs its original typeface.',
    }),
    {
      path: 'apps/web/media.tsx',
      match: 'font-serif',
      kind: 'media',
      owner: 'Design',
      reason: 'A media asset needs its original typeface.',
      used: false,
    }
  );
  assert.throws(
    () =>
      validateSerifException({
        path: 'apps/web/media.tsx',
        match: 'Source Serif 4',
        kind: 'product',
        owner: 'Design',
        reason: 'A media asset needs its original typeface.',
      }),
    /kind must be ugc or media/
  );
});
