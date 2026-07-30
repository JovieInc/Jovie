import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { validateWorkflowReferences } from './verify-workflow-references.mjs';

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});

test('reports missing local actions, command paths, and workspace filters', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-refs-'));
  temporaryRoots.push(root);
  fs.mkdirSync(path.join(root, '.github', 'workflows'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.github', 'workflows', 'broken.yml'),
    `
name: broken
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: ./.github/actions/missing
      - run: node scripts/missing.mjs
      - run: pnpm --filter=@missing/app test
`
  );
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'root' })
  );

  assert.deepEqual(validateWorkflowReferences(root), [
    '.github/workflows/broken.yml:7: local action does not resolve: ./.github/actions/missing',
    '.github/workflows/broken.yml:8: command path does not resolve: scripts/missing.mjs',
    '.github/workflows/broken.yml:9: pnpm workspace filter does not resolve: @missing/app',
  ]);
});

test('reports a missing TestFlight validator before release', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-refs-'));
  temporaryRoots.push(root);
  fs.mkdirSync(path.join(root, '.github', 'workflows'), { recursive: true });
  fs.mkdirSync(path.join(root, 'apps', 'ios', 'scripts'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.github', 'workflows', 'ios-testflight.yml'),
    `
name: iOS TestFlight
jobs:
  upload:
    runs-on: macos-latest
    steps:
      - run: bash apps/ios/scripts/validate-testflight-env.sh
`
  );

  assert.deepEqual(validateWorkflowReferences(root), [
    '.github/workflows/ios-testflight.yml:7: command path does not resolve: apps/ios/scripts/validate-testflight-env.sh',
  ]);
});

test('passes when workflow references resolve', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-refs-'));
  temporaryRoots.push(root);
  fs.mkdirSync(path.join(root, '.github', 'workflows'), { recursive: true });
  fs.mkdirSync(path.join(root, '.github', 'actions', 'setup'), {
    recursive: true,
  });
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.github', 'actions', 'setup', 'action.yml'),
    'name: setup\nruns:\n  using: composite\n  steps: []\n'
  );
  fs.writeFileSync(path.join(root, 'scripts', 'check.mjs'), '');
  fs.writeFileSync(path.join(root, 'apps.json'), '');
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'root' })
  );
  fs.mkdirSync(path.join(root, 'apps', 'web'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'apps', 'web', 'package.json'),
    JSON.stringify({ name: '@actual/web' })
  );
  fs.writeFileSync(
    path.join(root, '.github', 'workflows', 'valid.yml'),
    `
name: valid
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: ./.github/actions/setup
      - run: node scripts/check.mjs
      - run: pnpm --filter=@actual/web test
`
  );

  assert.deepEqual(validateWorkflowReferences(root), []);
});
