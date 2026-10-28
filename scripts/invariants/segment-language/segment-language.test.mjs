import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  checkSegmentLanguage,
  loadConfig,
  readBaseline,
  scanSegmentLanguage,
  violationsInSource,
} from './check.mjs';

const config = loadConfig();

test('flags music words in an in-app string literal', () => {
  const found = violationsInSource(
    "const tip = 'Release your single on Friday';\n",
    'apps/web/components/jovie/Example.tsx',
    config
  );
  assert.ok([...found.keys()].some(id => id.startsWith('release:')));
});

test('ignores identifiers, comments, imports and single words', () => {
  const source = [
    "import { releaseThing } from '@/lib/release thing';",
    '// Release your single on Friday',
    "const a = 'artist-profile';",
    "const b = 'release';",
    "const c = 'Open your profile and review links';",
  ].join('\n');
  assert.equal(violationsInSource(source, 'x.ts', config).size, 0);
});

test('deliberate red: a new untagged segment string fails the ratchet', () => {
  const scanned = scanSegmentLanguage();
  const recorded = readBaseline();
  const planted = {
    ids: [
      ...scanned.ids,
      'release:apps/web/components/jovie/Planted.tsx:deadbeef00',
    ],
    samples: new Map(),
    files: scanned.files,
  };
  const result = checkSegmentLanguage(undefined, {
    scanned: planted,
    recorded,
    ancestor: { ok: true, ancestor: recorded },
  });
  assert.ok(result.failures.length > 0, 'a new violation must fail');
  assert.match(result.failures.join('\n'), /Planted\.tsx/u);
});

test('resolved violations must be removed from the baseline (shrink-only)', () => {
  const scanned = scanSegmentLanguage();
  const recorded = readBaseline();
  const stale = {
    ...recorded,
    ids: [...recorded.ids, 'artist:apps/web/lib/chat/Gone.ts:0000000000'],
    count: recorded.ids.length + 1,
  };
  const result = checkSegmentLanguage(undefined, {
    scanned,
    recorded: stale,
    ancestor: { ok: true, ancestor: recorded },
  });
  assert.ok(result.failures.length > 0);
});

test('live tree matches its baseline', () => {
  const recorded = readBaseline();
  const result = checkSegmentLanguage(undefined, {
    recorded,
    ancestor: { ok: true, ancestor: recorded },
  });
  assert.deepEqual(result.failures, []);
});
