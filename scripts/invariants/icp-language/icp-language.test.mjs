import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { checkIcpLanguage } from './check.mjs';
import {
  isExemptPath,
  loadConfig,
  matchTerms,
  violationsInSource,
} from './match.mjs';
import { evaluateRatchet } from './ratchet.mjs';
import { collectScanFiles, REPO_ROOT } from './scan.mjs';

const config = loadConfig();
const terms = (text, extra) =>
  matchTerms(text, config.terms, extra ?? config.suppressedPrefixes);

test('word boundaries match segment words and miss lookalikes', () => {
  assert.deepEqual(terms('for artists and musicians'), ['artist', 'musician']);
  assert.deepEqual(terms('artistic musical fancy founded authority'), []);
  assert.deepEqual(terms('musicians'), ['musician']);
  assert.deepEqual(terms('music'), ['music']);
  assert.deepEqual(terms('DJ / Producer'), ['dj', 'producer']);
  assert.deepEqual(terms('record label'), ['record label']);
  assert.deepEqual(terms('on a label'), ['on a label']);
  assert.deepEqual(terms('For labels and multi-artist teams'), [
    'artist',
    'labels',
  ]);
  assert.deepEqual(terms('access labels and nav labels'), []);
});

test('identifiers and the locked headline are not violations', () => {
  const source = [
    "const href = 'artist-profile';",
    "const token = 'cta-label';",
    "const headline = 'Be found. Be understood.';",
    'export const line = "DJ / Producer";',
  ].join('\n');
  const found = violationsInSource(source, 'apps/web/data/example.ts', config);
  assert.deepEqual(
    found.ids.map(id => id.split(':')[0]),
    ['dj', 'producer']
  );
  assert.equal(config.lockedHeadline, 'Be found. Be understood.');
  const identity = readFileSync(
    `${REPO_ROOT}/apps/web/data/companyIdentity.ts`,
    'utf8'
  );
  assert.match(identity, /homepageHeadline: 'Be found\. Be understood\.'/);
});

test('audience routes are exempt and general routes are scanned', () => {
  const audience = 'apps/web/app/(marketing)/solutions/artists/page.tsx';
  assert.equal(isExemptPath(audience, config), true);
  assert.deepEqual(
    violationsInSource(
      "export const line = 'Built for artists';",
      audience,
      config
    ).ids,
    []
  );
  const files = collectScanFiles(REPO_ROOT, config);
  for (const file of [
    'apps/web/app/(home)/page.tsx',
    'apps/web/app/(marketing)/pricing/layout.tsx',
    'apps/web/data/companyIdentity.ts',
  ]) {
    assert.ok(files.includes(file), file);
  }
  for (const part of ['/solutions/', '/artist-profiles/', '/blog/']) {
    assert.equal(
      files.some(file => file.includes(part)),
      false,
      part
    );
  }
});

test('the baseline ratchet rejects new ids and refuses to grow', () => {
  const added = evaluateRatchet({
    current: ['artist:new.ts:abc'],
    recorded: [],
    ancestor: null,
  });
  assert.match(added.join('\n'), /do not add ids/);
  const removed = evaluateRatchet({
    current: [],
    recorded: ['artist:old.ts:abc'],
    ancestor: null,
  });
  assert.match(removed.join('\n'), /can only shrink/);
  const grown = evaluateRatchet({
    current: ['artist:new.ts:abc'],
    recorded: ['artist:new.ts:abc'],
    ancestor: ['artist:old.ts:def'],
  });
  assert.match(grown.join('\n'), /new violations are not allowed/);
  assert.deepEqual(
    evaluateRatchet({
      current: ['artist:old.ts:def'],
      recorded: ['artist:old.ts:def'],
      ancestor: ['artist:old.ts:def', 'fan:old.ts:fff'],
    }),
    []
  );
});

test('the recorded homepage and general-page baseline matches the tree', () => {
  const result = checkIcpLanguage();
  assert.deepEqual(result.failures, []);
  assert.equal(result.count, result.ids.length);
  assert.ok(result.count > 0);
});
