#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

/** @typedef {(command: string, args: string[], options?: import('node:child_process').SpawnSyncOptionsWithStringEncoding) => { status: number | null }} CommandRunner */

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
