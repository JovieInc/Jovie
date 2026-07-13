#!/usr/bin/env node
/** Phase 2 of /drain: rebase stale BLOCKED agent PRs onto latest main. */
import { execFile, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
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

function hoursSince(isoTimestamp) {
  if (!isoTimestamp) return Number.POSITIVE_INFINITY;
  const deltaMs = Date.now() - Date.parse(isoTimestamp);
  if (!Number.isFinite(deltaMs)) return Number.POSITIVE_INFINITY;
  return deltaMs / (1000 * 60 * 60);
}

function runGit(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function runGh(args, cwd = process.cwd()) {
  return execFileSync('gh', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function ghJson(args) {
  const { stdout } = await execFileAsync('gh', args, {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

function tryMechanicalRebase({ repo, pr, baseRef, dryRun }) {
  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      reason: 'dry-run: would rebase onto origin/' + baseRef,
    };
  }

  const workdir = mkdtempSync(
    join(tmpdir(), `jovie-drain-rebase-${pr.number}-`)
  );
  try {
    runGh(['repo', 'clone', repo, '.', '--', '--no-tags'], workdir);
    runGit(
      ['fetch', 'origin', baseRef, pr.headRefName, '--depth', '80'],
      workdir
    );
    runGit(
      ['checkout', '-B', pr.headRefName, `origin/${pr.headRefName}`],
      workdir
    );
    try {
      runGit(['rebase', `origin/${baseRef}`], workdir);
    } catch (_error) {
      runGit(['rebase', '--abort'], workdir);
      return {
        ok: false,
        conflict: true,
        reason: 'rebase conflict — needs human resolution',
      };
    }

    runGit(
      ['push', '--force-with-lease', 'origin', `HEAD:${pr.headRefName}`],
      workdir
    );
    return {
      ok: true,
      dryRun: false,
      reason:
        'rebased onto origin/' + baseRef + ' and pushed --force-with-lease',
    };
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
}

async function labelPr(repo, prNumber, labelName) {
  await execFileAsync(
    'gh',
    ['pr', 'edit', String(prNumber), '-R', repo, '--add-label', labelName],
    { encoding: 'utf8' }
  );
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

async function fetchBaseRefName(repo, prNumber) {
  const pr = await ghJson([
    'pr',
    'view',
    String(prNumber),
    '-R',
    repo,
    '--json',
    'baseRefName',
  ]);
  return pr.baseRefName ?? 'main';
}

export async function remediateBlockedPrs(options) {
  const blocked = await listBlockedAgentPrs(options.repo, {
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

    const baseRef =
      options.baseRef === 'main'
        ? await fetchBaseRefName(options.repo, pr.number)
        : options.baseRef;

    const hours = hoursSince(pr.updatedAt);
    if (hours < options.cooldownHours) {
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

    const rebase = tryMechanicalRebase({
      repo: options.repo,
      pr,
      baseRef,
      dryRun: options.dryRun,
    });

    const item = {
      number: pr.number,
      headRefName: pr.headRefName,
      action: rebase.ok ? 'rebased' : 'rebase_failed',
      reason: rebase.reason,
      failures: pr.failures,
      conflict: Boolean(rebase.conflict),
      dryRun: Boolean(rebase.dryRun),
    };
    results.push(item);

    if (!rebase.ok) {
      if (!options.dryRun && rebase.conflict) {
        await labelPr(options.repo, pr.number, 'needs-conflict-resolution');
        await commentPr(
          options.repo,
          pr.number,
          '## Drain auto-rebase blocked\n\nAutomatic rebase onto latest `main` hit merge conflicts. Resolve conflicts locally, push, then re-enroll with the `merge-queue` label.'
        );
      }
      console.log(`    !! ${rebase.reason}`);
      continue;
    }

    applied += 1;

    if (!options.dryRun) {
      await labelPr(options.repo, pr.number, 'merge-queue');
      await commentPr(
        options.repo,
        pr.number,
        `## Drain auto-rebase\n\nRebased onto latest \`${baseRef}\` to re-trigger CI after a possible main-side fix.\n\nFailing checks before rebase: ${pr.failures.join(', ')}`
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
