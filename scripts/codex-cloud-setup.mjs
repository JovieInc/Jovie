#!/usr/bin/env node
// The one frozen dependency install every agent session start runs
// (JOV-12623): `scripts/setup.sh` and `.claude/hooks/session-start.sh` call
// `node scripts/codex-cloud-setup.mjs install`; the secret-free Codex Cloud
// lane calls it with no argument, which also requires the exact .nvmrc Node.
import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Installs the lockfile exactly, with the pnpm that package.json's
 * packageManager pins. Never rewrites pnpm-lock.yaml.
 */
export function frozenInstall(root, env = process.env) {
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  if (!/^pnpm@\d+\.\d+\.\d+$/u.test(pkg.packageManager ?? '')) {
    throw new Error(
      'Expected an exact pnpm version in package.json packageManager.'
    );
  }
  /** @type {import('node:child_process').SpawnSyncOptionsWithStringEncoding} */
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
        // pnpm can exit successfully at an unanswered modules-replacement prompt.
        CI: 'true',
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

/** Secret-free Codex Cloud lane: exact .nvmrc Node, then the frozen install. */
export function bootstrap(root, env = process.env) {
  const pin = readFileSync(resolve(root, '.nvmrc'), 'utf8').trim();
  if (process.version !== `v${pin}`) {
    throw new Error(
      `Expected Node ${pin}; got ${process.version}. Activate the pinned runtime first.`
    );
  }
  frozenInstall(root, env);
}

/** CLI: `install` runs the frozen install alone; no argument runs bootstrap. */
export function main(args, root, env = process.env) {
  const [command] = args;
  if (command === 'install') frozenInstall(root, env);
  else if (command === undefined) bootstrap(root, env);
  else {
    console.error(`Unknown command: ${command}. Usage: [install]`);
    return 2;
  }
  return 0;
}

if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = main(
    process.argv.slice(2),
    resolve(dirname(fileURLToPath(import.meta.url)), '..')
  );
}
