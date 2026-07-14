#!/usr/bin/env node

import { lstat, mkdir, readdir, realpath, rm } from 'node:fs/promises';
import path from 'node:path';

const COMPLETED_LIMIT = 2;
const FAILED_LIMIT = 3;
const FAILED_MIN_AGE_MS = 24 * 60 * 60 * 1000;
const STALE_INCOMPLETE_MS = 7 * 24 * 60 * 60 * 1000;
const MARKERS = {
  completed: '.jovie-run-completed',
  failed: '.jovie-run-failed',
  inProgress: '.jovie-run-in-progress',
};

const IOS_PRODUCERS = {
  'ios-launch': {
    relativeRoot: 'artifacts/ios-test-results/launch-performance',
    runPattern:
      /^Test-Jovie-launch-performance-\d{4}\.\d{2}\.\d{2}_\d{2}-\d{2}-\d{2}[+-]\d{4}$/,
  },
  'ios-memory': {
    relativeRoot: 'artifacts/ios-test-results/memory-baseline',
    runPattern:
      /^Jovie-memory-baseline-\d{4}\.\d{2}\.\d{2}_\d{2}-\d{2}-\d{2}-[+-]\d{4}$/,
  },
  'ios-runtime': {
    relativeRoot: 'artifacts/ios-test-results/runtime-performance',
    runPattern:
      /^Test-Jovie-runtime-performance-\d{4}\.\d{2}\.\d{2}_\d{2}-\d{2}-\d{2}[+-]\d{4}$/,
  },
};

const RESET_TARGETS = {
  'ios-screenshots': {
    allowBaseTarget: true,
    allowedBase: 'artifacts/ios-screenshots',
    defaultPath: 'artifacts/ios-screenshots',
  },
  'ios-screenshot-derived-data': {
    allowedBase: '.build',
    defaultPath: '.build/ios-screenshots',
  },
  'ios-memory-derived-data': {
    allowedBase: '.build',
    defaultPath: '.build/ios-memory-baseline',
  },
  'web-test-benchmark': {
    allowedBase: 'apps/web/test-results/benchmark-test-performance',
    defaultPath: 'apps/web/test-results/benchmark-test-performance/latest',
  },
};

function usage() {
  return [
    'Usage:',
    '  performance-artifact-retention.mjs retain <producer> [--repo-root <path>] [--dry-run|--apply]',
    '  performance-artifact-retention.mjs reset <target> [path] [--repo-root <path>] [--dry-run|--apply]',
  ].join('\n');
}

function parseArguments(argv) {
  const [operation, name, ...rest] = argv;
  let repoRoot = process.cwd();
  let mode = 'apply';
  let requestedPath;

  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (argument === '--repo-root') {
      repoRoot = rest[index + 1];
      index += 1;
    } else if (argument === '--dry-run') {
      mode = 'dry-run';
    } else if (argument === '--apply') {
      mode = 'apply';
    } else if (!requestedPath) {
      requestedPath = argument;
    } else {
      throw new Error(`Unexpected argument: ${argument}`);
    }
  }

  if (!operation || !name || !repoRoot) {
    throw new Error(usage());
  }

  return { mode, name, operation, repoRoot, requestedPath };
}

async function pathType(target) {
  try {
    return await lstat(target);
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined;
    throw error;
  }
}

function assertContained(target, base, label, allowBase = false) {
  const relative = path.relative(base, target);
  if (
    relative.startsWith(`..${path.sep}`) ||
    relative === '..' ||
    path.isAbsolute(relative) ||
    (!allowBase && relative === '')
  ) {
    throw new Error(`${label} must be a producer-owned descendant of ${base}`);
  }
}

async function assertCanonicalAncestors(repoRoot, target) {
  assertContained(target, repoRoot, 'Artifact path', true);

  let cursor = target;
  const missing = [];
  while (!(await pathType(cursor))) {
    missing.push(cursor);
    const parent = path.dirname(cursor);
    if (parent === cursor) {
      throw new Error(`Unable to find an existing ancestor for ${target}`);
    }
    cursor = parent;
  }

  const cursorInfo = await lstat(cursor);
  if (cursorInfo.isSymbolicLink()) {
    throw new Error(
      `Refusing artifact path below symlinked ancestor: ${cursor}`
    );
  }
  if ((await realpath(cursor)) !== cursor) {
    throw new Error(`Refusing non-canonical artifact ancestor: ${cursor}`);
  }

  for (const missingPath of missing.reverse()) {
    assertContained(missingPath, repoRoot, 'Artifact path', true);
  }
}

async function scanTree(target) {
  const info = await lstat(target);
  if (info.isSymbolicLink()) {
    throw new Error(`Refusing artifact tree containing a symlink: ${target}`);
  }

  let newestMtimeMs = info.mtimeMs;
  let bytes = info.isFile() ? info.size : 0;
  if (!info.isDirectory()) return { bytes, newestMtimeMs };

  const entries = await readdir(target);
  for (const entry of entries) {
    const scanned = await scanTree(path.join(target, entry));
    bytes += scanned.bytes;
    newestMtimeMs = Math.max(newestMtimeMs, scanned.newestMtimeMs);
  }
  return { bytes, newestMtimeMs };
}

function runState(isCompleted, isFailed, isInProgress) {
  const markerCount = [isCompleted, isFailed, isInProgress].filter(
    Boolean
  ).length;
  if (markerCount > 1) return 'invalid';
  if (isCompleted) return 'completed';
  if (isFailed) return 'failed';
  if (isInProgress) return 'in-progress';
  return 'unmarked';
}

async function readRunState(runPath) {
  const [completedInfo, failedInfo, inProgressInfo] = await Promise.all([
    pathType(path.join(runPath, MARKERS.completed)),
    pathType(path.join(runPath, MARKERS.failed)),
    pathType(path.join(runPath, MARKERS.inProgress)),
  ]);
  const markerInfos = [completedInfo, failedInfo, inProgressInfo];
  return {
    newestMarkerMtimeMs: Math.max(
      0,
      ...markerInfos.map(info => info?.mtimeMs ?? 0)
    ),
    state: runState(...markerInfos.map(info => Boolean(info?.isFile()))),
  };
}

async function retainRuns(repoRoot, producerName, mode) {
  const producer = IOS_PRODUCERS[producerName];
  if (!producer) throw new Error(`Unknown retention producer: ${producerName}`);

  const root = path.join(repoRoot, producer.relativeRoot);
  await assertCanonicalAncestors(repoRoot, root);
  const rootInfo = await pathType(root);
  if (!rootInfo) return { removed: 0, bytes: 0 };
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    throw new Error(
      `Refusing non-directory or symlinked artifact root: ${root}`
    );
  }
  if ((await realpath(root)) !== root) {
    throw new Error(`Refusing non-canonical artifact root: ${root}`);
  }

  const completed = [];
  const failed = [];
  const staleAbandoned = [];
  const now = Date.now();

  // Complete candidate discovery before deleting anything. Unsafe runs are
  // preserved, while independently verified runs remain eligible for pruning.
  for (const entry of await readdir(root)) {
    if (!producer.runPattern.test(entry)) continue;
    const runPath = path.join(root, entry);
    const info = await lstat(runPath);
    if (!info.isDirectory() || info.isSymbolicLink()) continue;

    let scanned;
    try {
      scanned = await scanTree(runPath);
    } catch (error) {
      console.warn(
        `Preserving unscannable artifact run ${runPath}: ${error.message}`
      );
      continue;
    }

    const { state } = await readRunState(runPath);
    const record = { entry, path: runPath, ...scanned };

    if (state === 'invalid') continue;
    if (state === 'failed') failed.push({ ...record, state });
    else if (state === 'completed') completed.push({ ...record, state });
    else if (now - scanned.newestMtimeMs > STALE_INCOMPLETE_MS) {
      staleAbandoned.push({
        ...record,
        state,
      });
    }
  }

  completed.sort(
    (left, right) =>
      right.newestMtimeMs - left.newestMtimeMs ||
      right.entry.localeCompare(left.entry)
  );
  failed.sort(
    (left, right) =>
      right.newestMtimeMs - left.newestMtimeMs ||
      right.entry.localeCompare(left.entry)
  );
  const oldFailed = failed
    .slice(FAILED_LIMIT)
    .filter(record => now - record.newestMtimeMs > FAILED_MIN_AGE_MS);
  const candidates = [
    ...completed.slice(COMPLETED_LIMIT),
    ...oldFailed,
    ...staleAbandoned,
  ];

  let bytes = 0;
  let removed = 0;
  for (const candidate of candidates) {
    // Re-scan immediately before removal to catch a newly-created symlink or a
    // writer that refreshed the run after candidate selection.
    const current = await scanTree(candidate.path);
    if (current.newestMtimeMs !== candidate.newestMtimeMs) continue;
    if ((await realpath(candidate.path)) !== candidate.path) continue;
    const currentSnapshot = await readRunState(candidate.path);
    if (currentSnapshot.state !== candidate.state) continue;
    const finalScan = await scanTree(candidate.path);
    if (finalScan.newestMtimeMs !== current.newestMtimeMs) continue;
    const finalSnapshot = await readRunState(candidate.path);
    if (finalSnapshot.state !== candidate.state) continue;
    if (finalSnapshot.newestMarkerMtimeMs > finalScan.newestMtimeMs) continue;
    if (
      candidate.state === 'failed' &&
      now - finalScan.newestMtimeMs <= FAILED_MIN_AGE_MS
    ) {
      continue;
    }
    if (
      (candidate.state === 'in-progress' || candidate.state === 'unmarked') &&
      now - finalScan.newestMtimeMs <= STALE_INCOMPLETE_MS
    ) {
      continue;
    }
    console.log(
      `${mode === 'apply' ? 'Removing' : 'Would remove'} ${candidate.path}`
    );
    if (mode === 'apply') {
      await rm(candidate.path, { recursive: true });
      bytes += finalScan.bytes;
      removed += 1;
    }
  }

  return { bytes, removed };
}

async function resetOwnedTarget(repoRoot, targetName, requestedPath, mode) {
  const config = RESET_TARGETS[targetName];
  if (!config) throw new Error(`Unknown reset target: ${targetName}`);

  const allowedBase = path.join(repoRoot, config.allowedBase);
  const target = requestedPath
    ? path.resolve(repoRoot, requestedPath)
    : path.join(repoRoot, config.defaultPath);
  assertContained(
    target,
    allowedBase,
    targetName,
    config.allowBaseTarget === true
  );
  await assertCanonicalAncestors(repoRoot, target);

  const targetInfo = await pathType(target);
  if (targetInfo?.isSymbolicLink()) {
    throw new Error(`Refusing to replace symlinked artifact root: ${target}`);
  }
  if (targetInfo && (await realpath(target)) !== target) {
    throw new Error(
      `Refusing to replace non-canonical artifact root: ${target}`
    );
  }

  console.log(`${mode === 'apply' ? 'Resetting' : 'Would reset'} ${target}`);
  if (mode === 'apply') {
    if (targetInfo) await rm(target, { recursive: true });
    await mkdir(target, { recursive: true });
  }
  return target;
}

async function main() {
  const parsed = parseArguments(process.argv.slice(2));
  const repoRoot = await realpath(path.resolve(parsed.repoRoot));
  if (parsed.operation === 'retain') {
    const result = await retainRuns(repoRoot, parsed.name, parsed.mode);
    console.log(
      `Performance artifact retention complete: producer=${parsed.name} mode=${parsed.mode} removed=${result.removed} bytes=${result.bytes}`
    );
    return;
  }
  if (parsed.operation === 'reset') {
    await resetOwnedTarget(
      repoRoot,
      parsed.name,
      parsed.requestedPath,
      parsed.mode
    );
    return;
  }
  throw new Error(usage());
}

main().catch(error => {
  console.error(`Performance artifact cleanup failed: ${error.message}`);
  process.exitCode = 1;
});
