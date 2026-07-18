#!/usr/bin/env node
/** Phase 2 of /drain: rebase stale BLOCKED agent PRs onto their latest base. */
import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { tryGitHubRebase } from './lib/github-update-branch.mjs';
import { listBlockedAgentPrs } from './lib/pr-check-failures.mjs';

const execFileAsync = promisify(execFile);

function parseArgs(argv) {
  const options = {
    repo: process.env.REPO ?? process.env.GITHUB_REPOSITORY ?? 'JovieInc/Jovie',
    baseRef: 'main',
    dryRun: process.env.DRAIN_REMEDIATE_APPLY !== '1',
    maxPerRun: Number.parseInt(
      process.env.DRAIN_REMEDIATE_MAX_PER_RUN ?? '3',
      10
    ),
    cooldownHours: Number.parseInt(
      process.env.DRAIN_REMEDIATE_COOLDOWN_HOURS ?? '4',
      10
    ),
    limit: 200,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--repo':
        options.repo = argv[++index];
        break;
      case '--base':
        options.baseRef = argv[++index];
        break;
      case '--apply':
        options.dryRun = false;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--max-per-run':
        options.maxPerRun = Number.parseInt(argv[++index], 10);
        break;
      case '--cooldown-hours':
        options.cooldownHours = Number.parseInt(argv[++index], 10);
        break;
      case '--limit':
        options.limit = Number.parseInt(argv[++index], 10);
        break;
      case '--json':
        options.json = true;
        break;
      case '--help':
      case '-h':
        console.log(`Usage: node scripts/drain-pr-remediate.mjs [options]
  --apply / --dry-run
  --repo OWNER/REPO
  --base REF
  --max-per-run N
  --cooldown-hours N
  --limit N
  --json
`);
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(options.maxPerRun) || options.maxPerRun < 1) {
    throw new Error('--max-per-run must be a positive integer');
  }
  if (!Number.isInteger(options.cooldownHours) || options.cooldownHours < 0) {
    throw new Error('--cooldown-hours must be a non-negative integer');
  }

  return options;
}

function hoursSince(isoTimestamp, nowMs = Date.now()) {
  if (!isoTimestamp) return Number.POSITIVE_INFINITY;
  const deltaMs = nowMs - Date.parse(isoTimestamp);
  if (!Number.isFinite(deltaMs)) return Number.POSITIVE_INFINITY;
  return deltaMs / (1000 * 60 * 60);
}

function hasPrLabel(pr, labelName) {
  return (pr.labels ?? []).some(label => (label.name ?? label) === labelName);
}

async function labelPr(repo, prNumber, labelName) {
  await execFileAsync(
    'gh',
    ['pr', 'edit', String(prNumber), '-R', repo, '--add-label', labelName],
    { encoding: 'utf8' }
  );
}

async function removeLabelPr(repo, prNumber, labelName) {
  try {
    await execFileAsync(
      'gh',
      [
        'api',
        '-X',
        'DELETE',
        `repos/${repo}/issues/${prNumber}/labels/${encodeURIComponent(labelName)}`,
      ],
      { encoding: 'utf8' }
    );
  } catch (error) {
    const detail = `${error?.stderr ?? ''} ${error?.message ?? ''}`;
    if (/HTTP 404|Not Found/i.test(detail)) return;
    throw error;
  }
}

async function commentPr(repo, prNumber, body) {
  await execFileAsync(
    'bash',
    [
      join(
        dirname(fileURLToPath(import.meta.url)),
        'lib',
        'upsert-pr-comment.sh'
      ),
      String(prNumber),
      'drain-auto-rebase',
      body,
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, GITHUB_REPOSITORY: repo },
    }
  );
}

export async function remediateBlockedPrs(options, dependencies = {}) {
  const listBlockedAgentPrsImpl =
    dependencies.listBlockedAgentPrsImpl ?? listBlockedAgentPrs;
  const rebaseImpl = dependencies.rebaseImpl ?? tryGitHubRebase;
  const labelPrImpl = dependencies.labelPrImpl ?? labelPr;
  const removeLabelPrImpl = dependencies.removeLabelPrImpl ?? removeLabelPr;
  const commentPrImpl = dependencies.commentPrImpl ?? commentPr;
  const nowMs = dependencies.nowMs ?? Date.now();

  const blocked = await listBlockedAgentPrsImpl(options.repo, {
    limit: options.limit,
  });

  const results = [];
  let applied = 0;

  console.log('=== REMEDIATE (BLOCKED agent PRs → rebase onto main) ===');
  console.log(
    `mode=${options.dryRun ? 'dry-run' : 'apply'} maxPerRun=${options.maxPerRun} cooldownHours=${options.cooldownHours}`
  );

  for (const pr of blocked) {
    if (applied >= options.maxPerRun) {
      console.log(
        `  cap reached (${options.maxPerRun}/run); remaining candidates skipped`
      );
      break;
    }

    const hours = hoursSince(pr.updatedAt, nowMs);
    const hasConflictLabel = hasPrLabel(pr, 'needs-conflict-resolution');
    if (hours < options.cooldownHours && !hasConflictLabel) {
      const item = {
        number: pr.number,
        headRefName: pr.headRefName,
        action: 'skip_cooldown',
        reason: `head updated ${hours.toFixed(1)}h ago (< ${options.cooldownHours}h cooldown)`,
        failures: pr.failures,
      };
      results.push(item);
      console.log(
        `  #${pr.number} [${pr.headRefName}] skip cooldown (${hours.toFixed(1)}h) — ${pr.failures.join(', ')}`
      );
      continue;
    }

    console.log(
      `  #${pr.number} [${pr.headRefName}] rebase candidate — ${pr.failures.join(', ')}`
    );

    const rebase = await rebaseImpl({
      repo: options.repo,
      pr,
      expectedBaseRefName: options.baseRef === 'main' ? null : options.baseRef,
      dryRun: options.dryRun,
    });
    const baseRef = rebase.baseRefName ?? options.baseRef;

    const item = {
      number: pr.number,
      headRefName: pr.headRefName,
      action: rebase.ok
        ? rebase.updated
          ? 'rebased'
          : 'rebase_noop'
        : 'rebase_failed',
      reason: rebase.reason,
      failures: pr.failures,
      conflict: Boolean(rebase.conflict),
      dryRun: Boolean(rebase.dryRun),
      category: rebase.category ?? null,
      expectedHeadOid: rebase.expectedHeadOid ?? null,
      observedHeadOid: rebase.observedHeadOid ?? null,
    };
    results.push(item);

    if (!rebase.ok) {
      if (!options.dryRun && rebase.conflict) {
        await labelPrImpl(options.repo, pr.number, 'needs-conflict-resolution');
        await commentPrImpl(
          options.repo,
          pr.number,
          '## Drain auto-rebase blocked\n\nAutomatic rebase onto latest `main` hit merge conflicts. Resolve conflicts locally, push, then re-enroll with the `merge-queue` label.'
        );
      }
      console.log(`    !! ${rebase.reason}`);
      continue;
    }

    if (!rebase.updated) {
      if (!options.dryRun && hasConflictLabel) {
        await removeLabelPrImpl(
          options.repo,
          pr.number,
          'needs-conflict-resolution'
        );
      }
      console.log(`    - ${rebase.reason}`);
      continue;
    }

    applied += 1;

    if (!options.dryRun) {
      if (hasConflictLabel) {
        await removeLabelPrImpl(
          options.repo,
          pr.number,
          'needs-conflict-resolution'
        );
      }
      await labelPrImpl(options.repo, pr.number, 'merge-queue');
      await commentPrImpl(
        options.repo,
        pr.number,
        `## Drain auto-rebase\n\nGitHub Update Branch rebased the exact PR head onto latest \`${baseRef}\` to re-trigger CI after a possible main-side fix.\n\nHead: \`${rebase.expectedHeadOid}\` → \`${rebase.observedHeadOid}\`\n\nFailing checks before rebase: ${pr.failures.join(', ')}`
      );
      console.log(`    ✓ ${rebase.reason}; +merge-queue`);
    } else {
      console.log(`    [dry-run] ${rebase.reason}`);
    }
  }

  if (blocked.length === 0) {
    console.log('  (no blocked agent PRs)');
  }

  console.log(
    `=== remediate done (applied=${applied}, dryRun=${options.dryRun}) ===`
  );
  return { blocked: blocked.length, applied, results, dryRun: options.dryRun };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const summary = await remediateBlockedPrs(options);
  if (options.json) {
    console.log(JSON.stringify(summary));
  }
}

const isMain =
  process.argv[1] === fileURLToPath(import.meta.url) ||
  process.argv[1]?.endsWith('drain-pr-remediate.mjs');

if (isMain) {
  main().catch(error => {
    console.error(
      error instanceof Error ? (error.stack ?? error.message) : error
    );
    process.exit(1);
  });
}
