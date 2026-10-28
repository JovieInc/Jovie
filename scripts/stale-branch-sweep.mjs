#!/usr/bin/env node
/**
 * Stale remote-branch sweeper. Dry-run by default.
 *
 *   node scripts/stale-branch-sweep.mjs --git-dir <bare clone> [--apply]
 *     [--keep-file <branches.txt>] [--receipt <path>] [--batch 250]
 *
 * The git dir must have an `origin` remote with push access. A commit-only
 * clone is enough (git clone --bare --filter=tree:0). Policy lives in
 * scripts/lib/stale-branch-sweep.mjs; docs/ci/repository-health.md#stale-branch-sweep.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import {
  ARCHIVE_PREFIX,
  chunk,
  planBranchSweep,
  verifiedDeletions,
} from './lib/stale-branch-sweep.mjs';

function parseArgs(argv) {
  const args = { apply: false, batch: 250, gitDir: '.', keepFile: null };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--apply') args.apply = true;
    else if (flag === '--git-dir') args.gitDir = argv[++index];
    else if (flag === '--keep-file') args.keepFile = argv[++index];
    else if (flag === '--receipt') args.receipt = argv[++index];
    else if (flag === '--batch') args.batch = Number(argv[++index]);
    else throw new Error(`unknown flag ${flag}`);
  }
  if (!Number.isInteger(args.batch) || args.batch < 1 || args.batch > 500)
    throw new Error('--batch must be 1..500');
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const git = (...rest) =>
    execFileSync('git', ['-C', args.gitDir, ...rest], {
      encoding: 'utf8',
      maxBuffer: 512 * 1024 * 1024,
    });
  const lsRemote = pattern =>
    new Map(
      git('ls-remote', 'origin', pattern)
        .split('\n')
        .filter(Boolean)
        .map(line => line.split('\t'))
        .map(([sha, ref]) => [ref, sha])
    );

  git(
    'fetch',
    '--quiet',
    '--prune',
    '--filter=tree:0',
    'origin',
    '+refs/heads/*:refs/sweep/heads/*'
  );
  const branches = git(
    'for-each-ref',
    '--format=%(refname) %(objectname) %(committerdate:unix)',
    'refs/sweep/heads'
  )
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [ref, sha, seconds] = line.split(' ');
      return {
        name: ref.slice('refs/sweep/heads/'.length),
        sha,
        committedAtMs: Number(seconds) * 1000,
      };
    });
  const mainAncestors = new Set(
    git('rev-list', 'refs/sweep/heads/main').split('\n').filter(Boolean)
  );
  const pullHeads = new Map(
    [...lsRemote('refs/pull/*/head')].map(([ref, sha]) => [
      sha,
      ref.split('/')[2],
    ])
  );
  const openPullRequests = JSON.parse(
    execFileSync(
      'gh',
      [
        'pr',
        'list',
        '--state',
        'open',
        '--limit',
        '1000',
        '--json',
        'headRefName,headRefOid',
      ],
      { cwd: args.gitDir, encoding: 'utf8' }
    )
  );
  const keepBranches = args.keepFile
    ? readFileSync(args.keepFile, 'utf8')
        .split('\n')
        .map(line => line.trim())
    : [];

  const plan = planBranchSweep({
    branches,
    keepBranches,
    mainAncestors,
    nowMs: Date.now(),
    openPullRequests,
    pullHeads,
  });
  const receipt = {
    ...plan,
    apply: args.apply,
    startedAt: new Date().toISOString(),
    archived: 0,
    deleted: 0,
    rejected: [],
    finishedAt: null,
  };
  const push = (specs, extra = []) => {
    const result = spawnSync(
      'git',
      ['-C', args.gitDir, 'push', '--porcelain', 'origin', ...extra, ...specs],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
    );
    for (const line of result.stdout.split('\n'))
      if (line.startsWith('!')) receipt.rejected.push(line);
    return result.stdout.split('\n').filter(line => /^[*-]\t/.test(line))
      .length;
  };

  if (args.apply) {
    const toArchive = plan.items.filter(
      item => item.action === 'archive-delete'
    );
    for (const batch of chunk(toArchive, args.batch))
      receipt.archived += push(
        batch.map(item => `${item.sha}:${item.archiveRef}`)
      );
    const archivedRefs = lsRemote(`${ARCHIVE_PREFIX}*`);
    const deletions = verifiedDeletions(plan.items, archivedRefs);
    for (const batch of chunk(deletions, args.batch))
      receipt.deleted += push(
        batch.map(item => `:refs/heads/${item.name}`),
        batch.map(
          item => `--force-with-lease=refs/heads/${item.name}:${item.sha}`
        )
      );
  }
  receipt.finishedAt = new Date().toISOString();
  const summary = `${receipt.schema}: ${JSON.stringify(plan.counts)} apply=${args.apply} archived=${receipt.archived} deleted=${receipt.deleted} rejected=${receipt.rejected.length}`;
  console.log(summary);
  if (args.receipt)
    writeFileSync(args.receipt, `${JSON.stringify(receipt, null, 1)}\n`);
}

main();
