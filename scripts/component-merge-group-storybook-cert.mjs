#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

/** @typedef {(command: string, args: string[], options?: import('node:child_process').SpawnSyncOptionsWithStringEncoding) => { status: number | null, stdout?: string | null }} CommandRunner */

/**
 * History depths tried, in order, when the checkout is shallow. A merge-group
 * head normally sits a handful of queue commits above its diff base; the
 * final `--unshallow` keeps any older (live-main merge-base) base reachable.
 */
export const SHALLOW_DEEPEN_DEPTHS = Object.freeze([16, 256]);

/**
 * Make `baseSha` reachable from HEAD in a shallow checkout by deepening only
 * HEAD's own ancestry — never every remote branch.
 * Deepening can only reveal real parent edges, so a base that is not an
 * ancestor of HEAD still fails the caller's `merge-base --is-ancestor` check.
 * A non-shallow checkout is left untouched.
 *
 * @param {{ baseSha: string, repoRoot: string, spawn: CommandRunner, remote?: string, depths?: readonly number[] }} options
 */
export function ensureBaseHistory({
  baseSha,
  repoRoot,
  spawn,
  remote = 'origin',
  depths = SHALLOW_DEEPEN_DEPTHS,
}) {
  const run = (/** @type {string[]} */ args) =>
    spawn('git', args, { cwd: repoRoot, encoding: 'utf8' });
  const isShallow = () => {
    const shallow = run(['rev-parse', '--is-shallow-repository']);
    return (
      shallow.status === 0 && String(shallow.stdout ?? '').trim() === 'true'
    );
  };
  // Anything but a confirmed shallow checkout is left to the caller's exact
  // base and ancestry checks, which fail closed on an unusable repository.
  if (!isShallow()) {
    return { deepened: false, fetches: [] };
  }

  const head = run(['rev-parse', 'HEAD']);
  const headSha = String(head.stdout ?? '').trim();
  if (head.status !== 0 || !/^[0-9a-f]{40}$/.test(headSha)) {
    throw new Error('Merge-group Storybook certification cannot resolve HEAD');
  }
  const reachable = () =>
    run(['cat-file', '-e', `${baseSha}^{commit}`]).status === 0 &&
    run(['merge-base', '--is-ancestor', baseSha, 'HEAD']).status === 0;

  /** @type {string[][]} */
  const fetches = [];
  const fetchHistory = (/** @type {string} */ depthArg) => {
    const args = [
      'fetch',
      '--no-tags',
      '--no-recurse-submodules',
      depthArg,
      remote,
      headSha,
    ];
    fetches.push(args);
    const fetched = spawn('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: 'inherit',
    });
    if (fetched.status !== 0) {
      throw new Error(
        `Merge-group Storybook certification could not fetch history (${depthArg})`
      );
    }
  };

  if (reachable()) return { deepened: false, fetches };
  for (const depth of depths) {
    fetchHistory(`--depth=${depth}`);
    if (reachable()) return { deepened: true, fetches };
    // A bounded fetch that reached the root already holds the full history.
    if (!isShallow()) return { deepened: true, fetches };
  }
  fetchHistory('--unshallow');
  return { deepened: true, fetches };
}

/**
 * @param {{
 *   eventName?: string,
 *   baseSha?: string,
 *   repoRoot?: string,
 *   storybookUrl?: string,
 *   spawn?: CommandRunner,
 * }} [options]
 */
export function runMergeGroupStorybookCertification({
  eventName = process.env.GITHUB_EVENT_NAME,
  baseSha = process.env.MERGE_GROUP_DIFF_BASE_SHA,
  repoRoot = process.env.GITHUB_WORKSPACE || process.cwd(),
  storybookUrl = process.env.STORYBOOK_BASE_URL || 'http://localhost:6006',
  spawn = /** @type {CommandRunner} */ (spawnSync),
} = {}) {
  if (eventName !== 'merge_group') return { skipped: true, calls: [] };
  if (!/^[0-9a-f]{40}$/.test(baseSha || '')) {
    throw new Error(
      'Merge-group Storybook certification requires an exact base SHA'
    );
  }

  // The job checks out HEAD at depth 1; fetch only the ancestry this diff
  // needs instead of cloning every branch.
  ensureBaseHistory({ baseSha, repoRoot, spawn });

  const git = spawn('git', ['cat-file', '-e', `${baseSha}^{commit}`], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (git.status !== 0) {
    throw new Error(
      `Merge-group Storybook certification base is unavailable: ${baseSha}`
    );
  }

  const ancestor = spawn(
    'git',
    ['merge-base', '--is-ancestor', baseSha, 'HEAD'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    }
  );
  if (ancestor.status !== 0) {
    throw new Error(
      `Merge-group Storybook certification base is not an ancestor of HEAD: ${baseSha}`
    );
  }

  // Advisory rendered eval only: do not pass --require-rendered.
  // Combined-queue heads change sibling components without their stories, which
  // is not a merge-group product failure.
  const args = [
    'component-ship-gate',
    `--diff-base=${baseSha}`,
    '--skip-quality',
    '--skip-ratchet',
    '--skip-rendered-cert',
    '--skip-live-storybook',
    `--storybook-url=${storybookUrl}`,
  ];
  const gate = spawn('pnpm', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (gate.status !== 0) {
    throw new Error(
      `Changed-component Storybook certification failed with status ${gate.status ?? 'unknown'}`
    );
  }
  return { skipped: false, calls: [{ command: 'pnpm', args }] };
}

if (isMain) {
  try {
    const result = runMergeGroupStorybookCertification();
    process.stdout.write(
      result.skipped
        ? '[component-merge-group-storybook-cert] skipped outside merge_group\n'
        : '[component-merge-group-storybook-cert] PASS\n'
    );
  } catch (error) {
    process.stderr.write(
      `[component-merge-group-storybook-cert] ${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exitCode = 1;
  }
}
