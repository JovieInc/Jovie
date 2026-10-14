#!/usr/bin/env node
// Dependency-only bootstrap for the existing secret-free Codex Cloud lane.
import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function bootstrap(root, env = process.env) {
  const pin = readFileSync(resolve(root, '.nvmrc'), 'utf8').trim();
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  if (process.version !== `v${pin}`) {
    throw new Error(
      `Expected Node ${pin}; got ${process.version}. Activate the pinned runtime first.`
    );
  }
  if (!/^pnpm@\d+\.\d+\.\d+$/u.test(pkg.packageManager ?? '')) {
    throw new Error(
      'Expected an exact pnpm version in package.json packageManager.'
    );
  }
  const options = { cwd: root, env, encoding: 'utf8' };
  const version = spawnSync('pnpm', ['--version'], options);
  if (version.error) throw version.error;
  if (
    version.status !== 0 ||
    version.stdout.trim() !== pkg.packageManager.slice(5)
  ) {
    throw new Error(
      `pnpm must resolve ${pkg.packageManager}; dependency install was not attempted.`
    );
  }
  const install = spawnSync(
    'pnpm',
    ['install', '--frozen-lockfile', '--prefer-offline'],
    {
      ...options,
      env: {
        ...env,
        PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
        ONNXRUNTIME_NODE_INSTALL: 'skip',
      },
      stdio: 'inherit',
    }
  );
  if (install.error) throw install.error;
  if (install.status !== 0)
    throw new Error(
      `pnpm install failed (${install.status ?? install.signal}).`
    );
}

if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  bootstrap(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
}
