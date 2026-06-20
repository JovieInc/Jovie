#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  detectChangedFileOverlap,
  detectIssueOverlap,
  fastTrackPolicy,
  formatBlockedByPrReason,
  isAutonomousBranch,
  MERGE_QUEUE_LABEL,
  NEEDS_CONFLICT_RESOLUTION_LABEL,
  parseMergeQueueTimeline,
  preQueueFreshnessDecision,
  requiredStatusDecision,
} from './lib/merge-queue-guard.mjs';

const repo = process.env.GH_REPO || process.env.REPO || 'JovieInc/Jovie';

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd ?? process.cwd(),
    encoding: 'utf8',
    timeout: options.timeout ?? 120_000,
    maxBuffer: options.maxBuffer ?? 20 * 1024 * 1024,
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function runStatus(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? process.cwd(),
    encoding: 'utf8',
    timeout: options.timeout ?? 120_000,
    maxBuffer: options.maxBuffer ?? 20 * 1024 * 1024,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function hasArg(args, flag) {
  return args.includes(flag);
}

function argValue(args, flag, fallback = undefined) {
  const index = args.indexOf(flag);
  return index === -1 ? fallback : args[index + 1];
}

function ghJson(args) {
  return JSON.parse(run('gh', args));
}

function labelNames(labels = []) {
  return labels.map(label => (typeof label === 'string' ? label : label.name));
}

function loadPr(prRef) {
  return ghJson([
    'pr',
    'view',
    prRef,
    '--repo',
    repo,
    '--json',
    'number,title,body,headRefName,headRefOid,headRepositoryOwner,baseRefName,isDraft,labels,statusCheckRollup,mergeStateStatus,url',
  ]);
}

function changedFilesForPr(prRef) {
  const output = run('gh', [
    'pr',
    'diff',
    String(prRef),
    '--repo',
    repo,
    '--name-only',
  ]);
  return output.split(/\r?\n/).filter(Boolean);
}

function listOpenAutonomousPrs(excludeNumber = null) {
  const prs = ghJson([
    'pr',
    'list',
    '--repo',
    repo,
    '--state',
    'open',
    '--base',
    'main',
    '--limit',
    '100',
    '--json',
    'number,title,headRefName,isDraft,labels',
  ]);
  return prs
    .filter(pr => pr.number !== excludeNumber)
    .filter(pr => isAutonomousBranch(pr.headRefName ?? ''))
    .map(pr => ({
      ...pr,
      changedFiles: changedFilesForPr(pr.number),
    }));
}

function comment(prNumber, body) {
  run(
    'gh',
    ['pr', 'comment', String(prNumber), '--repo', repo, '--body', body],
    {
      timeout: 60_000,
    }
  );
}

function editLabels(prNumber, args) {
  run('gh', ['pr', 'edit', String(prNumber), '--repo', repo, ...args], {
    timeout: 60_000,
  });
}

function telemetryMarker(payload) {
  return `<!-- merge-queue-telemetry ${JSON.stringify(payload)} -->`;
}

function ensureFreshHead(pr, { skipLocalGates }) {
  if (pr.baseRefName !== 'main') {
    return {
      behindBy: 0,
      pushedRebasedHead: false,
      rebaseAttempted: false,
      rebaseOk: true,
      note: `base branch ${pr.baseRefName} is not main; freshness rebase skipped`,
    };
  }

  const headRef = pr.headRefName;
  if (!headRef || headRef.startsWith('gtmq_')) {
    return {
      behindBy: 0,
      pushedRebasedHead: false,
      rebaseAttempted: false,
      rebaseOk: true,
      note: 'Graphite working branch; freshness rebase skipped',
    };
  }

  run(
    'git',
    [
      'fetch',
      'origin',
      '+refs/heads/main:refs/remotes/origin/main',
      `+refs/heads/${headRef}:refs/remotes/origin/${headRef}`,
    ],
    {
      timeout: 120_000,
    }
  );

  const tempRoot = mkdtempSync(join(tmpdir(), 'jovie-mq-'));
  const worktree = join(tempRoot, 'worktree');
  try {
    run('git', ['worktree', 'add', '--detach', worktree, `origin/${headRef}`], {
      timeout: 120_000,
    });
    const behindRaw = run('git', ['rev-list', '--count', 'HEAD..origin/main'], {
      cwd: worktree,
    });
    const behindBy = Number(behindRaw);
    if (!Number.isFinite(behindBy)) {
      return {
        behindBy: Number.NaN,
        pushedRebasedHead: false,
        rebaseAttempted: false,
        rebaseOk: false,
        note: `could not parse branch staleness: ${behindRaw}`,
      };
    }

    if (behindBy === 0) {
      return {
        behindBy,
        pushedRebasedHead: false,
        rebaseAttempted: false,
        rebaseOk: true,
        note: 'branch already contains current main',
      };
    }

    const rebase = runStatus('git', ['rebase', 'origin/main'], {
      cwd: worktree,
      timeout: 120_000,
    });
    if (rebase.status !== 0) {
      runStatus('git', ['rebase', '--abort'], {
        cwd: worktree,
        timeout: 30_000,
      });
      return {
        behindBy,
        pushedRebasedHead: false,
        rebaseAttempted: true,
        rebaseOk: false,
        note: `${rebase.stdout}\n${rebase.stderr}`.trim(),
      };
    }

    if (!skipLocalGates) {
      run('bash', ['scripts/automation-verify.sh', 'affected'], {
        cwd: worktree,
        timeout: 30 * 60 * 1000,
        stdio: 'inherit',
      });
    }

    run('git', ['push', '--force-with-lease', 'origin', `HEAD:${headRef}`], {
      cwd: worktree,
      timeout: 120_000,
    });

    return {
      behindBy,
      pushedRebasedHead: true,
      rebaseAttempted: true,
      rebaseOk: true,
      note: 'rebased on origin/main and pushed with force-with-lease',
    };
  } finally {
    runStatus('git', ['worktree', 'remove', '--force', worktree], {
      timeout: 60_000,
    });
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function runEnqueue(args) {
  const prRef = args[0];
  if (!prRef) {
    throw new Error('Usage: merge-queue-guard.mjs enqueue <pr-number-or-url>');
  }
  const dryRun =
    hasArg(args, '--dry-run') ||
    process.env.DRY_RUN === '1' ||
    process.env.DRY_RUN?.toLowerCase() === 'true';
  const skipLocalGates = hasArg(args, '--skip-local-gates');
  const pr = loadPr(prRef);
  const labels = new Set(labelNames(pr.labels));

  if (pr.isDraft) {
    console.log(`PR #${pr.number} is draft; not enqueuing.`);
    return;
  }
  if (['needs-human', 'hold', 'gated'].some(label => labels.has(label))) {
    console.log(`PR #${pr.number} has a blocking label; not enqueuing.`);
    return;
  }

  const fastPolicy = fastTrackPolicy(pr);
  if (fastPolicy.removeFast && !dryRun) {
    editLabels(pr.number, ['--remove-label', 'fast']);
    console.log(
      `Removed fast label from PR #${pr.number}: ${fastPolicy.reason}`
    );
  }

  const changedFiles = changedFilesForPr(pr.number);
  const overlap = detectChangedFileOverlap(
    changedFiles,
    listOpenAutonomousPrs(pr.number)
  );
  if (overlap.blocked && !fastPolicy.emergency) {
    const reason = formatBlockedByPrReason(overlap);
    console.log(reason);
    if (!dryRun) {
      comment(
        pr.number,
        [
          '## Merge Queue Deferred',
          '',
          'This PR was not added to Graphite because it overlaps an open autonomous PR.',
          '',
          '```text',
          reason,
          '```',
          '',
          telemetryMarker({
            event: 'blocked_by_pr',
            branchStalenessCommits: null,
            blockers: overlap.blockers.map(blocker => blocker.number),
          }),
        ].join('\n')
      );
    }
    return;
  }

  const freshness = ensureFreshHead(pr, { skipLocalGates });
  const decision = preQueueFreshnessDecision({
    behindBy: freshness.behindBy,
    rebaseAttempted: freshness.rebaseAttempted,
    rebaseOk: freshness.rebaseOk,
    pushedRebasedHead: freshness.pushedRebasedHead,
    requiredStatuses: pr.statusCheckRollup,
  });

  if (decision.action === 'block_conflict') {
    console.log(`PR #${pr.number} conflicts with current main; not enqueuing.`);
    if (!dryRun) {
      editLabels(pr.number, ['--add-label', NEEDS_CONFLICT_RESOLUTION_LABEL]);
      comment(
        pr.number,
        [
          '## Merge Queue Deferred',
          '',
          'Pre-queue freshness detected a merge conflict against current `main`.',
          '',
          'The `merge-queue` label was not applied. Rebase this branch on current `main`, resolve conflicts, and let CI rerun before enqueueing.',
          '',
          '```text',
          freshness.note || '(no conflict output captured)',
          '```',
          '',
          telemetryMarker({
            event: 'conflict_eviction',
            branchStalenessCommits: freshness.behindBy,
          }),
        ].join('\n')
      );
    }
    return;
  }

  if (decision.action !== 'enqueue') {
    console.log(`PR #${pr.number} not enqueued: ${decision.reason}`);
    if (freshness.pushedRebasedHead && !dryRun) {
      comment(
        pr.number,
        [
          '## Merge Queue Deferred',
          '',
          'Pre-queue freshness rebased this branch onto current `main` and pushed it back to the PR branch.',
          '',
          'The `merge-queue` label was not applied because required checks must rerun on the new head first.',
          '',
          telemetryMarker({
            event: 'rebased_before_enqueue',
            branchStalenessCommits: freshness.behindBy,
          }),
        ].join('\n')
      );
    }
    return;
  }

  const statuses = requiredStatusDecision(pr.statusCheckRollup);
  if (!statuses.ok) {
    console.log(
      `PR #${pr.number} required statuses are not green; not enqueuing.`
    );
    return;
  }

  if (dryRun) {
    console.log(`[dry-run] would add ${MERGE_QUEUE_LABEL} to PR #${pr.number}`);
    return;
  }

  editLabels(pr.number, ['--add-label', MERGE_QUEUE_LABEL]);
  comment(
    pr.number,
    telemetryMarker({
      event: 'enqueue',
      branchStalenessCommits: freshness.behindBy,
      speculativeRerun: false,
    })
  );
  console.log(`Added PR #${pr.number} to Graphite merge queue.`);
}

function runDispatchConflictCheck(args) {
  const candidatePath = argValue(args, '--candidate-json');
  if (!candidatePath) {
    throw new Error(
      'Usage: merge-queue-guard.mjs dispatch-conflicts --candidate-json <path>'
    );
  }
  const candidate = JSON.parse(readFileSync(candidatePath, 'utf8'));
  const result = detectIssueOverlap(candidate, listOpenAutonomousPrs(null));
  if (hasArg(args, '--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.blocked) {
    console.log(formatBlockedByPrReason(result));
  } else {
    console.log('No autonomous PR overlap detected.');
  }
  if (result.blocked) process.exitCode = 2;
}

function timelineForPr(number) {
  const pages = ghJson([
    'api',
    `repos/${repo}/issues/${number}/timeline?per_page=100`,
    '--paginate',
    '--slurp',
  ]);
  return pages.flat();
}

function runTelemetryReport(args) {
  const days = Number(argValue(args, '--days', '1'));
  const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const prs = ghJson([
    'pr',
    'list',
    '--repo',
    repo,
    '--state',
    'all',
    '--limit',
    '100',
    '--json',
    'number,title,url,state,createdAt,mergedAt,closedAt,labels',
  ]);

  const rows = prs
    .filter(pr => {
      const timestamp = pr.mergedAt || pr.closedAt || pr.createdAt;
      return timestamp && new Date(timestamp).getTime() >= sinceMs;
    })
    .map(pr => ({
      pr,
      metrics: parseMergeQueueTimeline(timelineForPr(pr.number)),
    }))
    .filter(
      row => row.metrics.queuedAt.length > 0 || row.metrics.dequeueCount > 0
    );

  const mergedDurations = rows
    .map(row => row.metrics.queuedToMergedSeconds)
    .filter(value => Number.isFinite(value));
  const averageSeconds =
    mergedDurations.length > 0
      ? Math.round(
          mergedDurations.reduce((sum, value) => sum + value, 0) /
            mergedDurations.length
        )
      : null;
  const totalConflictEvictions = rows.reduce(
    (sum, row) => sum + row.metrics.conflictEvictions,
    0
  );
  const totalCiEvictions = rows.reduce(
    (sum, row) => sum + row.metrics.ciEvictions,
    0
  );
  const totalRequeues = rows.reduce(
    (sum, row) => sum + row.metrics.requeueCount,
    0
  );

  const lines = [
    '# Merge Queue Daily Telemetry',
    '',
    `Window: last ${days} day(s)`,
    '',
    `- PRs with queue activity: ${rows.length}`,
    `- Average queued-to-merged: ${averageSeconds === null ? 'n/a' : `${Math.round(averageSeconds / 60)}m`}`,
    `- Conflict evictions: ${totalConflictEvictions}`,
    `- CI evictions: ${totalCiEvictions}`,
    `- Requeues: ${totalRequeues}`,
    '',
    '| PR | Requeues | Conflict Evictions | CI Evictions | Staleness At Enqueue | Queued To Merged |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
  ];

  for (const row of rows) {
    const minutes =
      row.metrics.queuedToMergedSeconds === null
        ? 'n/a'
        : `${Math.round(row.metrics.queuedToMergedSeconds / 60)}m`;
    lines.push(
      `| [#${row.pr.number}](${row.pr.url}) ${row.pr.title.replaceAll('|', '\\|')} | ${row.metrics.requeueCount} | ${row.metrics.conflictEvictions} | ${row.metrics.ciEvictions} | ${row.metrics.branchStalenessAtEnqueue ?? 'n/a'} | ${minutes} |`
    );
  }

  const report = `${lines.join('\n')}\n`;
  const output = argValue(args, '--output');
  if (output) {
    writeFileSync(output, report);
  }
  console.log(report);
}

function main() {
  const [, , command, ...args] = process.argv;
  switch (command) {
    case 'enqueue':
      runEnqueue(args);
      break;
    case 'dispatch-conflicts':
      runDispatchConflictCheck(args);
      break;
    case 'telemetry-report':
      runTelemetryReport(args);
      break;
    default:
      throw new Error(
        'Usage: merge-queue-guard.mjs <enqueue|dispatch-conflicts|telemetry-report>'
      );
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
