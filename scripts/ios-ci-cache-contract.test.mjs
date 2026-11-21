import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const workflow = readFileSync(
  path.join(repoRoot, '.github/workflows/ios-ci.yml'),
  'utf8'
);

test('iOS CI restores only immutable Swift package state before dependency resolution', () => {
  const cacheStart = workflow.indexOf(
    '      - name: Restore Swift package cache'
  );
  const resolveStart = workflow.indexOf(
    '      - name: Resolve Swift package dependencies'
  );

  assert.ok(cacheStart >= 0, 'SwiftPM cache step is required');
  assert.ok(
    resolveStart > cacheStart,
    'SwiftPM cache must restore before resolution'
  );
  assert.match(workflow, /\.build\/ios-ci\/SourcePackages/);
  assert.match(workflow, /~\/Library\/Caches\/org\.swift\.swiftpm/);
  assert.match(
    workflow,
    /Jovie\.xcodeproj\/project\.xcworkspace\/xcshareddata\/swiftpm\/Package\.resolved/
  );
  assert.match(workflow, /Jovie\.xcodeproj\/project\.pbxproj/);
  assert.match(workflow, /steps\.xcode-version\.outputs\.cache_key/);
  assert.match(
    workflow,
    /restore-keys:[\s\S]*steps\.xcode-version\.outputs\.cache_key[\s\S]*hashFiles\('apps\/ios\/Jovie\.xcodeproj\/project\.xcworkspace\/xcshareddata\/swiftpm\/Package\.resolved'\)/,
    'fallback restore must remain scoped to the Xcode and dependency lock versions'
  );
  assert.doesNotMatch(
    workflow.slice(cacheStart, resolveStart),
    /\.build\/ios-ci\n/,
    'mutable DerivedData build products must not be shared across jobs'
  );
});

test('iOS CI skips package resolve only on a full SwiftPM primary-key cache hit', () => {
  const cacheStart = workflow.indexOf(
    '      - name: Restore Swift package cache'
  );
  const resolveStart = workflow.indexOf(
    '      - name: Resolve Swift package dependencies'
  );
  const cacheBlock = workflow.slice(cacheStart, resolveStart);
  const resolveBlock = workflow.slice(
    resolveStart,
    workflow.indexOf('\n      - name:', resolveStart + 1)
  );

  assert.match(
    cacheBlock,
    /id: swiftpm-cache/,
    'cache step must expose cache-hit for the resolve gate'
  );
  assert.match(
    cacheBlock,
    /uses: actions\/cache\/restore@/,
    'hosted restore must not rely on post-job save (JOV-14016 early warm)'
  );
  assert.match(
    resolveBlock,
    /if: \$\{\{ steps\.swiftpm-cache\.outputs\.cache-hit != 'true' \}\}/,
    'resolve must run on miss, partial restore-keys hit, and self-hosted (skipped cache)'
  );
  assert.match(resolveBlock, /id: swiftpm-resolve/);
  assert.match(resolveBlock, /run-xcodebuild\.sh -resolvePackageDependencies/);
  assert.match(resolveBlock, /duration_seconds=/);
});

test('iOS CI records a SwiftPM cache receipt and saves on resolve success', () => {
  const saveStart = workflow.indexOf('      - name: Save Swift package cache');
  const receiptStart = workflow.indexOf(
    '      - name: Record SwiftPM cache receipt'
  );
  const uploadStart = workflow.indexOf(
    '      - name: Upload SwiftPM cache receipt'
  );
  assert.ok(saveStart > 0, 'explicit save step required');
  assert.ok(receiptStart > saveStart, 'receipt follows save');
  assert.ok(uploadStart > receiptStart, 'artifact upload follows receipt');

  const saveBlock = workflow.slice(
    saveStart,
    workflow.indexOf('\n      - name:', saveStart + 1)
  );
  const receiptBlock = workflow.slice(
    receiptStart,
    workflow.indexOf('\n      - name:', receiptStart + 1)
  );

  assert.match(saveBlock, /uses: actions\/cache\/save@/);
  assert.match(saveBlock, /steps\.swiftpm-resolve\.outcome == 'success'/);
  assert.match(saveBlock, /steps\.swiftpm-cache\.outputs\.cache-hit != 'true'/);
  assert.match(receiptBlock, /ios-ci-swiftpm-cache-receipt\.mjs/);
  assert.match(receiptBlock, /SWIFTPM_CACHE_HIT/);
  assert.match(receiptBlock, /SWIFTPM_RESOLVE_OUTCOME/);
  assert.match(receiptBlock, /if: \$\{\{ always\(\) && !cancelled\(\) \}\}/);
});
