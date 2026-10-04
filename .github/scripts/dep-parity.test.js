'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { extractResolvedVersions, diffDigests } = require('./dep-parity.js');

test('identical declared versions still expose different installed js-yaml versions', () => {
  const { installedVersions } = require('./dep-parity.js');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'installed-parity-'));
  try {
    const make = version => {
      const dir = path.join(root, version);
      fs.mkdirSync(dir);
      fs.writeFileSync(
        path.join(dir, 'package.json'),
        JSON.stringify({ name: 'js-yaml', version })
      );
      return [{ dependencies: { 'js-yaml': { version: '5.0.0', path: dir } } }];
    };
    assert.deepStrictEqual(installedVersions(make('4.1.0')), {
      'js-yaml': ['4.1.0'],
    });
    assert.deepStrictEqual(installedVersions(make('5.0.0')), {
      'js-yaml': ['5.0.0'],
    });
    assert.throws(() => installedVersions([]), /Missing installed/);
    assert.throws(
      () =>
        installedVersions([
          { dependencies: { 'js-yaml': { version: '5.0.0' } } },
        ]),
      /Missing installed/
    );
    assert.throws(() => installedVersions([{}]), /Empty installed/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('private versionless workspaces retain transitive installed versions without inventing a source version', () => {
  const { installedVersions } = require('./dep-parity.js');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-parity-'));
  try {
    const child = path.join(root, 'node_modules', 'child');
    fs.mkdirSync(child, { recursive: true });
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({
        name: '@jovie/private',
        private: true,
        dependencies: { child: '^1' },
      })
    );
    fs.writeFileSync(
      path.join(child, 'package.json'),
      JSON.stringify({ name: 'child', version: 'v1.0.0-beta.1+build' })
    );
    assert.deepStrictEqual(
      installedVersions([{ dependencies: { workspace: { path: root } } }]),
      { child: ['v1.0.0-beta.1+build'] }
    );
    fs.rmSync(child, { recursive: true });
    assert.throws(
      () =>
        installedVersions([{ dependencies: { workspace: { path: root } } }]),
      /Missing installed dependency/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

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
