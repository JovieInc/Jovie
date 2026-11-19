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
 *
 * Offline-first (Tim, 2026-11-19): agent jobs run against a warm pnpm store,
 * so the first attempt is `--offline` — a routine job never touches the
 * registry and never trips a per-thread network-access prompt. When the store
 * is cold or incomplete the install falls back ONCE to `--prefer-offline`
 * (cache first, registry only for the missing remainder); if that also fails,
 * the install fails closed and reports the limitation instead of retrying.
 *
 * Exception: jobs that add/bump/remove dependencies (lockfile changes) need
 * normal registry access — run a plain networked
 * `pnpm install --frozen-lockfile` there instead. See
 * .claude/rules/environment.md.
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
  /** pnpm can exit successfully at an unanswered modules-replacement prompt. */
  const installEnv = {
    ...env,
    CI: 'true',
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
    ONNXRUNTIME_NODE_INSTALL: 'skip',
  };
  const spawnInstall = args =>
    spawnSync('pnpm', args, {
      ...options,
      env: installEnv,
      stdio: 'inherit',
    });
  // Offline first: a warm store satisfies everything without the registry.
  const install = spawnInstall(['install', '--offline', '--frozen-lockfile']);
  if (install.error) throw install.error;
  if (install.status === 0) return;
  // A nonzero exit with no spawn error means pnpm ran and the store could not
  // satisfy the lockfile (cold/incomplete). Fall back once to prefer-offline;
  // an executable problem (error above) is not a store problem — no fallback.
  const retry = spawnInstall([
    'install',
    '--prefer-offline',
    '--frozen-lockfile',
  ]);
  if (retry.error) throw retry.error;
  if (retry.status !== 0)
    throw new Error(
      `pnpm install failed (${retry.status ?? retry.signal}) after the ` +
        'offline attempt too; the store is cold or incomplete and the ' +
        'registry is unavailable — let CI verify this change.'
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
