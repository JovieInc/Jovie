#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { lstat, readdir, realpath, rm, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_NEXT_DEV_MAX_KIB = 2 * 1024 * 1024;
const DEFAULT_NEXT_DEV_MIN_AGE_MS = 7 * DAY_MS;
const DEFAULT_WORKTREE_NODE_MODULES_MAX_KIB = 1024 * 1024;
const DEFAULT_WORKTREE_NODE_MODULES_MIN_AGE_MS = DAY_MS;
const EXCLUDED_METADATA_ROOTS = new Set(['.git', '.kandan', 'node_modules']);

function usage() {
  return 'Usage: local-runtime-retention.mjs [--dry-run|--apply] [--repo-root <path>]';
}

function parseArgs(argv) {
  let mode = 'dry-run';
  let repoRoot = process.cwd();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') mode = 'dry-run';
    else if (arg === '--apply') mode = 'apply';
    else if (arg === '--repo-root') {
      if (!argv[index + 1])
        throw new Error(`${usage()}\nMissing --repo-root value`);
      repoRoot = argv[index + 1];
      index += 1;
    } else if (arg.startsWith('--repo-root=')) {
      repoRoot = arg.slice('--repo-root='.length);
    } else throw new Error(`${usage()}\nUnknown argument: ${arg}`);
  }

  return { mode, repoRoot: path.resolve(repoRoot) };
}

async function lstatOrNull(target) {
  try {
    return await lstat(target);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  }).trim();
}

function directorySizeKib(target) {
  const output = run('du', ['-sk', target]);
  const value = Number.parseInt(output.split(/\s+/u)[0] ?? '', 10);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Could not measure ${target}`);
  }
  return value;
}

async function newestMtimeMs(target) {
  const targetStats = await lstat(target);
  let newest = targetStats.mtimeMs;
  if (!targetStats.isDirectory() || targetStats.isSymbolicLink()) return newest;

  const entries = await readdir(target, {
    recursive: true,
    withFileTypes: true,
  });
  for (let index = 0; index < entries.length; index += 256) {
    const mtimes = await Promise.all(
      entries.slice(index, index + 256).map(async entry => {
        const parentPath = entry.parentPath ?? entry.path;
        return (await lstat(path.join(parentPath, entry.name))).mtimeMs;
      })
    );
    newest = Math.max(newest, ...mtimes);
  }
  return newest;
}

async function newestNextDevOutputMtimeMs(target) {
  let newest = 0;
  for (const entry of await readdir(target)) {
    // The cache subtree has its own size policy and deleting it updates the
    // parent mtime. Finder metadata is not evidence of a Next build.
    if (entry === 'cache' || entry === '.DS_Store') continue;
    newest = Math.max(newest, await newestMtimeMs(path.join(target, entry)));
  }
  return newest;
}

function isTestMode() {
  return process.env.JOVIE_CLEANUP_TEST_MODE === '1';
}

let openFileSnapshot;

function openFilePaths() {
  if (openFileSnapshot) return openFileSnapshot;
  let output;
  try {
    output = run('lsof', ['-Fn']);
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error('lsof unavailable');
    throw new Error('lsof ownership check failed');
  }
  openFileSnapshot = output
    .split('\n')
    .filter(line => line.startsWith('n/'))
    .map(line => path.resolve(line.slice(1)));
  return openFileSnapshot;
}

function pathIsActive(target, repoRoot, kind) {
  const resolvedTarget = path.resolve(target);
  if (isTestMode()) {
    return pathIsTestActive(target);
  }
  if (process.env.JOVIE_SETUP_CACHE_SKIP_OWNER_CHECK === '1') return false;

  if (kind === 'metadata') {
    try {
      return run('lsof', ['-Fn', '--', resolvedTarget])
        .split('\n')
        .some(line => line === `n${resolvedTarget}`);
    } catch (error) {
      if (error?.code === 'ENOENT') throw new Error('lsof unavailable');
      throw new Error('lsof ownership check failed');
    }
  }

  let openPaths;
  try {
    openPaths = openFilePaths();
  } catch (error) {
    console.warn(
      `  Preserved ${path.relative(repoRoot, target)}: ${error.message}`
    );
    return true;
  }
  if (
    openPaths.some(
      openPath =>
        openPath === resolvedTarget ||
        openPath.startsWith(`${resolvedTarget}${path.sep}`)
    )
  )
    return true;

  let processes;
  try {
    processes = run('ps', ['-axo', 'command=']);
  } catch {
    console.warn(
      `  Preserved ${path.relative(repoRoot, target)}: process check failed`
    );
    return true;
  }

  if (kind === 'next-dev') {
    return processes
      .split('\n')
      .some(
        command =>
          command.includes(repoRoot) &&
          /(?:next dev|next-server|turbo dev|pnpm(?: run)? dev:web)/u.test(
            command
          )
      );
  }
  return processes
    .split('\n')
    .some(command => command.includes(resolvedTarget));
}

function pathIsTestActive(target) {
  try {
    const targetStats = statSync(target);
    const marker = targetStats.isDirectory()
      ? path.join(target, '.jovie-retention-active-test')
      : `${target}.jovie-retention-active-test`;
    statSync(marker);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return false;
    return true;
  }
}

async function safeRealDirectory(target, parent) {
  const parentStats = await lstatOrNull(parent);
  if (!parentStats?.isDirectory() || parentStats.isSymbolicLink()) {
    return null;
  }
  const relative = path.relative(parent, target);
  if (
    relative === '' ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    return null;
  }

  let current = parent;
  let targetStats = null;
  for (const segment of relative.split(path.sep)) {
    if (!segment || segment === '.' || segment === '..') return null;
    current = path.join(current, segment);
    targetStats = await lstatOrNull(current);
    if (!targetStats?.isDirectory() || targetStats.isSymbolicLink()) {
      return null;
    }
  }

  const [targetRealPath, parentRealPath] = await Promise.all([
    realpath(target),
    realpath(parent),
  ]);
  if (targetRealPath !== path.join(parentRealPath, relative)) return null;
  return { realPath: targetRealPath, stats: targetStats };
}

async function removeCandidate(candidate, mode, repoRoot) {
  const relative = path.relative(repoRoot, candidate.path);
  if (mode === 'dry-run') {
    const size =
      candidate.kind === 'file'
        ? `${candidate.sizeBytes} bytes`
        : `${candidate.sizeKib} KiB`;
    console.log(`  Would remove ${relative} (${size}; ${candidate.reason})`);
    return 0;
  }

  const currentStats = await lstat(candidate.path);
  if (
    currentStats.isSymbolicLink() ||
    (candidate.kind === 'file'
      ? !currentStats.isFile()
      : !currentStats.isDirectory()) ||
    currentStats.dev !== candidate.dev ||
    currentStats.ino !== candidate.ino
  ) {
    throw new Error(`Refusing changed cleanup candidate: ${relative}`);
  }
  await candidate.revalidate();
  if (candidate.kind === 'file') {
    await unlink(candidate.path);
    console.log(
      `  Removed ${relative} (${candidate.sizeBytes} bytes; ${candidate.reason})`
    );
    return candidate.sizeBytes;
  }
  await rm(candidate.path, { recursive: true });
  console.log(
    `  Removed ${relative} (${candidate.sizeKib} KiB; ${candidate.reason})`
  );
  return candidate.sizeKib * 1024;
}

async function nextDevCandidate(repoRoot, nowMs) {
  const target = path.join(repoRoot, 'apps/web/.next/dev');
  const parent = path.dirname(target);
  const safe = await safeRealDirectory(target, parent);
  if (!safe) return null;

  const maxKib = isTestMode() ? 1 : DEFAULT_NEXT_DEV_MAX_KIB;
  const minAgeMs = isTestMode() ? 10_000 : DEFAULT_NEXT_DEV_MIN_AGE_MS;
  const sizeKib = directorySizeKib(target);
  const latestMtimeMs = await newestNextDevOutputMtimeMs(target);
  if (sizeKib <= maxKib || nowMs - latestMtimeMs < minAgeMs) return null;
  if (pathIsActive(target, repoRoot, 'next-dev')) {
    console.warn(
      '  Preserved apps/web/.next/dev: active owner or dev process detected'
    );
    return null;
  }

  return {
    dev: safe.stats.dev,
    ino: safe.stats.ino,
    kind: 'directory',
    path: target,
    reason: `older than ${Math.floor(minAgeMs / 1000)}s and over ${maxKib} KiB limit`,
    revalidate: async () => {
      const currentNewest = await newestNextDevOutputMtimeMs(target);
      if (nowMs - currentNewest < minAgeMs) {
        throw new Error('Refusing apps/web/.next/dev because it became young');
      }
      if (pathIsActive(target, repoRoot, 'next-dev')) {
        throw new Error('Refusing apps/web/.next/dev because it became active');
      }
    },
    sizeKib,
  };
}

function registeredWorktrees(repoRoot) {
  const output = run('git', [
    '-C',
    repoRoot,
    '-c',
    'core.quotePath=false',
    'worktree',
    'list',
    '--porcelain',
  ]);
  const registered = new Map();
  let current = null;
  for (const line of output.split('\n')) {
    if (line.startsWith('worktree ')) {
      current = { locked: false, path: path.resolve(line.slice(9)) };
      registered.set(current.path, current);
    } else if (line === 'locked' || line.startsWith('locked ')) {
      if (current) current.locked = true;
    } else if (line === '') current = null;
  }
  return registered;
}

function worktreeIsClean(worktreePath) {
  try {
    return (
      run('git', [
        '-C',
        worktreePath,
        'status',
        '--porcelain',
        '--untracked-files=normal',
      ]) === ''
    );
  } catch {
    return false;
  }
}

async function worktreeNodeModulesCandidates(repoRoot, nowMs) {
  const root = path.join(repoRoot, '.claude/worktrees');
  const rootSafe = await safeRealDirectory(root, repoRoot);
  if (!rootSafe) return [];
  const currentPath = await realpath(process.cwd());
  const registered = registeredWorktrees(repoRoot);
  const maxKib = isTestMode() ? 1 : DEFAULT_WORKTREE_NODE_MODULES_MAX_KIB;
  const minAgeMs = isTestMode()
    ? 10_000
    : DEFAULT_WORKTREE_NODE_MODULES_MIN_AGE_MS;
  const candidates = [];

  for (const name of await readdir(root)) {
    const worktreePath = path.join(root, name);
    const worktreeSafe = await safeRealDirectory(worktreePath, root);
    if (!worktreeSafe) continue;
    const registration = registered.get(worktreeSafe.realPath);
    if (
      !registration ||
      registration.locked ||
      worktreeSafe.realPath === currentPath
    ) {
      continue;
    }
    const target = path.join(worktreePath, 'node_modules');
    const targetSafe = await safeRealDirectory(target, worktreePath);
    if (!targetSafe) continue;
    const targetStats = await stat(target);
    const sizeKib = directorySizeKib(target);
    if (sizeKib <= maxKib || nowMs - targetStats.mtimeMs < minAgeMs) continue;
    if (!worktreeIsClean(worktreePath)) {
      console.warn(
        `  Preserved .claude/worktrees/${name}/node_modules: worktree is dirty`
      );
      continue;
    }
    if (pathIsActive(target, repoRoot, 'worktree')) {
      console.warn(
        `  Preserved .claude/worktrees/${name}/node_modules: worktree is active`
      );
      continue;
    }

    candidates.push({
      dev: targetSafe.stats.dev,
      ino: targetSafe.stats.ino,
      kind: 'directory',
      path: target,
      reason: `clean inactive worktree, older than ${Math.floor(minAgeMs / 1000)}s and over ${maxKib} KiB limit`,
      revalidate: async () => {
        const currentRegistration = registeredWorktrees(repoRoot).get(
          worktreeSafe.realPath
        );
        if (!currentRegistration || currentRegistration.locked) {
          throw new Error(`Refusing ${name}: registration changed`);
        }
        if (!worktreeIsClean(worktreePath)) {
          throw new Error(`Refusing ${name}: worktree became dirty`);
        }
        if (pathIsActive(target, repoRoot, 'worktree')) {
          throw new Error(`Refusing ${name}: worktree became active`);
        }
        const currentStats = await stat(target);
        if (nowMs - currentStats.mtimeMs < minAgeMs) {
          throw new Error(`Refusing ${name}: node_modules became young`);
        }
      },
      sizeKib,
    });
  }
  return candidates;
}

function metadataDirectoryIsExcluded(relativePath, name) {
  if (EXCLUDED_METADATA_ROOTS.has(name)) return true;
  return (
    relativePath === '.claude/worktrees' ||
    relativePath.startsWith(`.claude/worktrees${path.sep}`)
  );
}

async function finderMetadataCandidates(repoRoot) {
  const candidates = [];

  async function visit(directory) {
    const directoryStats = await lstat(directory);
    if (!directoryStats.isDirectory() || directoryStats.isSymbolicLink()) {
      throw new Error(
        `Refusing unsafe metadata traversal root: ${path.relative(repoRoot, directory) || '.'}`
      );
    }
    const directoryRealPath = await realpath(directory);
    if (
      directoryRealPath !== repoRoot &&
      !isWithin(repoRoot, directoryRealPath)
    ) {
      throw new Error(
        `Refusing metadata traversal outside repository: ${directory}`
      );
    }

    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      const relative = path.relative(repoRoot, target);
      const targetStats = await lstat(target);

      // Never enter symlinked trees. This also excludes shared dependency and
      // tool roots that are linked into the checkout.
      if (targetStats.isSymbolicLink()) continue;
      if (targetStats.isDirectory()) {
        if (metadataDirectoryIsExcluded(relative, entry.name)) continue;
        await visit(target);
        continue;
      }
      if (entry.name !== '.DS_Store' || !targetStats.isFile()) continue;

      const expectedRealPath = path.join(repoRoot, relative);
      candidates.push({
        dev: targetStats.dev,
        ino: targetStats.ino,
        kind: 'file',
        path: target,
        reason: 'Finder metadata in a repo-controlled tree',
        revalidate: async () => {
          const [currentStats, currentRealPath] = await Promise.all([
            lstat(target),
            realpath(target),
          ]);
          if (
            currentStats.isSymbolicLink() ||
            !currentStats.isFile() ||
            currentStats.dev !== targetStats.dev ||
            currentStats.ino !== targetStats.ino ||
            currentRealPath !== expectedRealPath
          ) {
            throw new Error(`Refusing changed Finder metadata: ${relative}`);
          }
          if (pathIsActive(target, repoRoot, 'metadata')) {
            throw new Error(`Refusing active Finder metadata: ${relative}`);
          }
        },
        sizeBytes: targetStats.size,
      });
    }
  }

  await visit(repoRoot);
  return candidates;
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const repoStats = await lstat(parsed.repoRoot);
  if (!repoStats.isDirectory() || repoStats.isSymbolicLink()) {
    throw new Error(
      `Repository root is not a real directory: ${parsed.repoRoot}`
    );
  }
  const repoRoot = await realpath(parsed.repoRoot);
  const { mode } = parsed;
  const nowMs = Date.now();
  // Remove file candidates first because a later directory candidate can own
  // the same subtree (for example stale .next/dev output).
  const candidates = await finderMetadataCandidates(repoRoot);
  const nextCandidate = await nextDevCandidate(repoRoot, nowMs);
  if (nextCandidate) candidates.push(nextCandidate);
  candidates.push(...(await worktreeNodeModulesCandidates(repoRoot, nowMs)));

  let reclaimedBytes = 0;
  for (const candidate of candidates) {
    // Every apply candidate gets a fresh ownership snapshot immediately before
    // revalidation. Later candidates must not trust an earlier lsof result.
    if (mode === 'apply') openFileSnapshot = undefined;
    reclaimedBytes += await removeCandidate(candidate, mode, repoRoot);
  }
  console.log(
    `  Local runtime retention ${mode} complete: ${candidates.length} candidate(s), ${reclaimedBytes} bytes reclaimed`
  );
}

main().catch(error => {
  console.error(`Local runtime retention failed: ${error.message}`);
  process.exitCode = 1;
});
