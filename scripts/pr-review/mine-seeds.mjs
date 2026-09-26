#!/usr/bin/env node
// Mine labelled replay cases from git history (SZZ-style), with no human
// labelling. A behavior fix on main points back, via `git blame` of the lines
// it changed, to the squash-merged PR that introduced the defect. That PR's
// head becomes a replay case whose expected findings are those lines. PRs whose
// files saw no behavior fix afterwards become clean cases.
//
// Usage: node scripts/pr-review/mine-seeds.mjs [--days 120] [--max 40] [--quiet-days 14] [--ref origin/main]

import { execFile } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const DEFAULT_MINE_OPTIONS = Object.freeze({
  days: 120,
  maxCases: 40,
  cleanFraction: 1 / 3,
  cleanQuietDays: 14,
  maxExpectedLines: 30,
  ref: 'origin/main',
});

const FIX_SUBJECT = /^(fix|hotfix|revert)(\([^)]*\))?!?:/i;
// Style, tooling and test-only fixes are not product defects.
const NON_BEHAVIOR_FIX =
  /sonar|lint|biome|eslint|prettier|format|typo|flak|snapshot|coverage|\bci\b|workflow|docs?\b|deps?\b|bump|typecheck|knip|storybook|test/i;
const PR_NUMBER = /\(#(\d+)\)\s*$/;
const REVIEWABLE = /\.(?:[cm]?[jt]sx?|py|sql|swift)$/i;
const SKIP_PATH =
  /(?:^|\/)(?:__tests__|tests?|__snapshots__|generated|fixtures)\/|\.(?:test|spec)\.[cm]?[jt]sx?$|(?:^|\/)(?:pnpm-lock\.yaml|package-lock\.json)$/;

export async function runGit(args) {
  const { stdout } = await execFileAsync('git', args, {
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}

export function isBehaviorFix(subject) {
  return FIX_SUBJECT.test(subject) && !NON_BEHAVIOR_FIX.test(subject);
}

// Commits that reshape lines without changing behavior. Blame looks through
// them (git blame --ignore-revs-file) so a later Sonar or formatting pass is
// never credited as the commit that introduced a defect.
const COSMETIC_SUBJECT =
  /^(style|refactor|chore|build|ci|docs|test)(\([^)]*\))?!?:/i;

export function isCosmetic(subject) {
  return (
    COSMETIC_SUBJECT.test(subject) ||
    (FIX_SUBJECT.test(subject) && NON_BEHAVIOR_FIX.test(subject))
  );
}

export function reviewablePath(path) {
  return REVIEWABLE.test(path) && !SKIP_PATH.test(path);
}

/** Old-side line numbers touched by a unified diff (deleted or replaced lines). */
export function touchedOldLines(patch) {
  const lines = [];
  let oldLine = 0;
  for (const row of patch.split('\n')) {
    const hunk = row.match(/^@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@/);
    if (hunk) {
      oldLine = Number(hunk[1]);
      continue;
    }
    if (row.startsWith('---') || row.startsWith('+++')) continue;
    if (row.startsWith('-')) {
      lines.push(oldLine);
      oldLine += 1;
    } else if (!row.startsWith('+') && !row.startsWith('\\')) {
      oldLine += 1;
    }
  }
  return lines;
}

/** Parse `git blame --porcelain`: commit sha + line number in that commit. */
export function parseBlame(porcelain) {
  const out = [];
  for (const row of porcelain.split('\n')) {
    const header = row.match(/^([0-9a-f]{40}) (\d+) \d+/);
    if (header) out.push({ sha: header[1], originalLine: Number(header[2]) });
  }
  return out;
}

async function firstParentLog(git, ref, days) {
  const raw = await git([
    'log',
    ref,
    '--first-parent',
    `--since=${days}.days`,
    '--format=%H%x09%ct%x09%s',
  ]);
  return raw
    .split('\n')
    .filter(Boolean)
    .map(row => {
      const [sha, ct, ...rest] = row.split('\t');
      const subject = rest.join('\t');
      const pr = subject.match(PR_NUMBER)?.[1];
      return { sha, time: Number(ct), subject, pr: pr ? Number(pr) : null };
    });
}

async function parentSha(git, sha) {
  try {
    const parent = (
      await git(['rev-parse', '--verify', '--quiet', `${sha}^`])
    ).trim();
    return /^[0-9a-f]{40}$/.test(parent) ? parent : null;
  } catch {
    return null;
  }
}

async function changedFiles(git, sha) {
  const raw = await git(['show', '--format=', '--name-only', sha]);
  return raw.split('\n').filter(Boolean);
}

/**
 * Mine replay cases. `git` is injectable for tests; the default shells out.
 * Returns { defects, clean } where each case is
 * { id, pr, baseSha, headSha, expected?: [{path, line}], clean? }.
 */
export async function mineSeeds({
  git = runGit,
  options = DEFAULT_MINE_OPTIONS,
} = {}) {
  const log = await firstParentLog(git, options.ref, options.days);
  const byShaIndex = new Map(log.map((commit, index) => [commit.sha, index]));
  const fixes = log.filter(commit => isBehaviorFix(commit.subject));
  const ignoreRevs = join(
    mkdtempSync(join(tmpdir(), 'mine-seeds-')),
    'ignore-revs'
  );
  writeFileSync(
    ignoreRevs,
    `${log
      .filter(commit => isCosmetic(commit.subject))
      .map(commit => commit.sha)
      .join('\n')}\n`
  );
  const defects = new Map();
  const fixedFiles = [];

  for (const fix of fixes) {
    const files = (await changedFiles(git, fix.sha)).filter(reviewablePath);
    for (const path of files) {
      fixedFiles.push({ path, time: fix.time });
      const patch = await git([
        'show',
        '--format=',
        '-U0',
        fix.sha,
        '--',
        path,
      ]);
      const oldLines = touchedOldLines(patch);
      if (oldLines.length === 0) continue;
      const ranges = oldLines.flatMap(line => ['-L', `${line},${line}`]);
      let blame = '';
      try {
        blame = await git([
          'blame',
          '--porcelain',
          '--ignore-revs-file',
          ignoreRevs,
          ...ranges,
          `${fix.sha}^`,
          '--',
          path,
        ]);
      } catch {
        continue; // file did not exist on the parent
      }
      for (const { sha, originalLine } of parseBlame(blame)) {
        const index = byShaIndex.get(sha);
        const intro = index === undefined ? null : log[index];
        if (
          !intro?.pr ||
          intro.sha === fix.sha ||
          isBehaviorFix(intro.subject) ||
          isCosmetic(intro.subject)
        ) {
          continue;
        }
        const entry = defects.get(sha) ?? {
          id: `defect-${intro.pr}-${sha.slice(0, 12)}`,
          pr: intro.pr,
          baseSha: null,
          headSha: sha,
          fixedBy: [],
          expected: [],
        };
        if (!entry.fixedBy.includes(fix.sha)) entry.fixedBy.push(fix.sha);
        if (
          !entry.expected.some(e => e.path === path && e.line === originalLine)
        ) {
          entry.expected.push({ path, line: originalLine });
        }
        defects.set(sha, entry);
      }
    }
  }

  // A commit without a resolvable parent is a shallow-clone boundary; blame
  // pins every older line on it, so it is never a real introducing commit.
  const defectTarget = Math.ceil(
    options.maxCases * (1 - options.cleanFraction)
  );
  const defectList = [];
  for (const entry of defects.values()) {
    if (defectList.length >= defectTarget) break;
    // Broad labels (reverts of whole features, large rewrites) would count
    // almost any finding in those files as a hit; keep only focused defects.
    if (entry.expected.length > options.maxExpectedLines) continue;
    const baseSha = await parentSha(git, entry.headSha);
    if (!baseSha) continue;
    defectList.push({ ...entry, baseSha });
  }

  const quiet = options.cleanQuietDays * 86_400;
  const newest = log[0]?.time ?? 0;
  const clean = [];
  const cleanTarget = Math.floor(options.maxCases * options.cleanFraction);
  for (const commit of log) {
    if (clean.length >= cleanTarget) break;
    if (!commit.pr || isBehaviorFix(commit.subject) || defects.has(commit.sha))
      continue;
    if (FIX_SUBJECT.test(commit.subject)) continue;
    if (newest - commit.time < quiet) continue;
    const files = (await changedFiles(git, commit.sha)).filter(reviewablePath);
    if (files.length === 0) continue;
    const touchedLater = fixedFiles.some(
      fixed =>
        files.includes(fixed.path) &&
        fixed.time > commit.time &&
        fixed.time - commit.time < quiet
    );
    if (touchedLater) continue;
    const baseSha = await parentSha(git, commit.sha);
    if (!baseSha) continue;
    clean.push({
      id: `clean-${commit.pr}-${commit.sha.slice(0, 12)}`,
      pr: commit.pr,
      baseSha,
      headSha: commit.sha,
      clean: true,
    });
  }
  return { defects: defectList, clean };
}

function parseArgs(argv) {
  const options = { ...DEFAULT_MINE_OPTIONS };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--days') options.days = Number(argv[++i]);
    if (argv[i] === '--max') options.maxCases = Number(argv[++i]);
    if (argv[i] === '--ref') options.ref = argv[++i];
    if (argv[i] === '--quiet-days') options.cleanQuietDays = Number(argv[++i]);
  }
  return options;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  mineSeeds({ options: parseArgs(process.argv.slice(2)) })
    .then(({ defects, clean }) => {
      process.stdout.write(
        `${JSON.stringify([...defects, ...clean], null, 2)}\n`
      );
    })
    .catch(error => {
      process.stderr.write(`mine-seeds: failed (${error?.message ?? error})\n`);
      process.exitCode = 1;
    });
}
