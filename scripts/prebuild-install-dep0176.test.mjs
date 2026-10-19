import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ACCESS_MODE_PROBE = `
  const fs = require('node:fs');
  const vm = require('node:vm');
  const source = fs.readFileSync(process.argv[1], 'utf8');
  const expressions = [
    ...source.matchAll(/fs\\.access\\(\\s*[^,]+,\\s*([^,]+),/g),
  ].map(match => match[1].trim());
  if (expressions.length !== 3) {
    console.error('expected 3 fs.access modes, found ' + expressions.length);
    process.exit(2);
  }
  const expected = fs.constants.R_OK | fs.constants.W_OK;
  for (const expression of expressions) {
    const mode = vm.runInNewContext(expression, { fs });
    if (mode !== expected) {
      console.error(expression + ' resolved to ' + mode + ', expected ' + expected);
      process.exit(3);
    }
  }
`;

function installedDownloadPath() {
  const store = path.join(root, 'node_modules/.pnpm');
  const entry = readdirSync(store).find(name =>
    name.startsWith('better-sqlite3@')
  );
  assert.ok(entry, 'better-sqlite3 is installed');
  const require = createRequire(
    path.join(store, entry, 'node_modules/better-sqlite3/package.json')
  );
  return require.resolve('prebuild-install/download.js');
}

function probeAccessModes(downloadPath) {
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  return spawnSync(process.execPath, ['-e', ACCESS_MODE_PROBE, downloadPath], {
    encoding: 'utf8',
    env,
  });
}

test('better-sqlite3 install does not emit DEP0176 for fs.R_OK', () => {
  const downloadPath = installedDownloadPath();
  const source = readFileSync(downloadPath, 'utf8');
  assert.doesNotMatch(source, /\bfs\.(?:F_OK|R_OK|W_OK|X_OK)\b/);
  assert.match(source, /fs\.constants\.R_OK\s*\|\s*fs\.constants\.W_OK/);

  const probe = probeAccessModes(downloadPath);
  assert.equal(
    probe.status,
    0,
    probe.stderr || probe.stdout || 'access-mode probe failed'
  );
  assert.doesNotMatch(
    `${probe.stderr}\n${probe.stdout}`,
    /DEP0176|fs\.R_OK is deprecated|trace-deprecation/
  );
});
