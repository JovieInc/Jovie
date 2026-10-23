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

test('word boundaries match segment words and miss lookalikes', () => {
  assert.deepEqual(matchTerms('for artists and musicians', config.terms), [
    'artist',
    'musician',
  ]);
  assert.deepEqual(
    matchTerms('artistic musical fancy founded', config.terms),
    []
  );
  assert.deepEqual(matchTerms('authority bandwidth', config.terms), []);
  assert.deepEqual(matchTerms('musicians', config.terms), ['musician']);
  assert.deepEqual(matchTerms('music', config.terms), ['music']);
  assert.ok(!matchTerms('musicians', config.terms).includes('music'));
  assert.deepEqual(matchTerms('DJ / Producer', config.terms), [
    'dj',
    'producer',
  ]);
  assert.deepEqual(matchTerms('record label', config.terms), ['record label']);
  assert.deepEqual(matchTerms('on a label', config.terms), ['on a label']);
  assert.deepEqual(
    matchTerms(
      'For labels and multi-artist teams',
      config.terms,
      config.suppressedPrefixes
    ),
    ['artist', 'labels']
  );
  assert.deepEqual(
    matchTerms(
      'access labels and nav labels',
      config.terms,
      config.suppressedPrefixes
    ),
    []
  );
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
  const found = violationsInSource(
    "export const line = 'Built for artists';",
    audience,
    config
  );
  assert.deepEqual(found.ids, []);

  const files = collectScanFiles(REPO_ROOT, config);
  assert.ok(files.includes('apps/web/app/(home)/page.tsx'));
  assert.ok(files.includes('apps/web/app/(marketing)/pricing/layout.tsx'));
  assert.ok(files.includes('apps/web/data/companyIdentity.ts'));
  assert.equal(
    files.some(file => file.includes('/solutions/')),
    false
  );
  assert.equal(
    files.some(file => file.includes('/artist-profiles/')),
    false
  );
  assert.equal(
    files.some(file => file.includes('/blog/')),
    false
  );
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
  assert.deepEqual(
    evaluateRatchet({
      current: ['artist:old.ts:def'],
      recorded: ['artist:old.ts:def'],
      ancestor: ['artist:old.ts:def'],
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
