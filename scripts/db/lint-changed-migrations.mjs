#!/usr/bin/env node
/**
 * Lint Postgres migration SQL that this diff adds or changes.
 * Files already on the base and absent from the diff are never passed to Squawk.
 *
 * Usage: node scripts/db/lint-changed-migrations.mjs --base <git-rev>
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SQUAWK_VERSION = '2.70.0';
export const SQUAWK_CONFIG = 'scripts/db/squawk.toml';
export const MIGRATION_PREFIX = 'apps/web/drizzle/migrations/';
/** sha256 of the official v2.70.0 release binaries. */
export const SQUAWK_SHA256 = Object.freeze({
  x64: '836ba2ab0c0ec30ae02c9f2cec065b341ff853765ceaa3965c22109c2f53eb1c',
  arm64: 'fdb1ceff1d45252ccce44be8888d45a45206ba901804713124b0aa6eacc92e0e',
});

const KNOWN_STATUS = new Set(['A', 'C', 'D', 'M', 'R', 'T']);

/**
 * The injected runner exposes the fields this linter consumes. Git requests
 * UTF-8 output; Squawk only needs an exit status.
 * @callback RunCommand
 * @param {string} command
 * @param {string[]} args
 * @param {import('node:child_process').SpawnSyncOptions} options
 * @returns {{ status: number | null, stdout?: string | Buffer, stderr?: string | Buffer }}
 */

/**
 * @param {string} nameStatus `git diff --name-status` text
 * @returns {string[]} repo-relative SQL paths to lint
 */
export function parseChangedMigrationSql(nameStatus) {
  const files = [];
  for (const line of nameStatus.split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    const status = parts[0] ?? '';
    const code = status[0] ?? '';
    if (!KNOWN_STATUS.has(code)) {
      throw new Error(`Unrecognized migration diff status: ${line}`);
    }
    if (code === 'D') continue;
    const path = code === 'R' || code === 'C' ? parts[2] : parts[1];
    if (!path) throw new Error(`Migration diff is missing a path: ${line}`);
    if (isChangedMigrationSql(path)) files.push(path);
  }
  return [...new Set(files)];
}

/** @param {string} file */
export function isChangedMigrationSql(file) {
  const normalized = file.replaceAll('\\', '/');
  if (normalized.split('/').includes('..')) return false;
  if (!normalized.startsWith(MIGRATION_PREFIX)) return false;
  if (normalized.startsWith(`${MIGRATION_PREFIX}meta/`)) return false;
  return normalized.endsWith('.sql');
}

/**
 * @param {Buffer} bytes
 * @param {string} expected
 */
export function assertSha256(bytes, expected) {
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== expected) {
    throw new Error(
      `Squawk checksum mismatch: expected ${expected}, got ${actual}`
    );
  }
}

/**
 * @param {{ fetchImpl?: typeof fetch, arch?: string, platform?: string }} [options]
 */
export async function installSquawk(options = {}) {
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  if (platform !== 'linux' || (arch !== 'x64' && arch !== 'arm64')) {
    throw new Error(
      `Squawk install supports linux x64/arm64 only (${platform} ${arch}). Set SQUAWK_BIN.`
    );
  }
  const asset = `squawk-linux-${arch}`;
  const url = `https://github.com/sbdchd/squawk/releases/download/v${SQUAWK_VERSION}/${asset}`;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(
      `Squawk ${SQUAWK_VERSION} download failed: ${response.status} ${url}`
    );
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  assertSha256(bytes, SQUAWK_SHA256[arch]);
  const bin = join(mkdtempSync(join(tmpdir(), 'squawk-')), 'squawk');
  writeFileSync(bin, bytes);
  chmodSync(bin, 0o755);
  return bin;
}

/**
 * @param {string} repoRoot
 * @param {string} base
 * @param {string} head
 * @param {RunCommand} run
 */
export function readMigrationDiff(repoRoot, base, head, run = spawnSync) {
  const result = run(
    'git',
    [
      'diff',
      '--name-status',
      '--find-renames',
      '--diff-filter=ACMRT',
      `${base}...${head}`,
      '--',
      MIGRATION_PREFIX,
    ],
    { cwd: repoRoot, encoding: 'utf8' }
  );
  if (result.status !== 0) {
    throw new Error(
      result.stderr?.toString().trim() ||
        `git diff failed for ${base}...${head}`
    );
  }
  return result.stdout?.toString() ?? '';
}

/**
 * @param {{
 *   repoRoot: string,
 *   base: string,
 *   head?: string,
 *   nameStatus?: string,
 *   squawkBin?: string,
 *   run?: RunCommand,
 *   fetchImpl?: typeof fetch,
 *   platform?: string,
 *   arch?: string,
 *   stdio?: 'inherit' | 'pipe',
 * }} options
 */
export async function lintChangedMigrations(options) {
  const nameStatus =
    options.nameStatus ??
    readMigrationDiff(
      options.repoRoot,
      options.base,
      options.head ?? 'HEAD',
      options.run
    );
  const files = parseChangedMigrationSql(nameStatus);
  if (files.length === 0) {
    return { status: 0, files, invoked: false };
  }
  const bin =
    options.squawkBin ??
    process.env.SQUAWK_BIN ??
    (await installSquawk({
      fetchImpl: options.fetchImpl,
      platform: options.platform,
      arch: options.arch,
    }));
  const args = ['--config', join(options.repoRoot, SQUAWK_CONFIG), ...files];
  const result = (options.run ?? spawnSync)(bin, args, {
    cwd: options.repoRoot,
    stdio: options.stdio ?? 'inherit',
  });
  return { status: result.status ?? 1, files, invoked: true };
}

function baseFromArgv(argv) {
  const index = argv.indexOf('--base');
  const base = index === -1 ? '' : (argv[index + 1] ?? '');
  if (!base || base.startsWith('-')) {
    throw new Error(
      'Usage: node scripts/db/lint-changed-migrations.mjs --base <git-rev>'
    );
  }
  return base;
}

async function main() {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
  const result = await lintChangedMigrations({
    repoRoot,
    base: baseFromArgv(process.argv.slice(2)),
  });
  if (!result.invoked) {
    console.log(
      'No added or changed migration SQL. Pre-existing migrations were not linted.'
    );
  }
  process.exitCode = result.status;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
