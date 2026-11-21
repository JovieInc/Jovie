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
    resolveBlock,
    /if: \$\{\{ steps\.swiftpm-cache\.outputs\.cache-hit != 'true' \}\}/,
    'resolve must run on miss, partial restore-keys hit, and self-hosted (skipped cache)'
  );
  assert.match(resolveBlock, /run-xcodebuild\.sh -resolvePackageDependencies/);
});
