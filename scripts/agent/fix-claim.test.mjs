import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findOverlappingFixes, main, parseArgs } from './fix-claim.mjs';

const BOUNDARY = 'packages/shared-lib/src/eve-core-chat-boundary.test.ts';
const prs = [
  {
    number: 1354,
    title: 'fix(test): skip symlinks',
    files: [{ path: BOUNDARY }],
  },
  {
    number: 1352,
    title: 'ci(ios): path filter',
    body: 'Main is red: eve-core-chat-boundary.test.ts hits EISDIR.',
    files: [{ path: '.github/scripts/detect-changes.test.mjs' }],
  },
  { number: 1347, title: 'ci(ios): caches', files: [{ path: 'ios/Podfile' }] },
];

test('finds open PRs sharing a file or naming the failing test (LYB EISDIR, 2026-10-12)', () => {
  const overlaps = findOverlappingFixes({
    prs,
    files: [BOUNDARY],
    tests: ['eve-core-chat-boundary.test.ts'],
  });
  assert.deepEqual(
    overlaps.map(item => [item.number, item.sharedFiles, item.namedTests]),
    [
      [1352, [], ['eve-core-chat-boundary.test.ts']],
      [1354, [BOUNDARY], []],
    ]
  );
  assert.deepEqual(
    findOverlappingFixes({ prs, files: [BOUNDARY], self: 1354 }),
    [],
    'your own PR is not a duplicate'
  );
  assert.deepEqual(findOverlappingFixes({ prs, files: ['nothing.ts'] }), []);
});

test('the CLI exits 2 on an overlap, 0 when clear, and needs a target', () => {
  const calls = [];
  const gh = args => {
    calls.push(args);
    return JSON.stringify(prs);
  };
  assert.equal(
    main(['--repo', 'JovieInc/LogYourBody', '--file', BOUNDARY], { gh }).code,
    2
  );
  assert.deepEqual(calls[0].slice(0, 4), [
    'pr',
    'list',
    '--repo',
    'JovieInc/LogYourBody',
  ]);
  assert.equal(main(['--test', 'unrelated.test.ts'], { gh }).code, 0);
  assert.equal(main(['--test', 'x'], { gh: () => '' }).code, 0);
  assert.throws(() => parseArgs([]), /--file or --test/);
  assert.throws(() => parseArgs(['--file']), /needs a value/);
  assert.throws(() => parseArgs(['--bogus', 'x']), /unknown flag/);
  assert.deepEqual(parseArgs(['--self', '7', '--file', 'a']).self, 7);
});
