#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { lstatSync, readdirSync, statSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const MiB = 1024 * 1024;

export const HYGIENE_LIMITS = Object.freeze({
  maxFileBytes: 10 * MiB,
  maxChangedBytes: 60 * MiB,
  maxBinaryBytes: 10 * MiB,
  maxChangedBinaryBytes: 60 * MiB,
  maxChangedBinaryFiles: 120,
  maxSnapshotBytes: 12 * MiB,
  maxSnapshotFiles: 100,
  // Ship now: cap the tracked working tree at 180 MiB, 10,000 regular files,
  // and 96 MiB of binaries. Re-evaluate when any budget reaches 95%
  // (171 MiB, 9,500 files, or 91.2 MiB binary). Then: inventory and remove
  // superseded assets before raising a ceiling, and price any increase against
  // clone/checkout CI minutes plus agent cleanup time.
  maxTrackedBytes: 180 * MiB,
  maxTrackedFiles: 10_000,
  maxTrackedBinaryBytes: 96 * MiB,
});

const BINARY_EXTENSIONS = new Set([
  '.avif',
  '.bin',
  '.eot',
  '.gif',
  '.gz',
  '.ico',
  '.jpeg',
  '.jpg',
  '.mov',
  '.mp4',
  '.pdf',
  '.png',
  '.ttf',
  '.webm',
  '.webp',
  '.woff',
  '.woff2',
  '.zip',
]);

const BINARY_ALLOWLIST = [
  /^\.agents\/skills\//,
  /^apps\/desktop\/assets\//,
  /^apps\/ios\/Jovie\/Resources\/Assets\.xcassets\//,
  /^apps\/should-i-make\/public\//,
  /^apps\/web\/assets\//,
  /^apps\/web\/public\//,
  /^apps\/web\/screenshot-catalog\/current\//,
  /^apps\/web\/tests\/(?:[^/]+\/)*__snapshots__\//,
  /^docs\/screenshots\//,
];

const FORBIDDEN_ROOT_DIRECTORIES = new Set([
  '.kandan',
  '.tech-debt',
  'artifacts',
  'coordination',
  'inbox',
  'output',
  'screenshots',
  'temp',
  'tmp',
]);

const FORBIDDEN_GENERATED_PATHS = [
  /(?:^|\/)node_modules(?:\/|$)/,
  /(?:^|\/)\.next(?:\/|$)/,
  /(?:^|\/)\.turbo(?:\/|$)/,
  /(?:^|\/)(?:coverage|playwright-report|test-results)(?:\/|$)/,
  /(?:^|\/)\.cache(?:\/|$)/,
  /(?:^|\/)\.(?:bt|gstack|issues|vercel|workflow-data)(?:\/|$)/,
  /^(?:\.build|build|out)(?:\/|$)/,
  /^\.(?:audit|claude-flow|hermes|swarm|worktrees)(?:\/|$)/,
  /^\.claude\/(?:projects|tasks|teams|worktrees)(?:\/|$)/,
  /^\.codex\/(?!(?:config\.toml|hooks\.json|local-env\.toml)$)/,
  /^\.gbrain-source$/,
  /^logs\/security(?:\/|$)/,
  /^apps\/desktop\/(?:dist|dist-electron)(?:\/|$)/,
  /^apps\/web\/\.swc(?:\/|$)/,
  /^apps\/web\/artifacts(?:\/|$)/,
  /^agentos\/runs\/[^/]+\/artifacts(?:\/|$)/,
  /(?:^|\/)storybook-static(?:\/|$)/,
  /(?:^|\/)\.DS_Store$/,
  /(?:^|\/)\.eslintcache$/,
  /(?:^|\/)[^/]+\.tsbuildinfo$/,
  /(?:^|\/)[^/]+\.junit\.xml$/,
  /^TECH_DEBT_REGISTRY\.md$/,
  /^\.context\/(?:loop-logs|outputs|overnight-qa|perf|profile-audit|profile-mobile-qa|profile-mock-diff|profile-review-matrix|public-profile-layout-approval|qa-swarm)(?:\/|$)/,
  /^\.context\/qa\/releases-dashboard(?:\/|$)/,
  /^apps\/web\/audit-screenshots(?:\/|$)/,
  /^apps\/web\/\.issues(?:\/|$)/,
  /^agentos\/runs\/(?:design-lab|design-taste-jury)(?:\/|$)/,
];

const TEMP_FILE_PATTERN =
  /(?:^|\/)[^/]+(?:\.(?:bak2?|backup|orig|temp|tmp)(?:[-.][^/]+)?|\.next(?:\.[^/]+)?)$/i;

function normalizePath(path) {
  return path.replaceAll('\\', '/').replace(/^\.\//, '');
}

function isBinary(path) {
  return BINARY_EXTENSIONS.has(extname(path).toLowerCase());
}

function isAllowedBinary(path) {
  return BINARY_ALLOWLIST.some(pattern => pattern.test(path));
}

function formatBytes(bytes) {
  return `${(bytes / MiB).toFixed(2)} MiB`;
}

function hasRepeatedAdjacentSequence(parts) {
  for (let width = 1; width * 2 <= parts.length; width += 1) {
    for (let start = 0; start + width * 2 <= parts.length; start += 1) {
      const left = parts.slice(start, start + width).join('/');
      const right = parts.slice(start + width, start + width * 2).join('/');
      if (
        width === 1 &&
        start === 2 &&
        left === 'app' &&
        parts[0] === 'apps' &&
        parts[1] === 'web'
      ) {
        continue;
      }
      if (left === right) return true;
    }
  }
  return false;
}

function collectSnapshotBudget(root) {
  const snapshotRoot = resolve(root, 'apps/web/tests/e2e/__snapshots__');
  let bytes = 0;
  let files = 0;

  function visit(directory) {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        visit(path);
      } else if (entry.isFile()) {
        files += 1;
        bytes += statSync(path).size;
      }
    }
  }

  visit(snapshotRoot);
  return { bytes, files };
}

export function evaluateRepoHygiene({
  addedPaths,
  changedPaths = addedPaths,
  root = process.cwd(),
  trackedPaths = [],
}) {
  const errors = [];
  const normalizedAdded = [...new Set(addedPaths.map(normalizePath))];
  const normalizedChanged = [...new Set(changedPaths.map(normalizePath))];

  for (const path of normalizedAdded) {
    const parts = path.split('/').filter(Boolean);
    if (hasRepeatedAdjacentSequence(parts)) {
      errors.push(`${path}: repeated adjacent path component/sequence`);
    }
    if (FORBIDDEN_ROOT_DIRECTORIES.has(parts[0])) {
      errors.push(`${path}: generated/runtime root directory is not tracked`);
    }
    if (FORBIDDEN_GENERATED_PATHS.some(pattern => pattern.test(path))) {
      errors.push(`${path}: generated output path is not tracked`);
    }
    if (parts.length === 1 && isBinary(path)) {
      errors.push(`${path}: binary files are not allowed at repository root`);
    }
    if (TEMP_FILE_PATTERN.test(path)) {
      errors.push(`${path}: temporary/backup files are not tracked`);
    }
    if (isBinary(path) && !isAllowedBinary(path)) {
      errors.push(
        `${path}: binary addition is outside the allowlisted asset paths`
      );
    }
  }

  let changedBytes = 0;
  let changedFiles = 0;
  let changedBinaryBytes = 0;
  let changedBinaryFiles = 0;
  for (const path of normalizedChanged) {
    let stats;
    try {
      stats = lstatSync(resolve(root, path));
    } catch {
      continue;
    }
    if (!stats.isFile()) continue;

    const size = stats.size;
    changedFiles += 1;
    changedBytes += size;
    if (size > HYGIENE_LIMITS.maxFileBytes) {
      errors.push(
        `${path}: ${formatBytes(size)} exceeds the ${formatBytes(HYGIENE_LIMITS.maxFileBytes)} per-file budget`
      );
    }

    if (!isBinary(path)) continue;
    changedBinaryFiles += 1;
    changedBinaryBytes += size;
    if (size > HYGIENE_LIMITS.maxBinaryBytes) {
      errors.push(
        `${path}: ${formatBytes(size)} exceeds the ${formatBytes(HYGIENE_LIMITS.maxBinaryBytes)} per-file binary budget`
      );
    }
  }

  if (changedBytes > HYGIENE_LIMITS.maxChangedBytes) {
    errors.push(
      `${formatBytes(changedBytes)} across changed files exceeds the ${formatBytes(HYGIENE_LIMITS.maxChangedBytes)} aggregate budget`
    );
  }
  if (changedBinaryFiles > HYGIENE_LIMITS.maxChangedBinaryFiles) {
    errors.push(
      `${changedBinaryFiles} changed binary files exceed the ${HYGIENE_LIMITS.maxChangedBinaryFiles}-file budget`
    );
  }
  if (changedBinaryBytes > HYGIENE_LIMITS.maxChangedBinaryBytes) {
    errors.push(
      `${formatBytes(changedBinaryBytes)} of changed binaries exceeds the ${formatBytes(HYGIENE_LIMITS.maxChangedBinaryBytes)} aggregate budget`
    );
  }

  const snapshots = collectSnapshotBudget(root);
  if (snapshots.files > HYGIENE_LIMITS.maxSnapshotFiles) {
    errors.push(
      `${snapshots.files} canonical visual-test baselines exceed the ${HYGIENE_LIMITS.maxSnapshotFiles}-file budget`
    );
  }
  if (snapshots.bytes > HYGIENE_LIMITS.maxSnapshotBytes) {
    errors.push(
      `${formatBytes(snapshots.bytes)} of canonical visual-test baselines exceeds the ${formatBytes(HYGIENE_LIMITS.maxSnapshotBytes)} budget`
    );
  }

  let trackedBytes = 0;
  let trackedFiles = 0;
  let trackedBinaryBytes = 0;
  let trackedBinaryFiles = 0;
  for (const path of new Set(trackedPaths.map(normalizePath))) {
    let stats;
    try {
      stats = lstatSync(resolve(root, path));
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      errors.push(
        `${path}: unable to inspect tracked path (${error?.code ?? 'unknown error'})`
      );
      continue;
    }
    // A symlink's target is outside the tracked payload and must not be followed.
    if (!stats.isFile()) continue;

    trackedFiles += 1;
    trackedBytes += stats.size;
    if (!isBinary(path)) continue;
    trackedBinaryFiles += 1;
    trackedBinaryBytes += stats.size;
  }

  if (trackedFiles > HYGIENE_LIMITS.maxTrackedFiles) {
    errors.push(
      `${trackedFiles} tracked regular files exceed the ${HYGIENE_LIMITS.maxTrackedFiles}-file repository budget`
    );
  }
  if (trackedBytes > HYGIENE_LIMITS.maxTrackedBytes) {
    errors.push(
      `${formatBytes(trackedBytes)} of tracked regular files exceeds the ${formatBytes(HYGIENE_LIMITS.maxTrackedBytes)} repository budget`
    );
  }
  if (trackedBinaryBytes > HYGIENE_LIMITS.maxTrackedBinaryBytes) {
    errors.push(
      `${formatBytes(trackedBinaryBytes)} of tracked binaries exceeds the ${formatBytes(HYGIENE_LIMITS.maxTrackedBinaryBytes)} repository budget`
    );
  }

  return {
    changedBinaryBytes,
    changedBinaryFiles,
    changedBytes,
    changedFiles,
    errors,
    snapshotBytes: snapshots.bytes,
    snapshotFiles: snapshots.files,
    trackedBinaryBytes,
    trackedBinaryFiles,
    trackedBytes,
    trackedFiles,
  };
}

function gitPaths(args) {
  const output = execFileSync('git', args, { encoding: 'buffer' });
  return output.toString('utf8').split('\0').filter(Boolean);
}

export function collectGitPaths(args) {
  const trackedPaths = gitPaths(['ls-files', '-z']);
  const diffBaseIndex = args.indexOf('--diff-base');
  if (diffBaseIndex >= 0) {
    const base = args[diffBaseIndex + 1];
    if (!base) throw new Error('--diff-base requires a Git revision');
    return {
      addedPaths: gitPaths([
        'diff',
        '--name-only',
        '--diff-filter=ACR',
        '-z',
        `${base}..HEAD`,
      ]),
      changedPaths: gitPaths([
        'diff',
        '--name-only',
        '--diff-filter=ACMR',
        '-z',
        `${base}..HEAD`,
      ]),
      trackedPaths,
    };
  }

  if (!args.includes('--staged')) {
    throw new Error(
      'usage: repo-hygiene-guard.mjs --staged | --diff-base <rev>'
    );
  }
  return {
    addedPaths: gitPaths([
      'diff',
      '--cached',
      '--name-only',
      '--diff-filter=ACR',
      '-z',
    ]),
    changedPaths: gitPaths([
      'diff',
      '--cached',
      '--name-only',
      '--diff-filter=ACMR',
      '-z',
    ]),
    trackedPaths,
  };
}

function main() {
  const paths = collectGitPaths(process.argv.slice(2));
  const result = evaluateRepoHygiene(paths);
  if (result.errors.length === 0) {
    console.log(
      `[repo-hygiene] clean (${result.changedFiles} changed files, ${formatBytes(result.changedBytes)}; ${result.trackedFiles} tracked files, ${formatBytes(result.trackedBytes)}, ${formatBytes(result.trackedBinaryBytes)} binary; ${result.snapshotFiles} visual baselines, ${formatBytes(result.snapshotBytes)})`
    );
    return;
  }

  console.error('[repo-hygiene] blocked:');
  for (const error of result.errors) console.error(`  - ${error}`);
  process.exitCode = 1;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : '';
if (import.meta.url === invokedPath) main();
