#!/usr/bin/env node

import {
  lstat,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
  unlink,
} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const TECH_DEBT_REPORT_LIMIT = 14;
const QA_RUN_LIMIT = 2;
const QA_RUN_MIN_AGE_MS = 24 * 60 * 60 * 1000;
const QA_INCOMPLETE_MIN_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const PROFILE_RUN_ROOTS = [
  {
    completionJson: {
      expectedValue: true,
      property: 'passed',
      relativePath: 'summary.json',
    },
    failedLimit: 3,
    failedMinAgeMs: QA_RUN_MIN_AGE_MS,
    relativeRoot: '.context/profile-mock-diff',
  },
  {
    completionMarker: 'summary.json',
    relativeRoot: '.context/profile-review-matrix',
  },
  {
    completionMarker: 'complete.json',
    relativeRoot: '.context/profile-audit',
  },
];
const QA_RUN_ROOTS = [
  {
    completionMarker: 'findings-ledger.json',
    relativeRoot: 'apps/web/test-results/route-qa',
  },
  {
    completionMarker: 'summary.json',
    relativeRoot: 'apps/web/test-results/public-route-qa',
  },
];
export const GENERATED_RUN_ROOTS = [
  ...PROFILE_RUN_ROOTS.map(config => ({
    ...config,
    incompleteMinAgeMs: QA_INCOMPLETE_MIN_AGE_MS,
    limit: 2,
    minAgeMs: QA_RUN_MIN_AGE_MS,
  })),
  ...QA_RUN_ROOTS.map(config => ({
    ...config,
    incompleteMinAgeMs: QA_INCOMPLETE_MIN_AGE_MS,
    limit: QA_RUN_LIMIT,
    minAgeMs: QA_RUN_MIN_AGE_MS,
  })),
  ...['homepage', 'dashboard', 'route'].map(prefix => ({
    completionJson: {
      expectedValues: ['threshold-hit', 'stalled'],
      nonMatchingState: 'absent',
      property: 'status',
      relativePath: 'state.json',
    },
    currentPointers: [
      { jsonProperty: 'artifactDir', relativePath: `${prefix}-current.json` },
    ],
    incompleteMinAgeMs: QA_INCOMPLETE_MIN_AGE_MS,
    limit: 3,
    minAgeMs: QA_RUN_MIN_AGE_MS,
    namePrefix: `${prefix}-`,
    relativeRoot: '.context/perf',
  })),
  {
    completionJson: {
      expectedValues: ['pass', 'fail'],
      property: 'status',
      relativePath: 'launch-perf-summary.json',
    },
    incompleteMinAgeMs: QA_INCOMPLETE_MIN_AGE_MS,
    limit: 3,
    minAgeMs: QA_RUN_MIN_AGE_MS,
    namePrefix: 'launch-check-',
    relativeRoot: '.context/perf',
  },
  {
    completionJson: {
      expectedValues: ['completed', 'stalled'],
      nonMatchingState: 'absent',
      property: 'status',
      relativePath: 'state.json',
    },
    currentPointers: [
      { jsonProperty: 'artifactDir', relativePath: 'end-user-current.json' },
      { jsonProperty: 'artifactDir', relativePath: 'end-user-state.json' },
    ],
    incompleteMinAgeMs: QA_INCOMPLETE_MIN_AGE_MS,
    limit: 3,
    minAgeMs: QA_RUN_MIN_AGE_MS,
    namePrefix: 'end-user-',
    relativeRoot: '.context/perf',
  },
  {
    completionMarker: 'reports/sweep-summary.json',
    currentPointers: [
      {
        jsonProperty: 'activeRunDir',
        relativePath: '../state.json',
      },
    ],
    incompleteMinAgeMs: QA_INCOMPLETE_MIN_AGE_MS,
    limit: 14,
    minAgeMs: QA_RUN_MIN_AGE_MS,
    relativeRoot: '.context/overnight-qa/runs',
  },
  {
    completionMarker: 'summary.json',
    incompleteMinAgeMs: QA_INCOMPLETE_MIN_AGE_MS,
    limit: 14,
    minAgeMs: QA_RUN_MIN_AGE_MS,
    namePrefix: 'qa-swarm-',
    relativeRoot: '.context/qa-swarm/runs',
  },
  {
    completionMarker: 'summary.md',
    incompleteMinAgeMs: QA_INCOMPLETE_MIN_AGE_MS,
    limit: 3,
    minAgeMs: QA_RUN_MIN_AGE_MS,
    relativeRoot: '.context/qa/releases-dashboard/history',
  },
];
const REPORT_PATTERN =
  /^paydown-report-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.md$/;
const SAFE_CYCLE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function usage() {
  return 'Usage: generated-artifact-retention.mjs [--dry-run|--apply] [--repo-root <path>]';
}

function parseArgs(argv) {
  let mode = 'dry-run';
  let repoRoot = process.cwd();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      mode = 'dry-run';
    } else if (arg === '--apply') {
      mode = 'apply';
    } else if (arg === '--repo-root') {
      const value = argv[index + 1];
      if (!value) throw new Error(`${usage()}\nMissing value for --repo-root`);
      repoRoot = value;
      index += 1;
    } else if (arg.startsWith('--repo-root=')) {
      repoRoot = arg.slice('--repo-root='.length);
      if (!repoRoot)
        throw new Error(`${usage()}\nMissing value for --repo-root`);
    } else {
      throw new Error(`${usage()}\nUnknown argument: ${arg}`);
    }
  }

  return { mode, repoRoot: path.resolve(repoRoot) };
}

function isDescendant(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function isValidReportTimestamp(name) {
  const match = REPORT_PATTERN.exec(name);
  if (!match) return false;

  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    )
  );

  return (
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() === Number(month) - 1 &&
    date.getUTCDate() === Number(day) &&
    date.getUTCHours() === Number(hour) &&
    date.getUTCMinutes() === Number(minute) &&
    date.getUTCSeconds() === Number(second)
  );
}

async function lstatOrNull(target) {
  try {
    return await lstat(target);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function inspectTree(root) {
  const rootStats = await lstat(root);
  const inspection = {
    bytes: rootStats.isFile() ? rootStats.size : 0,
    hasSymlink: rootStats.isSymbolicLink(),
    latestMtimeMs: rootStats.mtimeMs,
  };
  if (!rootStats.isDirectory() || inspection.hasSymlink) return inspection;

  const entries = await readdir(root);
  for (const entry of entries) {
    const childInspection = await inspectTree(path.join(root, entry));
    inspection.bytes += childInspection.bytes;
    inspection.hasSymlink ||= childInspection.hasSymlink;
    inspection.latestMtimeMs = Math.max(
      inspection.latestMtimeMs,
      childInspection.latestMtimeMs
    );
  }
  return inspection;
}

async function planTechDebtReports(repoRoot) {
  const root = path.join(repoRoot, '.tech-debt');
  const rootStats = await lstatOrNull(root);
  if (!rootStats) return { candidates: [], eligible: 0, retained: 0 };
  if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) {
    console.warn('  Preserved .tech-debt because it is not a real directory');
    return { candidates: [], eligible: 0, retained: 0 };
  }

  const rootRealPath = await realpath(root);
  if (!isDescendant(repoRoot, rootRealPath)) {
    console.warn('  Preserved .tech-debt because it resolves outside the repo');
    return { candidates: [], eligible: 0, retained: 0 };
  }

  const reports = [];
  for (const name of await readdir(root)) {
    if (!isValidReportTimestamp(name)) continue;
    const target = path.join(root, name);
    if (!isDescendant(root, target)) continue;
    const targetStats = await lstat(target);
    if (targetStats.isSymbolicLink() || !targetStats.isFile()) continue;
    reports.push({
      bytes: targetStats.size,
      dev: targetStats.dev,
      ino: targetStats.ino,
      kind: 'file',
      name,
      path: target,
    });
  }

  reports.sort((left, right) => right.name.localeCompare(left.name));
  return {
    candidates: reports.slice(TECH_DEBT_REPORT_LIMIT),
    eligible: reports.length,
    retained: Math.min(reports.length, TECH_DEBT_REPORT_LIMIT),
  };
}

async function inspectCompletionEvidence(target, config) {
  if (config.completionJson) {
    const markerPath = path.join(target, config.completionJson.relativePath);
    const markerStats = await lstatOrNull(markerPath);
    if (markerStats?.isFile() && !markerStats.isSymbolicLink()) {
      const parsed = JSON.parse(await readFile(markerPath, 'utf8'));
      if (
        (
          config.completionJson.expectedValues ?? [
            config.completionJson.expectedValue,
          ]
        ).includes(parsed?.[config.completionJson.property])
      ) {
        return 'complete';
      }
      return config.completionJson.nonMatchingState ?? 'failed';
    }
  }

  if (config.completionMarker) {
    const markerStats = await lstatOrNull(
      path.join(target, config.completionMarker)
    );
    if (markerStats?.isFile() && !markerStats.isSymbolicLink()) {
      return 'complete';
    }
  }

  return 'absent';
}

async function readCurrentRunPaths(repoRoot, root, config) {
  const currentPaths = new Set();
  for (const pointer of config.currentPointers ?? []) {
    const pointerPath = path.resolve(root, pointer.relativePath);
    if (!isDescendant(repoRoot, pointerPath)) {
      throw new Error(`current pointer escapes repository: ${pointerPath}`);
    }
    let raw;
    try {
      raw = await readFile(pointerPath, 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
    const parsed = JSON.parse(raw);
    const value = parsed?.[pointer.jsonProperty];
    if (value === null || value === undefined) continue;
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`invalid ${pointer.jsonProperty} in ${pointerPath}`);
    }
    const currentPath = path.isAbsolute(value)
      ? path.resolve(value)
      : path.resolve(repoRoot, value);
    if (!isDescendant(root, currentPath)) {
      throw new Error(`current run resolves outside ${root}: ${currentPath}`);
    }
    currentPaths.add(currentPath);
  }
  return currentPaths;
}

export async function planCompletedRuns(repoRoot, config, nowMs) {
  const {
    incompleteMinAgeMs,
    limit,
    minAgeMs,
    failedLimit = 0,
    failedMinAgeMs = minAgeMs,
    namePrefix = '',
    relativeRoot,
  } = config;
  const root = path.join(repoRoot, relativeRoot);
  const rootStats = await lstatOrNull(root);
  if (!rootStats) return { candidates: [], eligible: 0, retained: 0 };
  if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) {
    console.warn(
      `  Preserved ${relativeRoot} because it is not a real directory`
    );
    return { candidates: [], eligible: 0, retained: 0 };
  }

  const rootRealPath = await realpath(root);
  if (!isDescendant(repoRoot, rootRealPath)) {
    console.warn(
      `  Preserved ${relativeRoot} because it resolves outside the repo`
    );
    return { candidates: [], eligible: 0, retained: 0 };
  }

  let currentPaths;
  try {
    currentPaths = await readCurrentRunPaths(repoRoot, rootRealPath, config);
  } catch (error) {
    console.warn(
      `  Preserved ${relativeRoot} after current-pointer error: ${error.message}`
    );
    return { candidates: [], eligible: 0, retained: 0 };
  }

  const completed = [];
  const failed = [];
  const staleIncomplete = [];
  for (const name of await readdir(root)) {
    if (
      name === 'current' ||
      name === 'latest' ||
      !SAFE_CYCLE_NAME_PATTERN.test(name) ||
      !name.startsWith(namePrefix) ||
      name === '.' ||
      name === '..'
    ) {
      continue;
    }

    const target = path.join(root, name);
    if (!isDescendant(root, target)) continue;
    try {
      const targetStats = await lstat(target);
      if (targetStats.isSymbolicLink() || !targetStats.isDirectory()) continue;

      const targetRealPath = await realpath(target);
      if (!isDescendant(rootRealPath, targetRealPath)) continue;
      if (currentPaths.has(targetRealPath)) continue;
      const inspection = await inspectTree(target);
      if (inspection.hasSymlink) continue;

      const completionState = await inspectCompletionEvidence(target, config);
      const ageMs = nowMs - inspection.latestMtimeMs;
      if (completionState === 'complete' && ageMs >= minAgeMs) {
        completed.push({
          bytes: inspection.bytes,
          completionConfig: config,
          completionState,
          dev: targetStats.dev,
          ino: targetStats.ino,
          kind: 'directory',
          latestMtimeMs: inspection.latestMtimeMs,
          minAgeMs,
          name,
          path: target,
          root: rootRealPath,
          repoRoot,
        });
      } else if (completionState === 'failed' && ageMs >= failedMinAgeMs) {
        failed.push({
          bytes: inspection.bytes,
          completionConfig: config,
          completionState,
          dev: targetStats.dev,
          ino: targetStats.ino,
          kind: 'directory',
          latestMtimeMs: inspection.latestMtimeMs,
          minAgeMs: failedMinAgeMs,
          name,
          path: target,
          root: rootRealPath,
          repoRoot,
        });
      } else if (completionState === 'absent' && ageMs >= incompleteMinAgeMs) {
        staleIncomplete.push({
          bytes: inspection.bytes,
          completionConfig: config,
          completionState,
          dev: targetStats.dev,
          ino: targetStats.ino,
          kind: 'directory',
          latestMtimeMs: inspection.latestMtimeMs,
          minAgeMs: incompleteMinAgeMs,
          name,
          path: target,
          root: rootRealPath,
          repoRoot,
        });
      }
    } catch (error) {
      console.warn(
        `  Preserved ${path.join(relativeRoot, name)} after scan error: ${error.message}`
      );
    }
  }

  completed.sort(
    (left, right) =>
      right.latestMtimeMs - left.latestMtimeMs ||
      right.name.localeCompare(left.name)
  );
  failed.sort(
    (left, right) =>
      right.latestMtimeMs - left.latestMtimeMs ||
      right.name.localeCompare(left.name)
  );
  return {
    candidates: [
      ...completed.slice(limit),
      ...failed.slice(failedLimit),
      ...staleIncomplete,
    ],
    eligible: completed.length + failed.length + staleIncomplete.length,
    retained:
      Math.min(completed.length, limit) + Math.min(failed.length, failedLimit),
  };
}

export async function validateApplyCandidates(candidates, nowMs) {
  for (const candidate of candidates) {
    const currentStats = await lstat(candidate.path);
    if (
      currentStats.isSymbolicLink() ||
      currentStats.dev !== candidate.dev ||
      currentStats.ino !== candidate.ino
    ) {
      throw new Error(`Refusing changed candidate: ${candidate.path}`);
    }

    if (candidate.kind === 'file') {
      if (!currentStats.isFile()) {
        throw new Error(`Refusing non-file report: ${candidate.path}`);
      }
      continue;
    }

    if (!currentStats.isDirectory()) {
      throw new Error(`Refusing non-directory cycle: ${candidate.path}`);
    }
    const currentRealPath = await realpath(candidate.path);
    if (!isDescendant(candidate.root, currentRealPath)) {
      throw new Error(`Refusing outside cycle: ${candidate.path}`);
    }
    const inspection = await inspectTree(candidate.path);
    if (inspection.hasSymlink) {
      throw new Error(`Refusing cycle containing a symlink: ${candidate.path}`);
    }
    if (nowMs - inspection.latestMtimeMs < candidate.minAgeMs) {
      throw new Error(`Refusing cycle that became young: ${candidate.path}`);
    }
    if (candidate.completionConfig) {
      const currentPaths = await readCurrentRunPaths(
        candidate.repoRoot,
        candidate.root,
        candidate.completionConfig
      );
      if (currentPaths.has(currentRealPath)) {
        throw new Error(`Refusing current run: ${candidate.path}`);
      }
      const completionState = await inspectCompletionEvidence(
        candidate.path,
        candidate.completionConfig
      );
      if (completionState !== candidate.completionState) {
        throw new Error(`Refusing changed run state: ${candidate.path}`);
      }
    }
  }
}

async function main() {
  const { mode, repoRoot } = parseArgs(process.argv.slice(2));
  const repoStats = await stat(repoRoot);
  if (!repoStats.isDirectory())
    throw new Error(`Repo root is not a directory: ${repoRoot}`);
  const repoRealPath = await realpath(repoRoot);
  const nowMs = Date.now();

  console.log(`Generated artifact retention (${mode})`);
  const plans = [
    {
      label: '.tech-debt reports',
      ...(await planTechDebtReports(repoRealPath)),
    },
  ];
  for (const runRoot of GENERATED_RUN_ROOTS) {
    plans.push({
      label: `${runRoot.relativeRoot}${runRoot.namePrefix ? ` (${runRoot.namePrefix}*)` : ''}`,
      ...(await planCompletedRuns(repoRealPath, runRoot, nowMs)),
    });
  }

  const candidates = plans.flatMap(plan => plan.candidates);
  for (const plan of plans) {
    console.log(
      `  ${plan.label}: eligible=${plan.eligible} retained=${plan.retained} ${mode === 'apply' ? 'remove' : 'would-remove'}=${plan.candidates.length}`
    );
  }
  for (const candidate of candidates) {
    console.log(
      `  ${mode === 'apply' ? 'Remove' : 'Would remove'} ${path.relative(repoRealPath, candidate.path)} (${candidate.bytes} bytes)`
    );
  }

  if (mode === 'apply') {
    for (const candidate of candidates) {
      await validateApplyCandidates([candidate], Date.now());
      if (candidate.kind === 'file') {
        await unlink(candidate.path);
      } else {
        await rm(candidate.path, { recursive: true });
      }
    }
  }

  const bytes = candidates.reduce(
    (total, candidate) => total + candidate.bytes,
    0
  );
  console.log(
    `Generated artifact retention complete: mode=${mode} ${mode === 'apply' ? 'removed' : 'wouldRemove'}=${candidates.length} bytes=${bytes}`
  );
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main().catch(error => {
    console.error(`Generated artifact retention failed: ${error.message}`);
    process.exitCode = 1;
  });
}
