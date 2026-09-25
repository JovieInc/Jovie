'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { extractResolvedVersions, diffDigests } = require('./dep-parity.js');

test('extractResolvedVersions pulls name->versions from lockfile text', () => {
  const lockfile = [
    'packages:',
    '  /js-yaml@4.1.0:',
    '    resolution: {integrity: sha512-x}',
    '  /@scope/pkg@2.0.0:',
    '    resolution: {integrity: sha512-y}',
    "  '@scope/other@1.0.0-beta.1':",
    '    resolution: {integrity: sha512-z}',
  ].join('\n');
  const resolved = extractResolvedVersions(lockfile);
  assert.deepStrictEqual(resolved['js-yaml'], ['4.1.0']);
  assert.deepStrictEqual(resolved['@scope/pkg'], ['2.0.0']);
  assert.deepStrictEqual(resolved['@scope/other'], ['1.0.0-beta.1']);
});

test('extractResolvedVersions collects multiple versions per package', () => {
  const lockfile = '  /foo@1.0.0:\n  /foo@2.0.0:\n';
  assert.deepStrictEqual(extractResolvedVersions(lockfile).foo, [
    '1.0.0',
    '2.0.0',
  ]);
});

test('diffDigests names the differing package and versions (js-yaml v5/v4)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dep-parity-'));
  const pr = {
    lockfileSha: 'a'.repeat(64),
    resolved: { 'js-yaml': ['4.1.0'], left: ['1.0.0'] },
  };
  const mg = {
    lockfileSha: 'b'.repeat(64),
    resolved: { 'js-yaml': ['5.0.0'], left: ['1.0.0'] },
  };
  const aPath = path.join(dir, 'pr.json');
  const bPath = path.join(dir, 'mg.json');
  fs.writeFileSync(aPath, JSON.stringify(pr));
  fs.writeFileSync(bPath, JSON.stringify(mg));

  const diffs = diffDigests(aPath, bPath);
  assert.ok(diffs.some(d => d.includes('lockfile sha differs')));
  assert.ok(
    diffs.some(
      d => d.includes('js-yaml') && d.includes('4.1.0') && d.includes('5.0.0')
    ),
    `expected js-yaml diff, got: ${diffs.join(' | ')}`
  );
  assert.ok(!diffs.some(d => d.startsWith('left:')));
});

test('diffDigests returns empty for identical digests', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dep-parity-'));
  const digest = {
    lockfileSha: 'c'.repeat(64),
    resolved: { 'js-yaml': ['4.1.0'] },
  };
  const aPath = path.join(dir, 'a.json');
  const bPath = path.join(dir, 'b.json');
  fs.writeFileSync(aPath, JSON.stringify(digest));
  fs.writeFileSync(bPath, JSON.stringify(digest));
  assert.deepStrictEqual(diffDigests(aPath, bPath), []);
});
