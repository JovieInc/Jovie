import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  checkGuard,
  countsOf,
  inScope,
  RATCHET_PATH,
  scanRepo,
  scanSource,
  writeRatchet,
} from '../guard-test-network-guard.mjs';

const root = resolve(import.meta.dirname, '..', '..', '..');

test('only guard-test files are in scope, never the guard itself', () => {
  assert.equal(inScope('.github/scripts/update-quarantine.test.js'), true);
  assert.equal(inScope('scripts/lib/__tests__/flake-ledger.test.mjs'), true);
  assert.equal(inScope('scripts/lib/external-api-guard.mjs'), false);
  assert.equal(inScope('apps/web/tests/unit/ci/example.test.ts'), false);
  assert.equal(inScope('scripts/lib/guard-test-network-guard.test.mjs'), false);
});

test('a live GitHub API call in a guard test is flagged with its line', () => {
  const source = [
    "import { execFileSync } from 'node:child_process';",
    "export const live = () => execFileSync('gh', ['api', 'repos/x/y']);",
    "export const direct = 'https://api.github.com/repos/x/y';",
  ].join('\n');
  const hits = scanSource('.github/scripts/example.test.mjs', source);
  assert.deepEqual(countsOf({ '.github/scripts/example.test.mjs': hits }), {
    '.github/scripts/example.test.mjs': {
      'gh-subprocess': 1,
      'provider-host': 1,
    },
  });
});

test('injected and stubbed transports produce no hits', () => {
  const source = [
    "import { recordRun } from './flake-ledger.mjs';",
    'const result = recordRun(ledger, run, { execute: fakeExecute });',
    'const api = injectedApi; // the workflow owns real reads',
  ].join('\n');
  assert.deepEqual(
    scanSource('scripts/lib/__tests__/example.test.mjs', source),
    {}
  );
});

test('a new gh subprocess names its fix; a path shim is hermetic', () => {
  const live = "spawnSync('gh', ['api', 'repos/x/y']);\n";
  const path = 'scripts/lib/__tests__/new-live.test.mjs';
  const errors = checkGuard({ [path]: scanSource(path, live) }, {});
  assert.equal(errors.length, 1);
  assert.match(errors[0], /inject a fake execute\/api function/);
  assert.doesNotMatch(errors[0], /Fix: undefined/);
  const hermetic = "spawnSync(join(bin, 'gh'), ['pr', 'view', '1']);\n";
  assert.deepEqual(
    scanSource('scripts/lib/__tests__/hermetic-shim.test.mjs', hermetic),
    {}
  );
});

test('growth fails, equal passes, shrink never fails', () => {
  const found = { 'a.test.mjs': { 'provider-host': { count: 2, lines: [1] } } };
  assert.equal(
    checkGuard(found, { 'a.test.mjs': { 'provider-host': 1 } }).length,
    1
  );
  assert.deepEqual(
    checkGuard(found, { 'a.test.mjs': { 'provider-host': 2 } }),
    []
  );
  assert.deepEqual(
    checkGuard(found, { 'a.test.mjs': { 'provider-host': 5 } }),
    []
  );
});

test('writeRatchet locks floors at measured counts and never raises', () => {
  const current = {
    schema: 'jovie-guard-test-network-ratchet/v1',
    entries: { 'a.test.mjs': { 'provider-host': 5 } },
  };
  const found = { 'a.test.mjs': { 'provider-host': { count: 2, lines: [1] } } };
  const next = writeRatchet(current, found);
  assert.equal(next.entries['a.test.mjs']['provider-host'], 2);
  const raised = writeRatchet(current, {
    'a.test.mjs': { 'provider-host': { count: 9, lines: [1] } },
  });
  assert.equal(raised.entries['a.test.mjs']['provider-host'], 5);
});

test('the real tree honors the committed ratchet (the JOV-13105 contract)', () => {
  assert.equal(existsSync(resolve(root, RATCHET_PATH)), true);
  const ratchet = JSON.parse(readFileSync(resolve(root, RATCHET_PATH), 'utf8'));
  assert.equal(ratchet.schema, 'jovie-guard-test-network-ratchet/v1');
  const errors = checkGuard(scanRepo(root), ratchet.entries ?? {});
  assert.deepEqual(errors, []);
});
