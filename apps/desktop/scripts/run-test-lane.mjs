#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const scriptsRoot = join(desktopRoot, 'scripts');

function discover(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap(entry => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? discover(path) : [path];
    })
    .filter(path => /\.test\.(?:mjs|ts)$/.test(path))
    .sort();
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: desktopRoot,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const desktopTests = discover(scriptsRoot);
const nodeTests = desktopTests.filter(path => path.endsWith('.test.mjs'));
const vitestTests = desktopTests.filter(path => path.endsWith('.test.ts'));
const rootGuards = [
  '../../scripts/desktop-release-guard.test.mjs',
  '../../scripts/desktop-installed-apps-audit.test.mjs',
];

console.log(
  `Desktop lane: ${desktopTests.length} desktop files + ${rootGuards.length} root guards`
);
run(process.execPath, ['--test', ...nodeTests]);
run('pnpm', [
  'exec',
  'vitest',
  'run',
  '--config=vitest.config.mts',
  ...vitestTests.map(path => relative(desktopRoot, path)),
]);
run(process.execPath, ['--test', ...rootGuards]);
