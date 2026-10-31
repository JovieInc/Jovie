import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findDesignAuthorityViolations,
  hasExactSerifException,
  interactiveRatchetViolations,
  isSerifDeclaration,
  rawInteractiveCounts,
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

const settingsFile = 'apps/web/app/app/(shell)/settings/example.tsx';
test('raw control detector parses JSX, ignoring comments, strings and test files', () => {
  const source = `// <button> in a comment
    const text = '<input />';
    const view = <><button
      type="button">Save</button><input /><select /><Button /><Input /></>;`;
  const counts = rawInteractiveCounts(settingsFile, source);
  assert.deepEqual(counts, { button: 1, input: 1, select: 1 });
  assert.deepEqual(
    rawInteractiveCounts(settingsFile.replace('.tsx', '.test.tsx'), source),
    {}
  );
});

test('raw control ratchet blocks new files, new tags and growth; requires debt shrinkage', () => {
  const sources = { [settingsFile]: '<button />' };
  const baseline = { [`${settingsFile}:<button>`]: 1 };
  assert.deepEqual(interactiveRatchetViolations(sources, baseline), []);
  assert.equal(interactiveRatchetViolations(sources, {}).length, 1);
  for (const source of ['<button /><input />', '<button /><button />']) {
    const findings = interactiveRatchetViolations(
      { [settingsFile]: source },
      baseline
    );
    assert.equal(findings.length, 1);
  }
  assert.match(interactiveRatchetViolations({}, baseline)[0], /shrink/);
});
